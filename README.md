# VoxAI - Voice-Enabled Chatbot using Deep Learning & Groq LLM

An interactive, voice-enabled AI Chatbot featuring real-time Speech Recognition (STT), PyTorch Deep Learning Intent Classification, Groq LLM Acceleration, and Text-to-Speech (TTS) vocalization.

## 🚀 Quickstart Guide

1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Train PyTorch Deep Learning Model:**
   ```bash
   python train.py
   ```

3. **Run Application Server:**
   ```bash
   python app.py
   ```
   Open your browser at **http://127.0.0.1:8000**

---

## 📁 Clean Repository Structure

```
ai_chatbot/
├── .env                     # Backend Groq API Key configuration
├── .env.example             # Environment template file
├── data/
│   ├── intents.json         # Chatbot intent patterns and responses
│   ├── model.pth            # Trained PyTorch checkpoint weights
│   └── model_data.json      # Vocabulary metadata and hyperparameters
├── model/
│   ├── neural_net.py        # PyTorch IntentClassifierDNN architecture
│   ├── nlp_utils.py         # Tokenizer, stemmer & vectorizer
│   └── inference.py         # PyTorch primary brain & Groq voice engine
├── static/
│   ├── css/style.css        # Glassmorphic dark UI theme & scrollbar rules
│   ├── js/app.js            # Web Speech STT/TTS & API controller
│   └── index.html           # Main application web interface
├── app.py                   # FastAPI web application server
├── train.py                 # PyTorch model training script
├── requirements.txt         # Python package dependencies
├── REPORT.md                # Project technical evaluation report
└── README.md                # Project documentation
```
