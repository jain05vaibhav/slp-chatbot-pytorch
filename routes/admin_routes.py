"""
VoxAI Master Admin Routes & Security Command Center
===================================================
Provides modular, authenticated admin control endpoints:
- Authentication & Session Verification
- System Vitals & Hardware Telemetry
- System Governance (Groq settings, Maintenance mode, Temporary Lockout, Secret Phrase)
- Master Password Reset
- Model Inference Playground & Background Retraining
- User Conversations & Persistent History Audit
- Hardware Device Blacklist & Ban Management
"""

import os
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel, Field

from model.admin_security import get_admin_manager, INTENTS_PATH
from model.inference import get_engine, GROQ_AVAILABLE

admin_router = APIRouter(prefix="/api/admin", tags=["Admin"])


# -----------------------------------------------------------------------------
# Pydantic Schemas
# -----------------------------------------------------------------------------
class AdminLoginRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=200)

class AdminPasswordChangeRequest(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)

class AdminConfigUpdateRequest(BaseModel):
    confidence_threshold: Optional[float] = Field(None, ge=0.05, le=0.99)
    maintenance_mode: Optional[bool] = None
    maintenance_message: Optional[str] = Field(None, max_length=1000)
    custom_system_prompt: Optional[str] = None
    default_engine: Optional[str] = None
    groq_api_key: Optional[str] = Field(None, max_length=200)
    groq_enabled: Optional[bool] = None
    secret_passphrase: Optional[str] = Field(None, max_length=100)

class PublicLockoutRequest(BaseModel):
    duration_minutes: int = Field(..., ge=1, le=1440)
    reason: Optional[str] = Field("Public sessions temporarily suspended by administrator.", max_length=300)

class VerifyPhraseRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=200)

class AdminIntentsUpdateRequest(BaseModel):
    intents: List[Dict[str, Any]]

class AdminBanRequest(BaseModel):
    client_id: Optional[str] = Field(None, max_length=100)
    client_ip: Optional[str] = Field(None, max_length=50)
    device_fingerprint: Optional[str] = Field(None, max_length=100)
    reason: Optional[str] = Field("Administrative policy violation", max_length=300)

class AdminUnbanRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=100)

class AdminBroadcastRequest(BaseModel):
    enabled: bool
    message: str = Field(..., max_length=500)
    theme: Optional[str] = Field("info", max_length=50)

class AdminIntercomRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)

class TestInferenceRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    threshold: Optional[float] = Field(0.50, ge=0.05, le=0.99)
    use_groq: Optional[bool] = False


# -----------------------------------------------------------------------------
# Token Verification Dependency
# -----------------------------------------------------------------------------
def verify_admin_token(
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
) -> str:
    token = authorization or x_admin_token
    admin_mgr = get_admin_manager()
    if not token or not admin_mgr.verify_token(token):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Access denied. Master session token is invalid or expired."
        )
    return token


# -----------------------------------------------------------------------------
# Authentication & Verification
# -----------------------------------------------------------------------------
@admin_router.post("/login")
async def admin_login(body: AdminLoginRequest, request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    admin_mgr = get_admin_manager()
    authenticated, token, error_msg = admin_mgr.authenticate_admin(body.password, client_ip=client_ip)

    if not authenticated:
        if error_msg and ("Locked out" in error_msg or "Max attempts" in error_msg):
            raise HTTPException(status_code=429, detail=error_msg)
        raise HTTPException(status_code=401, detail=error_msg or "Invalid admin credentials.")

    return {
        "status": "authenticated",
        "token": token,
        "expires_in": 7200,
        "message": "Security clearance granted. Master admin session established."
    }

@admin_router.post("/logout")
async def admin_logout(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    admin_mgr.revoke_token(token)
    return {"status": "logged_out", "message": "Master session safely revoked."}

@admin_router.get("/verify")
async def admin_verify_token(token: str = Depends(verify_admin_token)):
    return {"status": "valid", "authenticated": True}

@admin_router.post("/verify-phrase")
async def verify_secret_phrase(body: VerifyPhraseRequest):
    """Public endpoint to verify secret chat phrase without leaking configured value."""
    admin_mgr = get_admin_manager()
    is_match = admin_mgr.verify_secret_passphrase(body.text)
    return {"is_secret": is_match}

@admin_router.post("/change-password")
async def admin_change_password(
    body: AdminPasswordChangeRequest,
    request: Request,
    token: str = Depends(verify_admin_token)
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    admin_mgr = get_admin_manager()
    success, msg = admin_mgr.change_password(body.old_password, body.new_password, client_ip=client_ip)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    new_token = admin_mgr.create_session_token()
    return {"status": "password_changed", "message": msg, "new_token": new_token}


# -----------------------------------------------------------------------------
# System Vitals & Configuration
# -----------------------------------------------------------------------------
@admin_router.get("/vitals")
async def admin_system_vitals(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    engine = get_engine()
    vitals = admin_mgr.get_system_vitals()
    vitals["model"] = {
        "is_loaded": engine.is_loaded,
        "device": str(engine.device),
        "vocabulary_size": len(engine.all_words),
        "intents_count": len(engine.tags),
        "tags": engine.tags
    }
    cfg = admin_mgr.load_config()
    vitals["groq"] = {
        "available": GROQ_AVAILABLE,
        "configured": bool(os.getenv("GROQ_API_KEY")),
        "enabled": bool(cfg.get("groq_enabled", True))
    }
    vitals["public_lockout"] = admin_mgr.get_public_lockout_status()
    return vitals

@admin_router.get("/config")
async def admin_get_config(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    cfg = admin_mgr.load_config()
    groq_key = os.getenv("GROQ_API_KEY", "")
    masked_key = f"{groq_key[:6]}...{groq_key[-4:]}" if len(groq_key) > 10 else ("Configured" if groq_key else "Not Configured")

    return {
        "confidence_threshold": cfg.get("confidence_threshold", 0.50),
        "maintenance_mode": cfg.get("maintenance_mode", False),
        "maintenance_message": cfg.get("maintenance_message", "VoxAI is currently undergoing scheduled maintenance. All public inferences are suspended."),
        "custom_system_prompt": cfg.get("custom_system_prompt") or "",
        "default_engine": cfg.get("default_engine", "groq"),
        "groq_enabled": cfg.get("groq_enabled", True),
        "groq_configured": bool(groq_key),
        "groq_key_masked": masked_key,
        "secret_passphrase": cfg.get("secret_passphrase", "Admin is here"),
        "public_lockout": admin_mgr.get_public_lockout_status()
    }

@admin_router.post("/config")
async def admin_update_config(body: AdminConfigUpdateRequest, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    cfg = admin_mgr.load_config()

    if body.confidence_threshold is not None:
        cfg["confidence_threshold"] = round(body.confidence_threshold, 2)
    if body.maintenance_mode is not None:
        cfg["maintenance_mode"] = body.maintenance_mode
    if body.maintenance_message is not None:
        cfg["maintenance_message"] = body.maintenance_message.strip()
    if body.custom_system_prompt is not None:
        cfg["custom_system_prompt"] = body.custom_system_prompt.strip() or None
    if body.default_engine is not None:
        cfg["default_engine"] = body.default_engine
    if body.groq_enabled is not None:
        cfg["groq_enabled"] = body.groq_enabled
    if body.secret_passphrase is not None and body.secret_passphrase.strip():
        cfg["secret_passphrase"] = body.secret_passphrase.strip()

    if body.groq_api_key is not None and body.groq_api_key.strip():
        new_key = body.groq_api_key.strip()
        os.environ["GROQ_API_KEY"] = new_key
        admin_mgr.log_security_event("groq_key_updated", "Server-wide Groq API key updated")

    admin_mgr.save_config(cfg)
    admin_mgr.log_security_event("config_updated", "System configuration and governance updated")
    return {"status": "updated", "config": cfg}

@admin_router.post("/public-lockout")
async def admin_public_lockout(body: PublicLockoutRequest, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    result = admin_mgr.set_public_lockout(body.duration_minutes, body.reason)
    return {"status": "lockout_started", **result}

@admin_router.post("/public-lockout/lift")
async def admin_lift_public_lockout(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    result = admin_mgr.lift_public_lockout()
    return {"status": "lockout_lifted", **result}


# -----------------------------------------------------------------------------
# Model Playground & Retraining
# -----------------------------------------------------------------------------
@admin_router.post("/test-inference")
async def admin_test_inference(body: TestInferenceRequest, token: str = Depends(verify_admin_token)):
    import torch
    from model.nlp_utils import tokenize, bag_of_words

    start_time = time.time()
    engine = get_engine()
    admin_mgr = get_admin_manager()
    cfg = admin_mgr.load_config()
    custom_prompt = cfg.get("custom_system_prompt")
    threshold = body.threshold if body.threshold is not None else cfg.get("confidence_threshold", 0.50)

    text = body.text.strip()
    tokens = tokenize(text)
    matched_tokens = [w for w in tokens if w in engine.all_words]

    top_candidates = []
    if len(tokens) > 0 and len(matched_tokens) > 0:
        bow = bag_of_words(tokens, engine.all_words)
        x_tensor = torch.from_numpy(bow).to(engine.device)
        with torch.no_grad():
            outputs = engine.model(x_tensor)
            probs = torch.softmax(outputs, dim=0)
            k = min(5, len(engine.tags))
            top_probs, top_indices = torch.topk(probs, k=k)
            for p, idx in zip(top_probs, top_indices):
                top_candidates.append({
                    "tag": engine.tags[idx.item()],
                    "confidence": round(p.item() * 100, 2)
                })

    res = engine.get_response(
        text=text,
        threshold=threshold,
        use_groq=body.use_groq,
        custom_system_prompt=custom_prompt
    )
    latency_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "query": text,
        "intent": res.get("intent", "fallback"),
        "confidence": res.get("confidence", 0.0),
        "response": res.get("response", ""),
        "pytorch_base_response": res.get("pytorch_base_response", ""),
        "engine": res.get("engine", "PyTorch DNN (Offline)"),
        "latency_ms": latency_ms,
        "top_intents": top_candidates,
        "matched_tokens": matched_tokens,
        "total_vocab_size": len(engine.all_words),
        "tags_count": len(engine.tags)
    }

@admin_router.post("/retrain")
async def admin_trigger_retrain(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    success, msg = admin_mgr.trigger_retraining()
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "started", "message": msg}

@admin_router.get("/retrain-status")
async def admin_get_retrain_status(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    return admin_mgr.get_retrain_status()

@admin_router.post("/reload")
async def admin_reload_model(token: str = Depends(verify_admin_token)):
    engine = get_engine()
    success = engine.reload()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to reload model from disk.")
    admin_mgr = get_admin_manager()
    admin_mgr.log_security_event("model_hot_reloaded", "Model reloaded from disk into memory")
    return {
        "status": "reloaded",
        "vocabulary_size": len(engine.all_words),
        "intents_count": len(engine.tags),
        "timestamp": time.time()
    }


# -----------------------------------------------------------------------------
# Conversations, Logs & Cloud Sync
# -----------------------------------------------------------------------------
@admin_router.post("/sync")
async def admin_force_sync(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    admin_mgr._load_conversations_from_disk()
    cfg = admin_mgr.load_config()
    admin_mgr._save_conversations_to_disk()
    admin_mgr.save_config(cfg)
    return {
        "status": "synchronized",
        "timestamp": time.time(),
        "total_conversations": len(admin_mgr.get_user_conversations()),
        "maintenance_mode": cfg.get("maintenance_mode", False),
        "maintenance_message": cfg.get("maintenance_message", "")
    }

@admin_router.get("/intents")
async def admin_get_intents(token: str = Depends(verify_admin_token)):
    import json
    if not os.path.exists(INTENTS_PATH):
        raise HTTPException(status_code=404, detail="intents.json dataset file not found.")
    with open(INTENTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@admin_router.post("/intents")
async def admin_save_intents(body: AdminIntentsUpdateRequest, token: str = Depends(verify_admin_token)):
    import json
    for i, item in enumerate(body.intents):
        if not isinstance(item, dict) or "tag" not in item or "patterns" not in item or "responses" not in item:
            raise HTTPException(
                status_code=400,
                detail=f"Intent item #{i+1} invalid. Must contain 'tag', 'patterns', and 'responses'."
            )
        if not item["tag"].strip():
            raise HTTPException(status_code=400, detail=f"Intent item #{i+1} has an empty tag.")

    data = {"intents": body.intents}
    temp_path = INTENTS_PATH + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(temp_path, INTENTS_PATH)

    admin_mgr = get_admin_manager()
    admin_mgr.log_security_event("intents_saved", f"Intents dataset updated with {len(body.intents)} intents")
    return {"status": "saved", "total_intents": len(body.intents)}

@admin_router.get("/query-logs")
async def admin_get_query_logs(limit: int = 100, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    return {"logs": admin_mgr.get_query_logs(limit=limit)}

@admin_router.delete("/query-logs")
async def admin_clear_query_logs(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    admin_mgr.clear_query_logs()
    return {"status": "cleared", "message": "Query audit logs cleared."}

@admin_router.get("/conversations")
async def admin_get_conversations(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    return {"users": admin_mgr.get_user_conversations()}

@admin_router.get("/conversations/{client_id}")
async def admin_get_user_conversation(client_id: str, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    profile = admin_mgr.get_user_conversation_detail(client_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User conversation profile not found.")
    return profile

@admin_router.delete("/conversations")
async def admin_clear_all_conversations(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    admin_mgr.clear_user_conversations()
    return {"status": "cleared", "message": "All user conversation records wiped."}

@admin_router.delete("/conversations/{client_id}")
async def admin_delete_user_conversation(client_id: str, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    admin_mgr.delete_user_conversation(client_id)
    return {"status": "deleted", "message": f"User {client_id} history deleted."}

@admin_router.get("/security-logs")
async def admin_security_logs(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    cfg = admin_mgr.load_config()
    logs = list(cfg.get("security_logs", []))
    logs.reverse()
    return {"logs": logs}

@admin_router.post("/emergency-lock")
async def admin_emergency_lock(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    admin_mgr.revoke_all_sessions()
    admin_mgr.log_security_event("emergency_lock", "Emergency lockout invoked: all active sessions invalidated.")
    return {"status": "locked", "message": "Emergency lock executed. All sessions revoked."}

@admin_router.post("/force-logout-all")
async def admin_force_logout_all(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    admin_mgr.revoke_all_sessions()
    admin_mgr.log_security_event("force_logout_all", "Administrator triggered global force logout of all active sessions.")
    return {"status": "locked", "message": "Force logout executed successfully. All admin sessions revoked."}


# -----------------------------------------------------------------------------
# Blacklist & Ban Management
# -----------------------------------------------------------------------------
@admin_router.get("/banned")
async def admin_get_banned(token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    return {"banned": admin_mgr.get_banned_users()}

@admin_router.post("/ban")
async def admin_ban_visitor(body: AdminBanRequest, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    entry = admin_mgr.ban_user(
        client_id=body.client_id,
        client_ip=body.client_ip,
        device_fingerprint=body.device_fingerprint,
        reason=body.reason or "Administrative policy violation"
    )
    return {"status": "banned", "entry": entry}

@admin_router.post("/unban")
async def admin_unban_visitor(body: AdminUnbanRequest, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    success = admin_mgr.unban_user(body.client_id)
    if not success:
        raise HTTPException(status_code=404, detail="Visitor not found in blacklist.")
    return {"status": "unbanned", "client_id": body.client_id}

@admin_router.post("/broadcast")
async def admin_set_broadcast(body: AdminBroadcastRequest, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    b = admin_mgr.update_broadcast(body.enabled, body.message, body.theme)
    return {"status": "updated", "broadcast": b}

@admin_router.post("/intercom")
async def admin_send_intercom(body: AdminIntercomRequest, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    msg = admin_mgr.broadcast_intercom(body.message)
    return {"status": "broadcasted", "message": msg}

class AdminEmergencyUnbanRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=200)
    client_id: Optional[str] = None
    device_fingerprint: Optional[str] = None

@admin_router.post("/unban-self")
async def admin_unban_self_endpoint(body: AdminEmergencyUnbanRequest, req: Request):
    forwarded = req.headers.get("x-forwarded-for")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (req.client.host if req.client else "127.0.0.1")
    admin_mgr = get_admin_manager()
    success, msg = admin_mgr.unban_self(password=body.password, client_id=body.client_id, client_ip=client_ip, device_fingerprint=body.device_fingerprint)
    if not success:
        raise HTTPException(status_code=401, detail=msg)
    return {"status": "unbanned", "message": msg, "token": admin_mgr.create_session_token()}

@admin_router.post("/conversations/{client_id}/intercom")
async def admin_send_client_intercom(client_id: str, body: AdminIntercomRequest, token: str = Depends(verify_admin_token)):
    admin_mgr = get_admin_manager()
    entry = admin_mgr.add_admin_message(client_id, body.message)
    if not entry:
        raise HTTPException(status_code=404, detail="User session not found to dispatch intercom message.")
    return {"status": "sent", "entry": entry}

@admin_router.post("/sync")
async def admin_force_s3_sync(token: str = Depends(verify_admin_token)):
    get_admin_manager()._save_conversations_to_disk()
    from model.moderation import get_moderation_manager
    get_moderation_manager().force_s3_sync()
    return {"status": "synced", "message": "All data and moderation configurations synced to S3."}
