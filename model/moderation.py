"""
VoxAI Automated AI & Rule-Based Moderation Engine
=================================================
Monitors user chat queries for prohibited, toxic, or curse words.
Implements a strict Two-Strike Enforcement Policy:
1st Violation -> Official Warning Banner / Alert.
2nd Violation -> Instant, permanent hardware ban across IP and device fingerprint.

Cloud Persistence Architecture:
Multi-container AWS Lambda synchronization via Amazon S3 (s3://.../data/moderation_config.json).
Changes to prohibited words and strikes persist across Lambda container lifecycles.
"""

import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger("voxai.moderation")

# Default comprehensive baseline profanity and toxic terms list
DEFAULT_PROHIBITED_WORDS = [
    # English profanity & slurs
    "fuck", "fucking", "fucked", "fucker", "motherfucker",
    "shit", "bullshit", "bitch", "bitches", "bastard",
    "asshole", "dumbass", "jackass", "dipshit",
    "cunt", "dick", "dickhead", "cock", "pussy",
    "fag", "faggot", "nigger", "nigga", "slut", "whore",
    "kill yourself", "kys", "retard", "retarded",
    # Hindi / Regional abusive terms
    "chutiya", "chutya", "madarchod", "behenchod", "bhenchod",
    "bhosdike", "bhosadike", "gaand", "gandu", "harami", "kutta",
    "kamina", "randi", "saala", "bhadwa", "lauda", "lodu"
]

def _resolve_data_dir() -> str:
    is_lambda = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or os.environ.get("LAMBDA_TASK_ROOT"))
    if is_lambda:
        writable_dir = os.path.join("/tmp", "voxai_data")
        os.makedirs(writable_dir, exist_ok=True)
        return writable_dir
    base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    os.makedirs(base_dir, exist_ok=True)
    return base_dir

MODERATION_FILE = os.path.join(_resolve_data_dir(), "moderation_config.json")
_MODERATION_LOCK = threading.RLock()

# S3 Distributed Cloud Sync
_S3_CLIENT = None
_S3_BUCKET = os.environ.get("S3_DATA_BUCKET", "voxai-build-793168138957-ap-south-1")
_S3_KEY = "data/moderation_config.json"
_LAST_S3_SYNC = 0.0
_S3_SYNC_INTERVAL = 3.0  # Sync with S3 at most once every 3 seconds

def _get_s3_client():
    global _S3_CLIENT
    if _S3_CLIENT is None:
        try:
            import boto3
            _S3_CLIENT = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
        except Exception as e:
            logger.warning(f"Could not initialize S3 client for moderation sync: {e}")
            _S3_CLIENT = False
    return _S3_CLIENT if _S3_CLIENT is not False else None


class ModerationManager:
    """Thread-safe content moderation and strike enforcement manager with S3 cloud persistence."""

    def __init__(self):
        self._enabled: bool = True
        self._warning_threshold: int = 1  # 1 warning allowed; ban on 2nd offense
        self._prohibited_words: Set[str] = set()
        self._strikes: Dict[str, Dict[str, Any]] = {}
        self._incidents: List[Dict[str, Any]] = []
        self._load_from_disk(force=True)

    def _apply_dict(self, data: Dict[str, Any]) -> None:
        self._enabled = bool(data.get("enabled", True))
        self._warning_threshold = int(data.get("warning_threshold", 1))
        words = data.get("prohibited_words", [])
        self._prohibited_words = set(w.lower().strip() for w in words if w.strip())
        self._strikes = data.get("strikes", {})
        self._incidents = data.get("incidents", [])[-100:]

    def _load_from_disk(self, force: bool = False) -> None:
        global _LAST_S3_SYNC
        with _MODERATION_LOCK:
            now = time.time()
            s3 = _get_s3_client()

            # 1. Check permanent S3 storage
            if s3 and _S3_BUCKET and (force or (now - _LAST_S3_SYNC > _S3_SYNC_INTERVAL)):
                try:
                    res = s3.get_object(Bucket=_S3_BUCKET, Key=_S3_KEY)
                    data = json.loads(res["Body"].read().decode("utf-8"))
                    _LAST_S3_SYNC = now
                    self._apply_dict(data)
                    # Cache locally
                    try:
                        with open(MODERATION_FILE, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2)
                    except Exception:
                        pass
                    return
                except Exception:
                    pass  # Fall back to local disk or defaults

            # 2. Local disk fallback
            if os.path.exists(MODERATION_FILE):
                try:
                    with open(MODERATION_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self._apply_dict(data)
                    return
                except Exception as e:
                    logger.warning(f"Could not load moderation_config.json: {e}")

            # 3. Defaults initialization
            self._enabled = True
            self._warning_threshold = 1
            self._prohibited_words = set(DEFAULT_PROHIBITED_WORDS)
            self._strikes = {}
            self._incidents = []
            self._save_to_disk()

    def _save_to_disk(self) -> None:
        with _MODERATION_LOCK:
            data = {
                "enabled": self._enabled,
                "warning_threshold": self._warning_threshold,
                "prohibited_words": sorted(list(self._prohibited_words)),
                "strikes": self._strikes,
                "incidents": self._incidents[-100:],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            # Local atomic write
            try:
                temp_path = MODERATION_FILE + ".tmp"
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                os.replace(temp_path, MODERATION_FILE)
            except Exception as e:
                logger.error(f"Failed to persist moderation_config.json: {e}")

            # Permanent Cloud S3 write
            s3 = _get_s3_client()
            if s3 and _S3_BUCKET:
                try:
                    s3.put_object(
                        Bucket=_S3_BUCKET,
                        Key=_S3_KEY,
                        Body=json.dumps(data, indent=2).encode("utf-8"),
                        ContentType="application/json"
                    )
                except Exception as e:
                    logger.warning(f"Failed to sync moderation_config to S3: {e}")

    def force_s3_sync(self) -> bool:
        """Forces immediate pull and push with Amazon S3."""
        self._load_from_disk(force=True)
        self._save_to_disk()
        return True

    def _normalize_text(self, text: str) -> str:
        s = text.lower()
        substitutions = {"@": "a", "$": "s", "1": "i", "!": "i", "0": "o", "3": "e", "5": "s"}
        for char, repl in substitutions.items():
            s = s.replace(char, repl)
        return s

    def find_prohibited_terms(self, text: str) -> List[str]:
        if not text or not self._enabled:
            return []

        self._load_from_disk(force=False)
        normalized = self._normalize_text(text)
        detected = []

        with _MODERATION_LOCK:
            words = list(self._prohibited_words)

        for word in words:
            pattern = r"(?i)(?:\b|_)" + re.escape(word) + r"(?:\b|_)"
            if re.search(pattern, normalized) or re.search(pattern, text):
                detected.append(word)

        return list(set(detected))

    def evaluate_query(
        self,
        text: str,
        client_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        device_fingerprint: Optional[str] = None
    ) -> Dict[str, Any]:
        if not self._enabled or not text:
            return {"is_violation": False, "action": "allow", "detected_words": []}

        detected = self.find_prohibited_terms(text)
        if not detected:
            return {"is_violation": False, "action": "allow", "detected_words": []}

        ident_key = device_fingerprint or client_ip or client_id or "unknown_identity"

        with _MODERATION_LOCK:
            record = self._strikes.get(ident_key, {
                "strike_count": 0,
                "first_offense_at": datetime.now(timezone.utc).isoformat(),
                "client_id": client_id,
                "client_ip": client_ip,
                "device_fingerprint": device_fingerprint,
                "offenses": []
            })

            record["strike_count"] += 1
            current_strikes = record["strike_count"]
            record["last_offense_at"] = datetime.now(timezone.utc).isoformat()
            record["offenses"].append({
                "detected": detected,
                "sample_query": text[:120],
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            self._strikes[ident_key] = record

            action = "ban" if current_strikes > self._warning_threshold else "warn"
            incident = {
                "incident_id": f"inc_{int(datetime.now().timestamp() * 1000)}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "ident_key": ident_key,
                "client_id": client_id,
                "client_ip": client_ip,
                "device_fingerprint": device_fingerprint,
                "detected_words": detected,
                "query_snippet": text[:120],
                "strike_number": current_strikes,
                "action": action
            }
            self._incidents.append(incident)
            self._save_to_disk()

        words_str = ", ".join(f'"{w}"' for w in detected)

        if action == "warn":
            msg = (
                f"⚠️ Policy Warning (Strike 1/{self._warning_threshold + 1}): "
                f"Prohibited language detected ({words_str}). "
                "This is your official warning. Continued use of abusive words will permanently ban your device."
            )
            return {
                "is_violation": True,
                "action": "warn",
                "detected_words": detected,
                "strike_count": current_strikes,
                "warning_message": msg,
                "reason": f"Prohibited language violation: {words_str}"
            }

        ban_reason = (
            f"Automated Policy Enforcement: Repeated use of prohibited language ({words_str}) "
            f"after prior strike warning."
        )
        return {
            "is_violation": True,
            "action": "ban",
            "detected_words": detected,
            "strike_count": current_strikes,
            "warning_message": "Access Terminated: Device permanently banned for repeated policy violations.",
            "reason": ban_reason
        }

    # Administrative API Methods
    def get_moderation_data(self) -> Dict[str, Any]:
        self._load_from_disk(force=False)
        with _MODERATION_LOCK:
            return {
                "enabled": self._enabled,
                "warning_threshold": self._warning_threshold,
                "prohibited_words": sorted(list(self._prohibited_words)),
                "total_words": len(self._prohibited_words),
                "total_incidents": len(self._incidents),
                "active_strikes_count": len(self._strikes),
                "strikes": self._strikes,
                "incidents": list(reversed(self._incidents[-50:]))
            }

    def update_settings(self, enabled: Optional[bool] = None, warning_threshold: Optional[int] = None) -> None:
        with _MODERATION_LOCK:
            if enabled is not None:
                self._enabled = bool(enabled)
            if warning_threshold is not None:
                self._warning_threshold = max(0, int(warning_threshold))
            self._save_to_disk()

    def add_words(self, words: List[str]) -> List[str]:
        self._load_from_disk(force=True)
        added = []
        with _MODERATION_LOCK:
            for w in words:
                cleaned = w.lower().strip()
                if cleaned and cleaned not in self._prohibited_words:
                    self._prohibited_words.add(cleaned)
                    added.append(cleaned)
            self._save_to_disk()
        return added

    def remove_word(self, word: str) -> bool:
        self._load_from_disk(force=True)
        cleaned = word.lower().strip()
        with _MODERATION_LOCK:
            if cleaned in self._prohibited_words:
                self._prohibited_words.remove(cleaned)
                self._save_to_disk()
                return True
        return False

    def reset_words_to_default(self) -> None:
        with _MODERATION_LOCK:
            self._prohibited_words = set(DEFAULT_PROHIBITED_WORDS)
            self._save_to_disk()

    def clear_strikes(self, ident_key: Optional[str] = None) -> int:
        self._load_from_disk(force=True)
        with _MODERATION_LOCK:
            if ident_key:
                removed = 1 if self._strikes.pop(ident_key, None) else 0
            else:
                removed = len(self._strikes)
                self._strikes.clear()
            self._save_to_disk()
            return removed


_MODERATION_INSTANCE = None
_INIT_LOCK = threading.Lock()

def get_moderation_manager() -> ModerationManager:
    global _MODERATION_INSTANCE
    if _MODERATION_INSTANCE is None:
        with _INIT_LOCK:
            if _MODERATION_INSTANCE is None:
                _MODERATION_INSTANCE = ModerationManager()
    return _MODERATION_INSTANCE
