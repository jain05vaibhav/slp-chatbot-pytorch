import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize inference engine
    logger.info("Starting VoxAI Web Server...")
    engine = get_engine()
    logger.info(f"Inference engine ready. Vocabulary: {len(engine.all_words)} features, Intents: {len(engine.tags)}.")
    yield
    # Shutdown: clean up if necessary
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
# Under CORS specs, allow_credentials=True cannot be used with wildcard ["*"]
allow_creds = allowed_origins != ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request schema with field validation
class ChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="User voice or text prompt")
    use_groq: Optional[bool] = Field(False, description="Whether to use Groq LLM for vocalization")
    groq_api_key: Optional[str] = Field(None, max_length=200, description="Optional per-request Groq API key")

# Serve static frontend files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>VoxAI Chatbot API Server Running</h1><p>Frontend static files loading...</p>")

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
    """Provides detailed system diagnostics and model metadata."""
    engine = get_engine()
    groq_key_set = bool(os.getenv("GROQ_API_KEY"))
    return {
        "status": "operational",
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
            "configured": groq_key_set
        },
        "timestamp": time.time()
    }

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
    """Reloads model weights and metadata from disk without restarting server."""
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

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    start_time = time.time()
    try:
        engine = get_engine()
        result = engine.get_response(
            text=request.text.strip(),
            use_groq=request.use_groq,
            groq_api_key=request.groq_api_key
        )
        latency_ms = round((time.time() - start_time) * 1000, 2)
        result["latency_ms"] = latency_ms
        return result
    except Exception as e:
        logger.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error processing request.")

# AWS Lambda Mangum handler
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    handler = None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

