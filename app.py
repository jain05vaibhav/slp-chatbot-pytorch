"""
VoxAI - Voice-Enabled AI Chatbot API Server
===========================================
Deep Learning Voice Assistant powered by PyTorch intent classification,
speech synthesis, hardware fingerprint security, and optional Groq Cloud LLM.
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Setup structured logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("voxai.server")

# Load .env variables if python-dotenv is present
try:
    from dotenv import load_dotenv
    load_dotenv()
    logger.info(".env file loaded successfully.")
except ImportError:
    pass

from model.inference import get_engine, GROQ_AVAILABLE
from model.admin_security import get_admin_manager
from routes.admin_routes import admin_router
from routes.moderation_routes import moderation_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting VoxAI Web Server...")
    engine = get_engine()
    logger.info(f"Inference engine ready. Vocabulary: {len(engine.all_words)} features, Intents: {len(engine.tags)}.")
    yield
    logger.info("Shutting down VoxAI Web Server...")

app = FastAPI(
    title="VoxAI - Voice-Enabled AI Chatbot API",
    description="Deep Learning-based Voice Assistant with Speech Recognition, PyTorch Intent Classification & Groq LLM integration",
    version="1.2.0",
    lifespan=lifespan
)

# Configure CORS safely
cors_origins_env = os.getenv("CORS_ORIGINS", "*")
allowed_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
allow_creds = allowed_origins != ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_real_client_ip(req: Request) -> str:
    """Extracts client IP reliably across CloudFront, API Gateway, and direct connections."""
    forwarded = req.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return req.client.host if req.client else "127.0.0.1"


# -----------------------------------------------------------------------------
# Request Schemas
# -----------------------------------------------------------------------------
class ChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="User voice or text prompt")
    use_groq: Optional[bool] = Field(False, description="Whether to use Groq LLM for vocalization")
    groq_api_key: Optional[str] = Field(None, max_length=200, description="Optional per-request Groq API key")
    client_id: Optional[str] = Field(None, max_length=100, description="Persistent visitor identity")
    session_id: Optional[str] = Field(None, max_length=100, description="Current session/visit identifier")
    user_agent_label: Optional[str] = Field(None, max_length=200, description="Browser/device metadata")
    device_fingerprint: Optional[str] = Field(None, max_length=100, description="Device hardware fingerprint")

class CheckBanRequest(BaseModel):
    client_id: Optional[str] = None
    device_fingerprint: Optional[str] = None


# -----------------------------------------------------------------------------
# Static Frontend Files & Landing Routes
# -----------------------------------------------------------------------------
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>VoxAI Chatbot API Server Running</h1><p>Frontend static files loading...</p>")

@app.get("/admin", response_class=HTMLResponse)
async def serve_admin():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>VoxAI Admin Portal</h1><p>Frontend static files loading...</p>")


# -----------------------------------------------------------------------------
# Public System Diagnostics & Telemetry
# -----------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    engine = get_engine()
    groq_key_set = bool(os.getenv("GROQ_API_KEY"))
    return {
        "status": "healthy",
        "model_loaded": engine.is_loaded,
        "vocabulary_size": len(engine.all_words),
        "intents_count": len(engine.tags),
        "groq_available": GROQ_AVAILABLE,
        "groq_key_configured": groq_key_set,
        "timestamp": time.time()
    }

@app.get("/api/status")
async def system_status():
    engine = get_engine()
    groq_key_set = bool(os.getenv("GROQ_API_KEY"))
    admin_mgr = get_admin_manager()
    cfg = admin_mgr.load_config()
    is_maint = bool(cfg.get("maintenance_mode", False))
    lockout_status = admin_mgr.get_public_lockout_status()
    is_groq_enabled = bool(cfg.get("groq_enabled", True))

    current_status = "operational"
    if lockout_status["public_lockout"]:
        current_status = "public_lockout"
    elif is_maint:
        current_status = "maintenance"

    return {
        "status": current_status,
        "maintenance_mode": is_maint,
        "maintenance_message": cfg.get("maintenance_message", "VoxAI is currently undergoing scheduled maintenance. All public inferences are suspended."),
        "public_lockout": lockout_status,
        "groq_enabled": is_groq_enabled,
        "app_version": "1.2.0",
        "engine": {
            "loaded": engine.is_loaded,
            "device": str(engine.device),
            "vocabulary_size": len(engine.all_words),
            "intents_count": len(engine.tags),
            "intents": engine.tags
        },
        "groq": {
            "available": GROQ_AVAILABLE,
            "configured": groq_key_set,
            "enabled": is_groq_enabled
        },
        "timestamp": time.time()
    }

@app.get("/api/broadcast")
async def get_public_broadcast(client_id: Optional[str] = None):
    admin_mgr = get_admin_manager()
    b = admin_mgr.get_broadcast()
    cfg = admin_mgr.load_config()
    lockout_status = admin_mgr.get_public_lockout_status()
    intercom_msgs = admin_mgr.get_pending_intercom_messages(client_id) if client_id else []
    return {
        **b,
        "maintenance_mode": bool(cfg.get("maintenance_mode", False)),
        "maintenance_message": cfg.get("maintenance_message", "VoxAI is currently undergoing scheduled maintenance. All public interactions are suspended."),
        "public_lockout": lockout_status,
        "intercom_messages": intercom_msgs
    }

@app.get("/api/intercom/poll")
async def poll_client_intercom(client_id: Optional[str] = None):
    """Returns and drains any pending administrative intercom messages for this client."""
    if not client_id:
        return {"messages": []}
    admin_mgr = get_admin_manager()
    msgs = admin_mgr.get_pending_intercom_messages(client_id)
    return {"messages": msgs}

@app.get("/api/intents")
async def get_intents():
    engine = get_engine()
    return {
        "tags": engine.tags,
        "vocabulary": engine.all_words,
        "total_intents": len(engine.tags)
    }

@app.post("/api/reload")
async def reload_model():
    engine = get_engine()
    success = engine.reload()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to reload model from disk.")
    return {
        "status": "reloaded",
        "vocabulary_size": len(engine.all_words),
        "intents_count": len(engine.tags),
        "timestamp": time.time()
    }


# -----------------------------------------------------------------------------
# Preflight Hardware Blacklist Check
# -----------------------------------------------------------------------------
@app.post("/api/check-ban")
async def check_ban_post_endpoint(
    body: CheckBanRequest,
    req: Request,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    admin_mgr = get_admin_manager()
    client_ip = get_real_client_ip(req)
    token = authorization or x_admin_token
    if token and admin_mgr.verify_token(token):
        return {"is_banned": False, "is_admin": True}

    is_banned, reason, ban_details = admin_mgr.is_banned_detailed(
        client_id=body.client_id,
        client_ip=client_ip,
        device_fingerprint=body.device_fingerprint
    )
    return {
        "is_banned": is_banned,
        "ban_reason": reason,
        "client_ip": client_ip,
        "device_fingerprint": body.device_fingerprint,
        "ban_details": ban_details if is_banned else None
    }

@app.get("/api/check-ban")
async def check_ban_get_endpoint(
    req: Request,
    client_id: Optional[str] = None,
    device_fingerprint: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    admin_mgr = get_admin_manager()
    client_ip = get_real_client_ip(req)
    token = authorization or x_admin_token
    if token and admin_mgr.verify_token(token):
        return {"is_banned": False, "is_admin": True}

    is_banned, reason, ban_details = admin_mgr.is_banned_detailed(
        client_id=client_id,
        client_ip=client_ip,
        device_fingerprint=device_fingerprint
    )
    return {
        "is_banned": is_banned,
        "ban_reason": reason,
        "client_ip": client_ip,
        "device_fingerprint": device_fingerprint,
        "ban_details": ban_details if is_banned else None
    }


# -----------------------------------------------------------------------------
# Core Chat Processing Endpoint
# -----------------------------------------------------------------------------
@app.post("/api/chat")
async def chat_endpoint(
    request: ChatRequest,
    req: Request,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    admin_mgr = get_admin_manager()
    config = admin_mgr.load_config()

    client_ip = get_real_client_ip(req)
    token = authorization or x_admin_token
    is_admin = bool(token and admin_mgr.verify_token(token))

    # 1. Ban & Blacklist Enforcement (Admin bypasses ban)
    is_banned, ban_reason, ban_details = admin_mgr.is_banned_detailed(
        client_id=request.client_id,
        client_ip=client_ip,
        device_fingerprint=request.device_fingerprint
    )
    if is_banned and not is_admin:
        return JSONResponse(
            status_code=403,
            content={
                "intent": "banned",
                "confidence": 100.0,
                "response": f"Access Restricted: Your device has been permanently suspended by administrator. (Reason: {ban_reason})",
                "pytorch_base_response": "Access restricted by administrator.",
                "query": request.text.strip(),
                "engine": "Security Access Control",
                "latency_ms": 0.5,
                "is_banned": True,
                "ban_reason": ban_reason,
                "client_ip": client_ip,
                "device_fingerprint": request.device_fingerprint,
                "ban_details": ban_details
            }
        )

    # 2. Temporary Public Lockout Check (Admin bypasses public lockout)
    lockout_status = admin_mgr.get_public_lockout_status()
    if lockout_status["public_lockout"] and not is_admin:
        return JSONResponse(
            status_code=423,
            content={
                "intent": "public_lockout",
                "confidence": 100.0,
                "response": f"Access Suspended: {lockout_status['public_lockout_reason']} Resuming in {lockout_status['public_lockout_remaining_seconds']}s.",
                "pytorch_base_response": "Public access temporarily suspended.",
                "query": request.text.strip(),
                "engine": "Session Control",
                "is_public_lockout": True,
                "lockout_remaining_seconds": lockout_status["public_lockout_remaining_seconds"],
                "lockout_reason": lockout_status["public_lockout_reason"],
                "latency_ms": 0.5,
                "error": "public_lockout_active"
            }
        )

    # 3. Maintenance mode protection (Admin bypasses maintenance mode)
    is_maintenance = bool(config.get("maintenance_mode", False))
    if is_maintenance and not is_admin:
        maint_msg = config.get(
            "maintenance_message",
            "VoxAI is currently undergoing scheduled maintenance. All public inferences are suspended."
        )
        return JSONResponse(
            status_code=503,
            content={
                "intent": "maintenance",
                "confidence": 100.0,
                "response": maint_msg,
                "pytorch_base_response": "System undergoing scheduled maintenance.",
                "query": request.text.strip(),
                "engine": "Security Shield",
                "is_maintenance": True,
                "latency_ms": 1.0,
                "error": "maintenance_mode_active"
            }
        )

    # 4. Automated Content Moderation & Profanity / Toxic Filter
    if not is_admin:
        from model.moderation import get_moderation_manager
        mod_mgr = get_moderation_manager()
        eval_result = mod_mgr.evaluate_query(
            text=request.text.strip(),
            client_id=request.client_id,
            client_ip=client_ip,
            device_fingerprint=request.device_fingerprint
        )
        if eval_result.get("is_violation"):
            action = eval_result.get("action")
            if action == "ban":
                ban_entry = admin_mgr.ban_user(
                    client_id=request.client_id,
                    client_ip=client_ip,
                    device_fingerprint=request.device_fingerprint,
                    reason=eval_result.get("reason", "Automated Policy Violation: Repeated prohibited words")
                )
                return JSONResponse(
                    status_code=403,
                    content={
                        "intent": "banned",
                        "confidence": 100.0,
                        "response": f"Access Restricted: Your device has been permanently suspended for policy violation. ({eval_result['reason']})",
                        "pytorch_base_response": "Access permanently restricted.",
                        "query": request.text.strip(),
                        "engine": "Automated Content Shield",
                        "latency_ms": 0.5,
                        "is_banned": True,
                        "ban_reason": eval_result["reason"],
                        "client_ip": client_ip,
                        "device_fingerprint": request.device_fingerprint,
                        "ban_details": ban_entry
                    }
                )
            elif action == "warn":
                return JSONResponse(
                    status_code=200,
                    content={
                        "intent": "moderation_warning",
                        "confidence": 100.0,
                        "response": eval_result["warning_message"],
                        "pytorch_base_response": eval_result["warning_message"],
                        "query": request.text.strip(),
                        "engine": "Automated Content Shield",
                        "latency_ms": 0.5,
                        "is_warning": True,
                        "strike_count": eval_result.get("strike_count", 1),
                        "detected_words": eval_result.get("detected_words", [])
                    }
                )

    threshold = config.get("confidence_threshold", 0.50)
    custom_prompt = config.get("custom_system_prompt")

    # 5. Check if Groq is globally enabled by admin
    is_groq_globally_enabled = bool(config.get("groq_enabled", True))
    use_groq = request.use_groq and is_groq_globally_enabled

    start_time = time.time()
    try:
        engine = get_engine()
        result = engine.get_response(
            text=request.text.strip(),
            threshold=threshold,
            use_groq=use_groq,
            groq_api_key=request.groq_api_key,
            custom_system_prompt=custom_prompt
        )
        latency_ms = round((time.time() - start_time) * 1000, 2)
        result["latency_ms"] = latency_ms

        # Audit log to in-memory query stream and categorized user identity profile
        admin_mgr.log_query(
            query=request.text.strip(),
            intent=result.get("intent", "unknown"),
            confidence=result.get("confidence", 0.0),
            latency_ms=latency_ms,
            engine=result.get("engine", "Unknown"),
            bot_response=result.get("response", ""),
            client_id=request.client_id,
            session_id=request.session_id,
            user_agent_label=request.user_agent_label,
            client_ip=client_ip,
            device_fingerprint=request.device_fingerprint
        )

        return result
    except Exception as e:
        logger.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error processing request.")


# -----------------------------------------------------------------------------
# Mount Encrypted Admin Command Center Routers
# -----------------------------------------------------------------------------
app.include_router(admin_router)
app.include_router(moderation_router)

# AWS Lambda Mangum handler
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    handler = None

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="127.0.0.1", port=port, reload=True)
