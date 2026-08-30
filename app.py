import time
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import Optional

# Load .env variables if python-dotenv is present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from model.inference import get_engine, GROQ_AVAILABLE

app = FastAPI(
    title="Voice-Enabled AI Chatbot API",
    description="Deep Learning-based Voice Assistant with Speech Recognition, PyTorch Intent Classification & Groq LLM integration",
    version="1.1.0"
)

# Enable CORS for cross-origin frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request schema
class ChatRequest(BaseModel):
    text: str
    use_groq: Optional[bool] = False
    groq_api_key: Optional[str] = None

# Serve static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.on_event("startup")
def startup_event():
    # Initialize engine on startup
    get_engine()

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>Voice Chatbot API Server Running</h1><p>Frontend static files loading...</p>")

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

@app.get("/api/intents")
async def get_intents():
    engine = get_engine()
    return {
        "tags": engine.tags,
        "vocabulary": engine.all_words,
        "total_intents": len(engine.tags)
    }

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    start_time = time.time()
    try:
        engine = get_engine()
        result = engine.get_response(
            text=request.text,
            use_groq=request.use_groq,
            groq_api_key=request.groq_api_key
        )
        latency_ms = round((time.time() - start_time) * 1000, 2)
        result["latency_ms"] = latency_ms
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
