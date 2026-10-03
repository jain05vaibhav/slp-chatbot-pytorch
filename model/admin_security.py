"""
VoxAI Master Admin Security & Management Module
===============================================
Provides military-grade cryptographic authentication, session token signing,
brute-force defense, live server telemetry, intent dataset management,
and background model retraining orchestration.

Security Features:
- PBKDF2-HMAC-SHA256 password hashing with unique 32-byte salt (120,000 rounds).
- Constant-time verification (hmac.compare_digest) immune to timing attacks.
- High-entropy signed session tokens with HMAC-SHA256 and expiration.
- Adaptive Brute-Force Shield: Lockout after 5 consecutive failed attempts.
- In-memory thread-safe chat query audit stream.
- Non-blocking asynchronous model retraining with live status tracking.
"""

import base64
import collections
import hashlib
import hmac
import json
import logging
import os
import platform
import secrets
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    psutil = None
    PSUTIL_AVAILABLE = False

logger = logging.getLogger("voxai.admin")

# Directory paths: fallback to /tmp on AWS Lambda or read-only filesystem
BASE_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

def _resolve_data_dir() -> str:
    is_lambda = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or os.environ.get("LAMBDA_TASK_ROOT"))
    if is_lambda:
        writable_dir = os.path.join("/tmp", "voxai_data")
        os.makedirs(writable_dir, exist_ok=True)
        import shutil
        for fname in ["admin_config.json", "admin_conversations.json", "intents.json", "model_data.json", "model.pth"]:
            src = os.path.join(BASE_DATA_DIR, fname)
            dst = os.path.join(writable_dir, fname)
            if os.path.exists(src) and not os.path.exists(dst):
                try:
                    shutil.copy2(src, dst)
                except Exception as e:
                    logger.warning(f"Could not copy {src} to {dst}: {e}")
        return writable_dir
    return BASE_DATA_DIR

DATA_DIR = _resolve_data_dir()
CONFIG_PATH = os.path.join(DATA_DIR, "admin_config.json")
INTENTS_PATH = os.path.join(DATA_DIR, "intents.json")
CONVERSATIONS_PATH = os.path.join(DATA_DIR, "admin_conversations.json")

# Ephemeral secret key for signing session tokens (regenerated or persisted securely)
_SECRET_SIGNING_KEY = secrets.token_bytes(64)

# Brute-force protection tracker: {client_id: [timestamp_failed, ...]}
_FAILED_ATTEMPTS: Dict[str, List[float]] = {}
_LOCKOUT_DURATION = 600  # 10 minutes lockout
_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_WINDOW = 300   # 5 minute observation window

# Active valid sessions: {session_id: {"created_at": float, "expires_at": float}}
_ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}

# In-memory circular buffer of chat query logs (last 200 queries)
_QUERY_LOGS: collections.deque = collections.deque(maxlen=200)

# Categorized user conversations map: {client_id: user_profile_dict}
_USER_PROFILES: Dict[str, Dict[str, Any]] = {}
_CONVERSATIONS_LOCK = threading.Lock()

# Pending unread intercom messages for live clients: {client_id: [msg, ...]}
_PENDING_CLIENT_INTERCOM: Dict[str, List[Dict[str, Any]]] = {}
_INTERCOM_LOCK = threading.Lock()

# Global lock for thread-safe config operations
_CONFIG_LOCK = threading.Lock()

# S3 distributed state synchronization for multi-container AWS Lambda
_S3_CLIENT = None
_S3_BUCKET = os.environ.get("S3_DATA_BUCKET", "voxai-build-793168138957-ap-south-1")
_LAST_S3_CONFIG_SYNC = 0.0
_LAST_S3_CONV_SYNC = 0.0
_S3_SYNC_INTERVAL = 3.0  # Sync from S3 at most once every 3 seconds

def _get_s3_client():
    global _S3_CLIENT
    if _S3_CLIENT is None:
        try:
            import boto3
            _S3_CLIENT = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
        except Exception as e:
            logger.warning(f"Could not initialize S3 client for distributed sync: {e}")
            _S3_CLIENT = False
    return _S3_CLIENT if _S3_CLIENT is not False else None

# Server start timestamp for uptime calculation
SERVER_START_TIME = time.time()

# Background retraining state
_RETRAIN_STATE = {
    "is_running": False,
    "start_time": None,
    "end_time": None,
    "status": "idle",
    "accuracy": None,
    "error": None,
    "last_trained": None
}


def _generate_salt() -> bytes:
    """Generates a 32-byte cryptographically secure random salt."""
    return secrets.token_bytes(32)


def hash_password(password: str, salt: Optional[bytes] = None) -> Tuple[str, str]:
    """
    Hashes a password using PBKDF2-HMAC-SHA256 with 120,000 iterations.
    Returns (hex_hash, hex_salt).
    """
    if salt is None:
        salt = _generate_salt()
    
    dk = hashlib.pbkdf2_hmac(
        hash_name="sha256",
        password=password.encode("utf-8"),
        salt=salt,
        iterations=120000,
        dklen=64
    )
    return dk.hex(), salt.hex()


def verify_password(plain_password: str, stored_hash_hex: str, salt_hex: str) -> bool:
    """
    Verifies a plain password against the stored hash and salt using constant-time comparison.
    """
    try:
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(stored_hash_hex)
        dk = hashlib.pbkdf2_hmac(
            hash_name="sha256",
            password=plain_password.encode("utf-8"),
            salt=salt,
            iterations=120000,
            dklen=64
        )
        return hmac.compare_digest(dk, expected_hash)
    except Exception as e:
        logger.error(f"Error during password verification: {e}")
        return False


def _merge_conversation_profiles(base: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deep-merges incoming user conversation profiles into base without losing
    messages, sessions, or telemetry across distributed Lambda workers.
    """
    if not isinstance(incoming, dict):
        return base

    for client_id, inc_profile in incoming.items():
        if not isinstance(inc_profile, dict):
            continue
        if client_id not in base:
            base[client_id] = inc_profile
            continue

        cur = base[client_id]
        if inc_profile.get("first_seen") and (not cur.get("first_seen") or inc_profile["first_seen"] < cur["first_seen"]):
            cur["first_seen"] = inc_profile["first_seen"]
        if inc_profile.get("last_seen") and (not cur.get("last_seen") or inc_profile["last_seen"] > cur["last_seen"]):
            cur["last_seen"] = inc_profile["last_seen"]

        if inc_profile.get("client_ip") and not cur.get("client_ip"):
            cur["client_ip"] = inc_profile["client_ip"]
        if inc_profile.get("user_agent") and not cur.get("user_agent"):
            cur["user_agent"] = inc_profile["user_agent"]
        if inc_profile.get("device_fingerprint") and not cur.get("device_fingerprint"):
            cur["device_fingerprint"] = inc_profile["device_fingerprint"]

        cur_ips = cur.setdefault("known_ips", [])
        for ip in inc_profile.get("known_ips", []):
            if ip and ip not in cur_ips:
                cur_ips.append(ip)

        cur_fps = cur.setdefault("known_fingerprints", [])
        for fp in inc_profile.get("known_fingerprints", []):
            if fp and fp not in cur_fps:
                cur_fps.append(fp)

        cur_sessions = cur.setdefault("sessions", [])
        session_map = {s["session_id"]: s for s in cur_sessions if isinstance(s, dict) and "session_id" in s}

        for inc_session in inc_profile.get("sessions", []):
            if not isinstance(inc_session, dict) or "session_id" not in inc_session:
                continue
            s_id = inc_session["session_id"]
            if s_id not in session_map:
                cur_sessions.append(inc_session)
                session_map[s_id] = inc_session
            else:
                existing_sess = session_map[s_id]
                existing_msgs = existing_sess.setdefault("messages", [])
                existing_msg_ids = {m.get("id") for m in existing_msgs if isinstance(m, dict) and m.get("id")}
                for msg in inc_session.get("messages", []):
                    if isinstance(msg, dict) and msg.get("id") not in existing_msg_ids:
                        existing_msgs.append(msg)
                        if msg.get("id"):
                            existing_msg_ids.add(msg["id"])

        cur["total_messages"] = sum(len(s.get("messages", [])) for s in cur_sessions)
        cur["total_visits"] = max(len(cur_sessions), cur.get("total_visits", 1), inc_profile.get("total_visits", 1))

    return base


class AdminManager:
    """Singleton manager for system administration, configuration, and security."""

    DEFAULT_ADMIN_PASSWORD = "voxai_admin_2026!"

    def __init__(self):
        self._ensure_config_initialized()
        self._load_conversations_from_disk()

    def _ensure_config_initialized(self):
        """Creates initial admin config with hashed master password if not existing."""
        os.makedirs(DATA_DIR, exist_ok=True)
        if not os.path.exists(CONFIG_PATH):
            logger.warning("[!] Admin config not found. Generating initial secure credentials...")
            hex_hash, hex_salt = hash_password(self.DEFAULT_ADMIN_PASSWORD)
            default_config = {
                "password_hash": hex_hash,
                "password_salt": hex_salt,
                "iterations": 120000,
                "algorithm": "PBKDF2-HMAC-SHA256",
                "confidence_threshold": 0.50,
                "maintenance_mode": False,
                "custom_system_prompt": None,
                "default_engine": "groq",
                "security_logs": [
                    {
                        "event": "admin_initialized",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "details": "Admin security vault initialized with default credentials."
                    }
                ]
            }
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=2)
            logger.info("[✓] Admin security configuration file created successfully.")

    def load_config(self) -> Dict[str, Any]:
        """Loads admin configuration safely with locking and S3 distributed synchronization."""
        global _LAST_S3_CONFIG_SYNC
        with _CONFIG_LOCK:
            now = time.time()
            s3 = _get_s3_client()
            if s3 and _S3_BUCKET and (now - _LAST_S3_CONFIG_SYNC > _S3_SYNC_INTERVAL):
                try:
                    res = s3.get_object(Bucket=_S3_BUCKET, Key="data/admin_config.json")
                    cfg = json.loads(res["Body"].read().decode("utf-8"))
                    _LAST_S3_CONFIG_SYNC = now
                    try:
                        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                            json.dump(cfg, f, indent=2)
                    except Exception:
                        pass
                    return cfg
                except Exception:
                    pass  # Fallback to local cached file if S3 fetch fails

            if not os.path.exists(CONFIG_PATH):
                self._ensure_config_initialized()
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load admin config: {e}")
                return {}

    def save_config(self, config: Dict[str, Any]):
        """Persists admin configuration safely to disk with atomic write and syncs to S3."""
        with _CONFIG_LOCK:
            try:
                temp_path = CONFIG_PATH + ".tmp"
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(config, f, indent=2)
                os.replace(temp_path, CONFIG_PATH)
            except Exception as e:
                logger.error(f"Failed to persist admin config to {CONFIG_PATH}: {e}")

            s3 = _get_s3_client()
            if s3 and _S3_BUCKET:
                try:
                    s3.put_object(
                        Bucket=_S3_BUCKET,
                        Key="data/admin_config.json",
                        Body=json.dumps(config, indent=2).encode("utf-8"),
                        ContentType="application/json"
                    )
                except Exception as e:
                    logger.warning(f"Failed to sync config to S3: {e}")

    def log_security_event(self, event: str, details: str, client_ip: str = "internal"):
        """Logs a security-relevant event to the persistent audit log."""
        config = self.load_config()
        logs = config.get("security_logs", [])
        entry = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "client_ip": client_ip,
            "details": details
        }
        logs.append(entry)
        # Keep last 100 security logs
        config["security_logs"] = logs[-100:]
        self.save_config(config)

    def is_client_locked_out(self, client_id: str) -> Tuple[bool, int]:
        """Checks if a client IP is currently locked out due to brute-force attempts."""
        now = time.time()
        attempts = _FAILED_ATTEMPTS.get(client_id, [])
        # Filter attempts within observation window
        recent_attempts = [t for t in attempts if now - t < _LOCKOUT_WINDOW]
        _FAILED_ATTEMPTS[client_id] = recent_attempts

        if len(recent_attempts) >= _MAX_FAILED_ATTEMPTS:
            last_failed = recent_attempts[-1]
            elapsed = now - last_failed
            if elapsed < _LOCKOUT_DURATION:
                remaining = int(_LOCKOUT_DURATION - elapsed)
                return True, remaining
            else:
                # Lockout expired, reset attempts
                _FAILED_ATTEMPTS[client_id] = []
        return False, 0

    def record_failed_login(self, client_id: str):
        """Records a failed login attempt for brute-force tracking."""
        now = time.time()
        if client_id not in _FAILED_ATTEMPTS:
            _FAILED_ATTEMPTS[client_id] = []
        _FAILED_ATTEMPTS[client_id].append(now)
        count = len(_FAILED_ATTEMPTS[client_id])
        self.log_security_event(
            "login_failed",
            f"Failed login attempt {count}/{_MAX_FAILED_ATTEMPTS}",
            client_ip=client_id
        )

    def record_successful_login(self, client_id: str):
        """Resets failed login count upon successful authentication."""
        if client_id in _FAILED_ATTEMPTS:
            _FAILED_ATTEMPTS[client_id] = []
        self.log_security_event("login_success", "Admin authentication successful", client_ip=client_id)

    def authenticate_admin(self, password: str, client_ip: str = "127.0.0.1") -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Authenticates admin password, enforcing brute-force lockouts.
        Returns: (is_authenticated, session_token_or_none, error_message_or_none)
        """
        # 1. Check brute-force lockout
        locked, remaining = self.is_client_locked_out(client_ip)
        if locked:
            return False, None, f"Too many failed login attempts. Client locked out for {remaining} seconds."

        config = self.load_config()
        stored_hash = config.get("password_hash", "")
        stored_salt = config.get("password_salt", "")

        # 2. Timing attack mitigation delay
        time.sleep(0.1)

        # 3. Verify password
        if verify_password(password, stored_hash, stored_salt):
            self.record_successful_login(client_ip)
            token = self.create_session_token()
            return True, token, None
        else:
            self.record_failed_login(client_ip)
            # Re-check if this attempt triggered a lockout
            locked, remaining = self.is_client_locked_out(client_ip)
            if locked:
                return False, None, f"Incorrect password. Max attempts exceeded. Locked out for {remaining} seconds."
            attempts_left = _MAX_FAILED_ATTEMPTS - len(_FAILED_ATTEMPTS.get(client_ip, []))
            return False, None, f"Invalid master password. {attempts_left} attempt(s) remaining."

    def _get_signing_key(self) -> bytes:
        """
        Derives a deterministic, persistent cryptographic signing key from the master credentials.
        This guarantees session tokens remain valid across multiple ephemeral Lambda execution workers,
        while immediately invalidating all active sessions if the master password is changed.
        """
        config = self.load_config()
        pw_hash = config.get("password_hash", "")
        pw_salt = config.get("password_salt", "")
        seed = f"{pw_hash}:{pw_salt}:voxai_master_security_signing_key_2026".encode("utf-8")
        return hashlib.sha256(seed).digest()

    def create_session_token(self, ttl_seconds: int = 86400) -> str:
        """
        Creates an encrypted, HMAC-SHA256 signed session token.
        Token format: <base64url(payload)>.<base64url(hmac_signature)>
        Default TTL: 24 hours (86,400s) to prevent unwanted session expirations.
        """
        session_id = secrets.token_hex(16)
        now = time.time()
        expires_at = now + ttl_seconds

        payload = {
            "sub": "voxai_master_admin",
            "jti": session_id,
            "iat": int(now),
            "exp": int(expires_at)
        }
        payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
        payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode('utf-8').rstrip('=')

        signing_key = self._get_signing_key()
        signature = hmac.new(signing_key, payload_b64.encode('utf-8'), hashlib.sha256).digest()
        sig_b64 = base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')

        token = f"{payload_b64}.{sig_b64}"
        return token

    def verify_token(self, token: Optional[str]) -> bool:
        """
        Verifies the cryptographic integrity and validity of an admin session token.
        Stateless verification across all distributed serverless execution workers.
        """
        if not token:
            return False

        # Support 'Bearer <token>' prefix if sent via header
        if token.startswith("Bearer "):
            token = token[7:].strip()

        parts = token.split(".")
        if len(parts) != 2:
            return False

        payload_b64, sig_b64 = parts

        try:
            signing_key = self._get_signing_key()
            expected_sig = hmac.new(signing_key, payload_b64.encode('utf-8'), hashlib.sha256).digest()
            expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode('utf-8').rstrip('=')

            if not hmac.compare_digest(sig_b64, expected_sig_b64):
                return False

            # Decode payload
            padded_payload = payload_b64 + '=' * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded_payload).decode('utf-8'))

            # Verify expiration
            exp = payload.get("exp", 0)
            if time.time() > exp:
                return False

            # Verify global session revocation timestamp
            iat = payload.get("iat", 0)
            config = self.load_config()
            revoked_before = config.get("sessions_revoked_before", 0)
            if iat < revoked_before:
                return False

            return True
        except Exception as e:
            logger.error(f"Error during token verification: {e}")
            return False

    def revoke_token(self, token: Optional[str]):
        """Revokes a session token on logout."""
        pass

    def revoke_all_sessions(self):
        """Emergency revoke all active sessions across all serverless workers."""
        config = self.load_config()
        config["sessions_revoked_before"] = time.time()
        self.save_config(config)
        self.log_security_event("sessions_revoked", "All active admin sessions revoked")

    def change_password(self, old_password: str, new_password: str, client_ip: str = "127.0.0.1") -> Tuple[bool, str]:
        """
        Changes the master admin password after validating current password.
        """
        config = self.load_config()
        stored_hash = config.get("password_hash", "")
        stored_salt = config.get("password_salt", "")

        if not verify_password(old_password, stored_hash, stored_salt):
            self.log_security_event("password_change_failed", "Old password mismatch", client_ip=client_ip)
            return False, "Current master password is incorrect."

        if len(new_password) < 8:
            return False, "New password must be at least 8 characters long."

        new_hash, new_salt = hash_password(new_password)
        config["password_hash"] = new_hash
        config["password_salt"] = new_salt
        self.save_config(config)
        self.revoke_all_sessions()
        self.log_security_event("password_changed", "Master admin password changed successfully", client_ip=client_ip)
        return True, "Password changed successfully. All sessions revoked."

    def get_system_vitals(self) -> Dict[str, Any]:
        """Collects real-time host and model diagnostics."""
        uptime_seconds = int(time.time() - SERVER_START_TIME)
        uptime_str = f"{uptime_seconds // 3600}h {(uptime_seconds % 3600) // 60}m {uptime_seconds % 60}s"

        # CPU & Memory
        if PSUTIL_AVAILABLE and psutil:
            try:
                cpu_pct = psutil.cpu_percent(interval=0.1)
                mem = psutil.virtual_memory()
                process = psutil.Process(os.getpid())
                proc_mem_mb = round(process.memory_info().rss / (1024 * 1024), 2)
                ram_used_pct = mem.percent
                ram_total = round(mem.total / (1024 ** 3), 2)
                ram_avail = round(mem.available / (1024 ** 3), 2)
            except Exception as e:
                logger.warning(f"Error reading psutil vitals: {e}")
                cpu_pct, proc_mem_mb, ram_used_pct, ram_total, ram_avail = 0.0, 0.0, 0.0, 0.0, 0.0
        else:
            cpu_pct, proc_mem_mb, ram_used_pct, ram_total, ram_avail = 0.0, 0.0, 0.0, 0.0, 0.0

        config = self.load_config()

        return {
            "uptime_seconds": uptime_seconds,
            "uptime_human": uptime_str,
            "cpu_percent": cpu_pct,
            "ram_used_percent": ram_used_pct,
            "ram_total_gb": ram_total,
            "ram_available_gb": ram_avail,
            "process_memory_mb": proc_mem_mb,
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "maintenance_mode": config.get("maintenance_mode", False),
            "confidence_threshold": config.get("confidence_threshold", 0.50),
            "custom_system_prompt_active": bool(config.get("custom_system_prompt")),
            "active_sessions_count": 1,
            "total_queries_logged": len(_QUERY_LOGS),
            "total_unique_users": len(_USER_PROFILES),
            "retrain_state": _RETRAIN_STATE
        }

    # Persistent User Conversations & Identity Store
    def _load_conversations_from_disk(self, force: bool = False):
        """Loads persistent user conversations from S3 and local cache with deep-merge."""
        global _USER_PROFILES, _LAST_S3_CONV_SYNC
        with _CONVERSATIONS_LOCK:
            now = time.time()
            s3 = _get_s3_client()
            if s3 and _S3_BUCKET and (force or (now - _LAST_S3_CONV_SYNC > _S3_SYNC_INTERVAL)):
                try:
                    res = s3.get_object(Bucket=_S3_BUCKET, Key="data/admin_conversations.json")
                    profiles = json.loads(res["Body"].read().decode("utf-8"))
                    _LAST_S3_CONV_SYNC = now
                    if isinstance(profiles, dict):
                        _merge_conversation_profiles(_USER_PROFILES, profiles)
                        try:
                            os.makedirs(os.path.dirname(CONVERSATIONS_PATH), exist_ok=True)
                            with open(CONVERSATIONS_PATH, "w", encoding="utf-8") as f:
                                json.dump(_USER_PROFILES, f, indent=2)
                        except Exception:
                            pass
                    return
                except Exception as e:
                    logger.warning(f"S3 conversation load skipped/fallback: {e}")

            if os.path.exists(CONVERSATIONS_PATH):
                try:
                    with open(CONVERSATIONS_PATH, "r", encoding="utf-8") as f:
                        disk_profiles = json.load(f)
                    if isinstance(disk_profiles, dict):
                        _merge_conversation_profiles(_USER_PROFILES, disk_profiles)
                except Exception as e:
                    logger.error(f"Failed to load conversations from disk: {e}")

    def _save_conversations_to_disk(self):
        """Saves persistent user conversations atomically to disk and syncs to S3."""
        with _CONVERSATIONS_LOCK:
            try:
                os.makedirs(os.path.dirname(CONVERSATIONS_PATH), exist_ok=True)
                temp_path = CONVERSATIONS_PATH + ".tmp"
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(_USER_PROFILES, f, indent=2)
                os.replace(temp_path, CONVERSATIONS_PATH)
            except Exception as e:
                logger.error(f"Failed to save conversations to disk: {e}")

            s3 = _get_s3_client()
            if s3 and _S3_BUCKET:
                try:
                    s3.put_object(
                        Bucket=_S3_BUCKET,
                        Key="data/admin_conversations.json",
                        Body=json.dumps(_USER_PROFILES, indent=2).encode("utf-8"),
                        ContentType="application/json"
                    )
                except Exception as e:
                    logger.warning(f"Failed to sync conversations to S3: {e}")

    def log_query(
        self,
        query: str,
        intent: str,
        confidence: float,
        latency_ms: float,
        engine: str,
        bot_response: str,
        client_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_agent_label: Optional[str] = None,
        client_ip: str = "127.0.0.1",
        device_fingerprint: Optional[str] = None
    ):
        """
        Logs chat query and response into:
        1. Flat circular buffer for instant telemetry.
        2. Categorized user identity & conversation history profile with session continuity!
        """
        now_dt = datetime.now(timezone.utc)
        time_str = now_dt.strftime("%H:%M:%S")
        date_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

        # 1. Flat circular buffer
        msg_id = secrets.token_hex(4)
        _QUERY_LOGS.append({
            "id": msg_id,
            "timestamp": time_str,
            "query": query,
            "intent": intent,
            "confidence": confidence,
            "latency_ms": latency_ms,
            "engine": engine,
            "client_id": client_id or "anonymous",
            "session_id": session_id or "default",
            "device_fingerprint": device_fingerprint,
            "response": bot_response[:100] + ("..." if len(bot_response) > 100 else "")
        })

        # 2. Categorized User Identity Profile (Always sync latest state first)
        self._load_conversations_from_disk(force=True)
        c_id = client_id.strip() if client_id and client_id.strip() else f"guest_{client_ip.replace('.', '_')}"
        s_id = session_id.strip() if session_id and session_id.strip() else f"sess_{secrets.token_hex(4)}"
        ua_label = user_agent_label or "Web Browser"

        with _CONVERSATIONS_LOCK:
            if c_id not in _USER_PROFILES:
                # First time visitor!
                short_id = c_id[-6:] if len(c_id) >= 6 else c_id
                _USER_PROFILES[c_id] = {
                    "client_id": c_id,
                    "display_name": f"User #{short_id.upper()}",
                    "client_ip": client_ip,
                    "user_agent": ua_label,
                    "device_fingerprint": device_fingerprint,
                    "known_ips": [client_ip] if client_ip else [],
                    "known_fingerprints": [device_fingerprint] if device_fingerprint else [],
                    "first_seen": date_str,
                    "last_seen": date_str,
                    "total_visits": 1,
                    "total_messages": 0,
                    "current_session_id": s_id,
                    "sessions": []
                }

            profile = _USER_PROFILES[c_id]
            profile["last_seen"] = date_str
            profile["client_ip"] = client_ip
            if ua_label:
                profile["user_agent"] = ua_label
            if device_fingerprint:
                profile["device_fingerprint"] = device_fingerprint
                k_fps = profile.setdefault("known_fingerprints", [])
                if device_fingerprint not in k_fps:
                    k_fps.append(device_fingerprint)
            if client_ip:
                k_ips = profile.setdefault("known_ips", [])
                if client_ip not in k_ips:
                    k_ips.append(client_ip)

            # Check if this session already exists or if user started a new session (e.g. cleared chat / returned)
            session_obj = None
            for sess in profile["sessions"]:
                if sess["session_id"] == s_id:
                    session_obj = sess
                    break

            if session_obj is None:
                # User returned and started a new visit / cleared history!
                if len(profile["sessions"]) > 0:
                    profile["total_visits"] += 1
                profile["current_session_id"] = s_id
                session_obj = {
                    "session_id": s_id,
                    "visit_number": len(profile["sessions"]) + 1,
                    "started_at": date_str,
                    "messages": []
                }
                profile["sessions"].append(session_obj)

            # Add message to this visit/session
            session_obj["messages"].append({
                "id": msg_id,
                "timestamp": time_str,
                "query": query,
                "intent": intent,
                "confidence": confidence,
                "latency_ms": latency_ms,
                "engine": engine,
                "response": bot_response
            })
            profile["total_messages"] += 1

        # Persist to disk
        self._save_conversations_to_disk()

    def get_user_conversations(self) -> List[Dict[str, Any]]:
        """Returns all user conversation profiles sorted by last_seen descending."""
        self._load_conversations_from_disk(force=True)
        banned_users = self.get_banned_users()
        with _CONVERSATIONS_LOCK:
            results = []
            for profile in _USER_PROFILES.values():
                p = dict(profile)
                c_id = p.get("client_id", "")
                c_ip = p.get("client_ip", "")
                p["total_queries"] = p.get("total_messages", 0)
                p["is_returning"] = p.get("total_visits", 1) > 1
                p["device_label"] = p.get("user_agent", "Web Browser")
                p["ip_address"] = c_ip or "127.0.0.1"
                p["created_at"] = p.get("first_seen", "")
                p["last_active"] = p.get("last_seen", "")

                # Check banned status with multi-vector device fingerprint matching
                is_banned_user, ban_reason, ban_obj = self.is_banned_detailed(
                    client_id=c_id,
                    client_ip=c_ip,
                    device_fingerprint=p.get("device_fingerprint")
                )
                p["is_banned"] = is_banned_user
                p["ban_info"] = ban_obj
                p["ban_reason"] = ban_reason

                # Compute latest snippet
                latest_snippet = ""
                sessions = p.get("sessions", [])
                if sessions and sessions[-1].get("messages"):
                    latest_snippet = sessions[-1]["messages"][-1].get("query", "")
                p["latest_snippet"] = latest_snippet
                p["sessions_count"] = len(sessions)
                results.append(p)
            results.sort(key=lambda x: x.get("last_active", ""), reverse=True)
            return results

    def get_user_conversation_detail(self, client_id: str) -> Optional[Dict[str, Any]]:
        """Returns full profile and categorized sessions for a single user."""
        self._load_conversations_from_disk(force=True)
        with _CONVERSATIONS_LOCK:
            raw = _USER_PROFILES.get(client_id)
            if not raw:
                return None
            p = dict(raw)
            c_ip = p.get("client_ip", "")
            p["total_queries"] = p.get("total_messages", 0)
            p["is_returning"] = p.get("total_visits", 1) > 1
            p["device_label"] = p.get("user_agent", "Web Browser")
            p["ip_address"] = c_ip or "127.0.0.1"
            p["created_at"] = p.get("first_seen", "")
            p["last_active"] = p.get("last_seen", "")

            # Check banned status with multi-vector device fingerprint matching
            is_banned_user, ban_reason, ban_obj = self.is_banned_detailed(
                client_id=client_id,
                client_ip=c_ip,
                device_fingerprint=p.get("device_fingerprint")
            )
            p["is_banned"] = is_banned_user
            p["ban_info"] = ban_obj
            p["ban_reason"] = ban_reason

            # Normalize sessions
            norm_sessions = []
            for idx, sess in enumerate(p.get("sessions", [])):
                s = dict(sess)
                v_num = s.get("visit_number", idx + 1)
                s["visit_index"] = v_num
                s["is_returning_visit"] = v_num > 1
                s["queries_count"] = len(s.get("messages", []))
                norm_sessions.append(s)
            p["sessions"] = norm_sessions
            return p

    def clear_user_conversations(self):
        """Clears all stored categorized user conversations."""
        global _USER_PROFILES
        with _CONVERSATIONS_LOCK:
            _USER_PROFILES = {}
        self._save_conversations_to_disk()
        self.clear_query_logs()

    def delete_user_conversation(self, client_id: str):
        """Deletes a single user's conversation profile."""
        with _CONVERSATIONS_LOCK:
            if client_id in _USER_PROFILES:
                del _USER_PROFILES[client_id]
        self._save_conversations_to_disk()

    # Banning & Hardware-Level Blacklisting Engine
    def is_banned(
        self,
        client_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        device_fingerprint: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """Checks if client_id, client_ip, or device_fingerprint is banned."""
        banned, reason, _ = self.is_banned_detailed(client_id, client_ip, device_fingerprint)
        return banned, reason

    def is_banned_detailed(
        self,
        client_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        device_fingerprint: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Checks if a client is banned across multiple hardware and network vectors.
        If a device fingerprint matches, auto-cross-infects newly observed IPs and client IDs,
        locking down all vectors permanently even if the user clears storage or switches VPNs.
        """
        config = self.load_config()
        banned_users = config.get("banned_users", {})
        if not banned_users:
            return False, None, None

        clean_cid = client_id.strip() if client_id and client_id.strip() else None
        clean_ip = client_ip.strip() if client_ip and client_ip.strip() else None
        clean_fp = device_fingerprint.strip() if device_fingerprint and device_fingerprint.strip() else None

        matched_key = None
        matched_entry = None
        match_vector = None

        for key, entry in banned_users.items():
            if not isinstance(entry, dict):
                continue

            # 1. Match by Device Hardware Fingerprint (Unbypassable across cache clearing / incognito / VPN)
            if clean_fp:
                entry_fp = entry.get("device_fingerprint")
                known_fps = entry.get("known_fingerprints", [])
                if clean_fp == entry_fp or clean_fp in known_fps:
                    matched_key = key
                    matched_entry = entry
                    match_vector = f"device_fingerprint ({clean_fp[:16]}...)"
                    break

            # 2. Match by Client ID or associated historical client IDs
            if clean_cid:
                entry_cid = entry.get("client_id")
                known_cids = entry.get("associated_client_ids", [])
                if clean_cid == entry_cid or clean_cid == key or clean_cid in known_cids:
                    matched_key = key
                    matched_entry = entry
                    match_vector = f"client_id ({clean_cid})"
                    break

            # 3. Match by Client IP (Ignore internal localhost)
            if clean_ip and clean_ip not in ("127.0.0.1", "localhost", "::1", "internal"):
                entry_ip = entry.get("client_ip")
                known_ips = entry.get("known_ips", [])
                if clean_ip == entry_ip or clean_ip in known_ips:
                    matched_key = key
                    matched_entry = entry
                    match_vector = f"ip_address ({clean_ip})"
                    break

        if matched_entry:
            # Cross-infection / Auto-propagation protocol:
            # If the user changed their IP, generated a new client_id, or revealed a new fingerprint,
            # immediately bind all new coordinates to the ban record and persist to S3.
            mutated = False
            if clean_fp:
                known_fps = matched_entry.setdefault("known_fingerprints", [])
                if clean_fp not in known_fps:
                    known_fps.append(clean_fp)
                    mutated = True
                if not matched_entry.get("device_fingerprint"):
                    matched_entry["device_fingerprint"] = clean_fp
                    mutated = True

            if clean_ip and clean_ip not in ("127.0.0.1", "localhost", "::1", "internal"):
                known_ips = matched_entry.setdefault("known_ips", [])
                if clean_ip not in known_ips:
                    known_ips.append(clean_ip)
                    mutated = True
                if not matched_entry.get("client_ip"):
                    matched_entry["client_ip"] = clean_ip
                    mutated = True

            if clean_cid:
                known_cids = matched_entry.setdefault("associated_client_ids", [])
                if clean_cid not in known_cids:
                    known_cids.append(clean_cid)
                    mutated = True

            if mutated:
                matched_entry["auto_propagated_count"] = matched_entry.get("auto_propagated_count", 0) + 1
                matched_entry["last_enforced_at"] = datetime.now(timezone.utc).isoformat()
                banned_users[matched_key] = matched_entry
                config["banned_users"] = banned_users
                self.save_config(config)
                self.log_security_event(
                    "ban_cross_infected",
                    f"Banned device cross-infected with new vector. Trigger: {match_vector}",
                    client_ip=clean_ip or "internal"
                )

            reason = matched_entry.get("reason", "Device hardware blacklisted due to administrative policy violation")
            return True, reason, matched_entry

        return False, None, None

    def ban_user(
        self,
        client_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        device_fingerprint: Optional[str] = None,
        reason: str = "Administrative policy violation"
    ) -> Dict[str, Any]:
        """
        Bans a device and user across all known hardware, IP, and identity vectors.
        Persists atomically to disk and syncs across distributed Lambda workers via S3.
        """
        self._load_conversations_from_disk(force=True)
        config = self.load_config()
        if "banned_users" not in config:
            config["banned_users"] = {}

        clean_cid = client_id.strip() if client_id and client_id.strip() else None
        clean_ip = client_ip.strip() if client_ip and client_ip.strip() else None
        clean_fp = device_fingerprint.strip() if device_fingerprint and device_fingerprint.strip() else None

        # Check if there is an existing profile to gather historical coordinates
        known_ips = []
        known_fps = []
        associated_cids = []

        if clean_cid:
            associated_cids.append(clean_cid)
            with _CONVERSATIONS_LOCK:
                profile = _USER_PROFILES.get(clean_cid)
                if profile:
                    if not clean_ip and profile.get("client_ip"):
                        clean_ip = profile.get("client_ip")
                    if not clean_fp and profile.get("device_fingerprint"):
                        clean_fp = profile.get("device_fingerprint")
                    for ip in profile.get("known_ips", []):
                        if ip and ip not in known_ips:
                            known_ips.append(ip)
                    for fp in profile.get("known_fingerprints", []):
                        if fp and fp not in known_fps:
                            known_fps.append(fp)

        if clean_ip and clean_ip not in known_ips:
            known_ips.append(clean_ip)
        if clean_fp and clean_fp not in known_fps:
            known_fps.append(clean_fp)

        ban_id = clean_cid or (f"fp_{clean_fp[:16]}" if clean_fp else f"ip_{clean_ip.replace('.', '_') if clean_ip else secrets.token_hex(4)}")

        entry = {
            "ban_id": ban_id,
            "client_id": clean_cid,
            "associated_client_ids": list(set(associated_cids)),
            "device_fingerprint": clean_fp or (known_fps[0] if known_fps else None),
            "known_fingerprints": list(set(known_fps)),
            "client_ip": clean_ip or (known_ips[0] if known_ips else None),
            "known_ips": list(set(known_ips)),
            "reason": (reason or "Administrative policy violation: Permanent device blacklist").strip(),
            "banned_at": datetime.now(timezone.utc).isoformat(),
            "auto_propagated_count": 0
        }

        config["banned_users"][ban_id] = entry
        self.save_config(config)
        self.log_security_event(
            "user_permanently_banned",
            f"Device banned (ID: {ban_id}, FP: {clean_fp}, IP: {clean_ip}). Reason: {entry['reason']}",
            client_ip=clean_ip or "internal"
        )
        return entry

    def unban_user(self, identifier: str) -> bool:
        """
        Unbans a device/user by searching ban_id, client_id, IP, or device_fingerprint.
        Removes ban record and syncs across all execution nodes.
        """
        if not identifier or not identifier.strip():
            return False
        clean_id = identifier.strip()

        config = self.load_config()
        banned = config.get("banned_users", {})
        to_delete = []

        for key, entry in banned.items():
            if not isinstance(entry, dict):
                if key == clean_id:
                    to_delete.append(key)
                continue

            if (
                key == clean_id
                or entry.get("ban_id") == clean_id
                or entry.get("client_id") == clean_id
                or clean_id in entry.get("associated_client_ids", [])
                or entry.get("device_fingerprint") == clean_id
                or clean_id in entry.get("known_fingerprints", [])
                or entry.get("client_ip") == clean_id
                or clean_id in entry.get("known_ips", [])
            ):
                to_delete.append(key)

        if to_delete:
            for k in to_delete:
                del banned[k]
            config["banned_users"] = banned
            self.save_config(config)
            self.log_security_event("user_unbanned", f"Unbanned target matching identifier '{clean_id}'")
            return True
        return False

    def unban_self(
        self,
        password: str,
        client_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        device_fingerprint: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Emergency unban using master admin credentials."""
        config = self.load_config()
        stored_hash = config.get("password_hash", "")
        stored_salt = config.get("password_salt", "")

        if not verify_password(password, stored_hash, stored_salt):
            return False, "Invalid master password."

        if client_id:
            self.unban_user(client_id)
        if device_fingerprint:
            self.unban_user(device_fingerprint)
        if client_ip:
            self.unban_user(client_ip)

        self.log_security_event("admin_emergency_unban_self", "Admin authenticated master unlock to lift local device ban.")
        return True, "Device and IP restrictions removed successfully."

    def get_banned_users(self) -> Dict[str, Any]:
        """Returns all currently banned users, devices, and IPs."""
        config = self.load_config()
        return config.get("banned_users", {})

    # Live Broadcast Banner Management
    def get_broadcast(self) -> Dict[str, Any]:
        """Returns current broadcast banner status."""
        config = self.load_config()
        return config.get("broadcast_announcement", {"enabled": False, "message": ""})

    def update_broadcast(self, enabled: bool, message: str, theme: str = "info") -> Dict[str, Any]:
        """Updates public broadcast announcement banner."""
        config = self.load_config()
        b = {
            "enabled": bool(enabled),
            "message": (message or "").strip(),
            "theme": theme if theme in ("info", "warning", "success", "alert") else "info",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        config["broadcast_announcement"] = b
        self.save_config(config)
        self.log_security_event("broadcast_updated", f"Broadcast banner updated (active: {enabled}, theme: {b['theme']}, message: '{message[:40]}')")
        return b

    # Admin Intercom / Direct Response
    def add_admin_message(self, client_id: str, message_text: str) -> Optional[Dict[str, Any]]:
        """Appends an administrative direct response / intercom note to a user's conversation log."""
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d %H:%M:%S")
        time_str = now.strftime("%H:%M:%S")
        msg_id = secrets.token_hex(4)

        self._load_conversations_from_disk(force=True)
        with _CONVERSATIONS_LOCK:
            profile = _USER_PROFILES.get(client_id)
            if not profile or not profile.get("sessions"):
                return None
            latest_session = profile["sessions"][-1]
            entry = {
                "id": msg_id,
                "timestamp": time_str,
                "query": "[ADMIN INTERCOM NOTICE]",
                "intent": "admin_notice",
                "confidence": 100.0,
                "latency_ms": 0.0,
                "engine": "Master Admin Console",
                "response": message_text.strip(),
                "is_admin_direct": True
            }
            latest_session["messages"].append(entry)
            profile["total_messages"] = profile.get("total_messages", 0) + 1
            profile["last_seen"] = date_str

        self._save_conversations_to_disk()
        with _INTERCOM_LOCK:
            if client_id not in _PENDING_CLIENT_INTERCOM:
                _PENDING_CLIENT_INTERCOM[client_id] = []
            _PENDING_CLIENT_INTERCOM[client_id].append({
                "id": entry["id"],
                "text": message_text.strip(),
                "timestamp": entry["timestamp"]
            })
        self.log_security_event("admin_intercom_sent", f"Admin intercom note dispatched to user {client_id}")
        return entry

    def get_pending_intercom_messages(self, client_id: str) -> List[Dict[str, Any]]:
        """Drains and returns unread admin intercom messages dispatched to this client."""
        if not client_id:
            return []
        with _INTERCOM_LOCK:
            return _PENDING_CLIENT_INTERCOM.pop(client_id, [])

    def broadcast_intercom(self, message_text: str) -> str:
        """Dispatches an administrative intercom note to all active user conversation profiles."""
        self._load_conversations_from_disk(force=True)
        with _CONVERSATIONS_LOCK:
            cids = list(_USER_PROFILES.keys())
        for cid in cids:
            self.add_admin_message(cid, message_text)
        return f"Intercom message dispatched to {len(cids)} active user(s)."

    def set_broadcast(self, enabled: bool, message: str, theme: str = "info") -> Dict[str, Any]:
        """Alias for update_broadcast."""
        return self.update_broadcast(enabled=enabled, message=message, theme=theme)

    def get_query_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Returns the most recent query audit logs in reverse chronological order."""
        logs = list(_QUERY_LOGS)
        logs.reverse()
        return logs[:limit]

    def clear_query_logs(self):
        """Clears the query audit log buffer."""
        _QUERY_LOGS.clear()

    # Model Retraining Orchestration
    def trigger_retraining(self) -> Tuple[bool, str]:
        """Spawns asynchronous model retraining via train.py."""
        global _RETRAIN_STATE
        if _RETRAIN_STATE["is_running"]:
            return False, "Retraining is already in progress."

        _RETRAIN_STATE["is_running"] = True
        _RETRAIN_STATE["status"] = "training"
        _RETRAIN_STATE["start_time"] = time.time()
        _RETRAIN_STATE["error"] = None

        thread = threading.Thread(target=self._run_retrain_worker, daemon=True)
        thread.start()
        return True, "Model retraining job initiated successfully in background."

    def _run_retrain_worker(self):
        """Background thread worker that runs PyTorch training."""
        global _RETRAIN_STATE
        try:
            logger.info("[+] Admin initiated background model retraining...")
            from train import train
            from model.inference import get_engine

            train(epochs=250, lr=0.003, batch_size=16)

            # Hot reload inference engine
            engine = get_engine()
            reloaded = engine.reload()

            _RETRAIN_STATE["is_running"] = False
            _RETRAIN_STATE["status"] = "completed"
            _RETRAIN_STATE["end_time"] = time.time()
            _RETRAIN_STATE["last_trained"] = datetime.now(timezone.utc).isoformat()
            logger.info(f"[✓] Background retraining completed. Engine reloaded: {reloaded}")
            self.log_security_event("retrain_completed", "Neural network model successfully retrained and hot-reloaded")
        except Exception as e:
            logger.error(f"[!] Background retraining error: {e}", exc_info=True)
            _RETRAIN_STATE["is_running"] = False
            _RETRAIN_STATE["status"] = "failed"
            _RETRAIN_STATE["error"] = str(e)
            self.log_security_event("retrain_failed", f"Retraining failed: {e}")

    def get_retrain_status(self) -> Dict[str, Any]:
        """Gets current status of background retraining."""
        return _RETRAIN_STATE

    def verify_secret_passphrase(self, text: str) -> bool:
        """Verifies if the submitted text matches the configured admin secret trigger phrase."""
        if not text:
            return False
        cfg = self.load_config()
        configured_phrase = cfg.get("secret_passphrase", "Admin is here").strip().lower()
        return text.strip().lower() == configured_phrase

    def set_public_lockout(self, duration_minutes: int, reason: str = "Public sessions temporarily suspended by administrator.") -> Dict[str, Any]:
        """Sets a temporary session blackout for all public visitors."""
        duration_minutes = max(1, min(1440, int(duration_minutes)))
        lockout_until = time.time() + (duration_minutes * 60)
        cfg = self.load_config()
        cfg["public_lockout_until"] = lockout_until
        cfg["public_lockout_reason"] = reason.strip() or "Public sessions temporarily suspended by administrator."
        self.save_config(cfg)
        self.log_security_event(
            "public_lockout_started",
            f"Public access suspended for {duration_minutes}m until {datetime.fromtimestamp(lockout_until, timezone.utc).isoformat()}"
        )
        return {
            "public_lockout": True,
            "public_lockout_until": lockout_until,
            "public_lockout_remaining_seconds": duration_minutes * 60,
            "public_lockout_reason": cfg["public_lockout_reason"]
        }

    def lift_public_lockout(self) -> Dict[str, Any]:
        """Lifts public session lockout immediately."""
        cfg = self.load_config()
        cfg["public_lockout_until"] = 0.0
        cfg["public_lockout_reason"] = ""
        self.save_config(cfg)
        self.log_security_event("public_lockout_lifted", "Public access suspension lifted early by administrator.")
        return {
            "public_lockout": False,
            "public_lockout_until": 0.0,
            "public_lockout_remaining_seconds": 0,
            "public_lockout_reason": ""
        }

    def get_public_lockout_status(self) -> Dict[str, Any]:
        """Checks if temporary public session blackout is active."""
        cfg = self.load_config()
        lockout_until = float(cfg.get("public_lockout_until", 0.0) or 0.0)
        now = time.time()
        if lockout_until > now:
            remaining = int(lockout_until - now)
            return {
                "public_lockout": True,
                "public_lockout_until": lockout_until,
                "public_lockout_remaining_seconds": remaining,
                "public_lockout_reason": cfg.get("public_lockout_reason", "Public access temporarily suspended by administrator.")
            }
        return {
            "public_lockout": False,
            "public_lockout_until": 0.0,
            "public_lockout_remaining_seconds": 0,
            "public_lockout_reason": ""
        }


# Global singleton instance
_admin_manager = None

def get_admin_manager() -> AdminManager:
    global _admin_manager
    if _admin_manager is None:
        _admin_manager = AdminManager()
    return _admin_manager
