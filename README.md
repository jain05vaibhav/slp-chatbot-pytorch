# VoxAI - Voice-Enabled AI Chatbot using Deep Learning & Groq LLM

An interactive, voice-enabled AI Chatbot featuring real-time Speech-to-Text (STT), a custom PyTorch Deep Learning Intent Classifier (with LayerNorm, GELU, and N-gram feature extraction), an offline safe AST-based math and dynamic time engine, optional Groq LLM vocalization, and Text-to-Speech (TTS) synthesis.

---

## 🌟 Key Features

- **Primary PyTorch Brain:** Offline Deep Neural Network (`IntentClassifierDNN`) classifying 25 distinct conversational intents with sub-2ms latency.
- **N-Gram NLP Pipeline:** Combines stemmed unigrams and bigrams with contraction normalization for vocabulary matching ($N = 597$ features).
- **Safe Dynamic Math Engine:** Computes arithmetic expressions offline using Python's Abstract Syntax Tree (`ast`) without `eval()`, supporting `+`, `-`, `*`, `/`, `//`, `%`, `**`, and parentheses with zero-division safety.
- **Dynamic Time & Date:** Real-time local date, day of week, and time resolution.
- **Groq LLM Acceleration (Optional):** Vocalizes and polishes PyTorch canonical intent responses using Groq's high-speed inference (`openai/gpt-oss-120b` / `qwen/qwen3.8-27b`).
- **Web Speech API Integration:** Real-time browser speech recognition with live transcription previews and audio waveform visualizer.
- **Text-to-Speech (TTS):** In-browser speech synthesis with voice selection and speech rate controls.
- **Glassmorphic UI:** Modern dark-mode interface (`#090D16`) with ambient glow, responsive layout, model inspection sidebar, and one-click response copy.

---

## 🚀 Quickstart Guide

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment (Optional)
Copy the environment template:
```bash
cp .env.example .env
```
Edit `.env` to add your Groq API key if you wish to enable the optional Groq vocalizer:
```env
GROQ_API_KEY="your_groq_api_key_here"
CORS_ORIGINS="*"
```
*(Alternatively, enter your Groq API key directly into the UI sidebar during runtime.)*

### 3. Train PyTorch Deep Learning Model
Train the neural network with default settings:
```bash
python train.py
```
Or customize training hyperparameters:
```bash
python train.py --epochs 350 --lr 0.003 --batch-size 16 --seed 42
```

### 4. Run Application Server
```bash
python app.py
```
Open your browser at **http://127.0.0.1:8000**

---

## 📡 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the interactive glassmorphic web interface |
| `GET` | `/api/health` | Health check returning model load status and vocabulary size |
| `GET` | `/api/status` | Detailed system diagnostics, device, and intent metadata |
| `GET` | `/api/intents` | Returns all supported intent tags and vocabulary list |
| `POST` | `/api/chat` | Main query endpoint (accepts `{ "text": "...", "use_groq": false, "groq_api_key": null }`) |
| `POST` | `/api/reload` | Reloads model weights and metadata from disk without restarting server |

---

## 📁 Repository Structure

```
ai_chatbot/
├── .env                     # Backend Groq API Key configuration
├── .env.example             # Environment template file
├── .gitignore               # Git ignore rules (.env, checkpoints, cache)
├── data/
│   ├── intents.json         # 25 intent classes with patterns and canned responses
│   ├── model.pth            # Trained PyTorch checkpoint weights
│   └── model_data.json      # Vocabulary metadata and hyperparameters
├── model/
│   ├── neural_net.py        # PyTorch IntentClassifierDNN (LayerNorm + GELU)
│   ├── nlp_utils.py         # Tokenizer, stemmer & n-gram bag-of-words vectorizer
│   └── inference.py         # Safe AST math engine, PyTorch brain & Groq vocalizer
├── static/
│   ├── css/style.css        # Glassmorphic dark UI theme & scrollbar rules
│   ├── js/app.js            # Web Speech STT/TTS & API controller
│   └── index.html           # Main application web interface
├── app.py                   # FastAPI web application server
├── train.py                 # PyTorch model training script with CLI & checkpointing
├── requirements.txt         # Python package dependencies
├── REPORT.md                # Project technical evaluation report
└── README.md                # Project documentation
```

---

## 🧪 Model Architecture

```
User Query ──> Contraction Normalization ──> Tokenize & Stem ──> N-gram Bag-of-Words (597 dims)
                                                                            │
                                                                            ▼
                                                               Linear(597, 128)
                                                                      │
                                                              LayerNorm(128) + GELU
                                                                      │
                                                                 Dropout(0.3)
                                                                      │
                                                                Linear(128, 64)
                                                                      │
                                                              LayerNorm(64) + GELU
                                                                      │
                                                                 Dropout(0.2)
                                                                      │
                                                                Linear(64, 25)
                                                                      │
                                                                      ▼
                                                            Predicted Intent Tag
```
