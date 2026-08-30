# Project Evaluation Report: Voice-Enabled Chatbot using Speech Recognition & Deep Learning

---

## 1. Executive Summary & Application Overview

- **Project Title:** Voice-Enabled AI Chatbot & Real-Time Intent Classifier
- **Local Application URL:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Primary Frameworks:** PyTorch 2.11, Groq LLM API, FastAPI, Web Speech API (STT & TTS), HTML5/CSS3 (Glassmorphic Design)

This project delivers a complete, end-to-end voice-enabled interactive chatbot powered by a custom **PyTorch Deep Neural Network (DNN)** for intent classification and **Groq LLM Acceleration** for response generation. The system listens to user voice input via the browser's Web Speech Recognition API, transcribes speech into text in real-time, vectorizes the query using a Bag-of-Words NLP pipeline, predicts conversational intent using PyTorch, generates rich responses via Groq LLM / PyTorch, and speaks the answer back using Speech Synthesis.

---

## 2. PyTorch Primary Brain & Groq LLM Integration

- **Primary PyTorch Brain:** The PyTorch Multi-Layer Perceptron (`IntentClassifierDNN`) acts as the core intent classifier and knowledge engine, computing class probabilities and confidence scores.
- **Groq LLM Acceleration:** When enabled, Groq API (e.g. `llama-3.3-70b-versatile`) rephrases and polishes the PyTorch DNN's core answer into a warm, natural 1-2 sentence spoken response suitable for Text-to-Speech vocalization.
- **Backend Environment File:** The Groq API key is managed securely on the backend via the `.env` file (`GROQ_API_KEY=gsk_...`).

---

## 3. Dataset Description & NLP Methodology

### 3.1 Dataset Structure (`data/intents.json`)
The chatbot is trained on a multi-domain conversational dataset containing 12 intent classes across 73 pattern variations (`greeting`, `about_bot`, `capabilities`, `deep_learning`, `weather`, `jokes`, `technology`, etc.).

### 3.2 NLP Preprocessing & Vectorization Pipeline
1. **Tokenization:** Regex-based word extraction converting raw text strings into lowercase token sequences.
2. **Stemming:** Porter-style suffix stripping algorithm normalizing inflected forms.
3. **Vocabulary Extraction:** Constructs a unique vocabulary vector of $N = 114$ stemmed word tokens.
4. **Bag-of-Words Encoding:** Transforms each query into a binary $1 \times 114$ numerical tensor.

---

## 4. Deep Learning Model Architecture & Training

### 4.1 Model Architecture (`model/neural_net.py`)
- **Input Layer:** 114 Bag-of-Words Tensor
- **Hidden Layer 1:** Linear(114, 128) + BatchNorm1d + ReLU + Dropout(0.3)
- **Hidden Layer 2:** Linear(128, 64) + BatchNorm1d + ReLU + Dropout(0.2)
- **Output Layer:** Linear(64, 12) + Softmax Activation
- **Training Accuracy:** **98.63%** across 300 epochs.

---

## 5. Speech Recognition & Voice Synthesis System

1. **Speech-to-Text (STT):** Integrates HTML5 Web Speech API (`SpeechRecognition`) for low-latency microphone capture, live interim transcript previews, and state indicators.
2. **Text-to-Speech (TTS):** Uses `SpeechSynthesis` API to vocalize bot responses with customizable voice pitch, speech rate, and mute toggles.
3. **Glassmorphic UI Design:** Styled with dark mode theme (`#090D16`), cyan/indigo gradients, audio wave visualizers, mic pulse keyframe animations, and real-time model inspector badge.

---

## 6. Clean Source Code Structure

```
ai_chatbot/
├── .env                     # Backend Groq API Key configuration
├── .env.example             # Environment template file
├── data/
│   ├── intents.json         # Intent patterns and responses dataset
│   ├── model.pth            # Trained PyTorch model checkpoint weights
│   └── model_data.json      # Vocabulary mapping and hyperparameters
├── model/
│   ├── neural_net.py        # PyTorch IntentClassifierDNN model architecture
│   ├── nlp_utils.py         # Tokenizer, Stemmer & Bag-of-Words encoder
│   └── inference.py         # Model loading & Groq LLM inference engine
├── static/
│   ├── css/style.css        # Glassmorphic dark UI theme & animations
│   ├── js/app.js            # Web Speech STT/TTS & API controller
│   └── index.html           # Main web application frontend
├── app.py                   # FastAPI web server
├── train.py                 # PyTorch model training script
├── requirements.txt         # Package dependencies
├── REPORT.md                # Project documentation & evaluation report
└── README.md                # Setup & project guide
```

---

## 7. How to Run Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Train PyTorch Model
python train.py

# 3. Start Web Application Server
python app.py
```
