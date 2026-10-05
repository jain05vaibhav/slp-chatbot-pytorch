# Project Evaluation Report: Voice-Enabled Chatbot using Speech Recognition & Deep Learning

---

## 1. Executive Summary & Application Overview

- **Project Title:** Voice-Enabled AI Chatbot & Real-Time Intent Classifier (VoxAI)
- **Live Deployment Link:** [https://chatbot.vaibhavjain.click](https://chatbot.vaibhavjain.click) (AWS Lambda: `https://sla6q4v5rh7mixy5oenwarhvly0noiip.lambda-url.ap-south-1.on.aws/`)
- **Local Application URL:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Primary Frameworks:** PyTorch 2.x, Groq LLM API, FastAPI, Web Speech API (STT & TTS), HTML5/CSS3 (Glassmorphic Design)

This project delivers a complete, production-ready, voice-enabled interactive chatbot powered by a custom **PyTorch Deep Neural Network (DNN)** for intent classification and **Groq LLM Acceleration** for spoken response vocalization. The system listens to user voice input via the browser's Web Speech Recognition API, transcribes speech into text in real-time, vectorizes the query using an N-gram (unigrams + bigrams) NLP pipeline, predicts conversational intent using a PyTorch DNN with LayerNorm and GELU, computes dynamic offline math and time queries via a safe AST engine, optionally vocalizes answers via Groq LLM, and speaks the response back using Speech Synthesis.

---

## 2. PyTorch Primary Brain & Groq LLM Integration

- **Primary PyTorch Brain:** The PyTorch Deep Neural Network (`IntentClassifierDNN`) acts as the core intent classifier and knowledge engine, computing class probabilities and confidence scores offline with sub-2ms latency.
- **Groq LLM Acceleration:** When enabled, the Groq API (e.g., `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`) rephrases and polishes the PyTorch DNN's core answer into a warm, natural 1-2 sentence spoken response suitable for Text-to-Speech vocalization.
- **Secure Configuration:** Groq API keys can be configured via `.env` or passed securely per-request from the frontend UI without server restarts.
- **Safe Dynamic Calculation:** Dynamic arithmetic evaluation is executed offline via a secure Abstract Syntax Tree (`ast`) evaluator without using `eval()`.

---

## 3. Dataset Description & NLP Methodology

### 3.1 Dataset Structure (`data/intents.json`)
The chatbot is trained on a massive, comprehensive multi-domain conversational dataset containing **267 unique intent classes** across **1,884 pattern variations** and **562 responses**:
- **Core Conversational**: `greeting`, `goodbye`, `thanks`, `about_bot`, `creator`, `capabilities`, `speech_help`, `small_talk_day`, `compliment_request`, `status_check`, `clear_reset`
- **AI, ML & Data Science**: `deep_learning`, `machine_learning`, `artificial_intelligence`, `neural_network`, `computer_vision`, `nlp`, `reinforcement_learning`, `data_science`, `big_data`
- **Software Engineering & Web**: `python_info`, `javascript_info`, `java_info`, `cpp_info`, `c`, `c_2`, `go`, `rust`, `kotlin`, `swift`, `web_development`, `app_development`, `api_info`, `github_info`
- **Infrastructure & Systems**: `cloud_computing`, `cybersecurity`, `blockchain`, `operating_systems`, `linux_info`, `networking`, `docker_kubernetes`, `iot`, `robotics`, `quantum_computing`
- **Computer Science Fundamentals**: `algorithms`, `data_structures`, `competitive_programming`, `database_info`, `sql_info`
- **Career & Productivity**: `career_advice`, `interview_prep`, `resume_tips`, `college_life`, `exam_stress`, `motivation`, `productivity_tips`, `time_management`
- **Lifestyle & General Knowledge**: `math_calc`, `time_date`, `weather`, `jokes`, `riddles`, `health_tips`, `fitness`, `nutrition`, `travel`, `book_recommendation`, `movie_recommendation`, `space_facts`, `history_facts`, `science_facts`

### 3.2 NLP Preprocessing & Vectorization Pipeline
1. **Contraction Expansion:** Normalizes common English contractions (`what's` $\rightarrow$ `what is`, `i've` $\rightarrow$ `i have`, `can't` $\rightarrow$ `can not`).
2. **Tokenization:** Regex-based word extraction converting raw text strings into lowercase token sequences.
3. **Stemming:** Pure-Python Porter-style suffix stripping algorithm normalizing inflected forms while handling doubled consonants (`running` $\rightarrow$ `run`, `clearing` $\rightarrow$ `clear`).
4. **N-gram Extraction:** Generates unigrams and adjacent bigrams (`['deep', 'learning']` $\rightarrow$ `['deep', 'learning', 'deep_learning']`).
5. **Vocabulary Extraction:** Constructs a unique vocabulary vector of $N = 3,451$ stemmed n-gram features.
6. **Bag-of-Words Encoding:** Transforms each query into a binary $1 \times 3,451$ numerical tensor.

---

## 4. Deep Learning Model Architecture & Training

### 4.1 Model Architecture (`model/neural_net.py`)
- **Input Layer:** $3,451$-dimensional N-gram Feature Tensor
- **Hidden Layer 1:** Linear(3451, 256) $\rightarrow$ LayerNorm(256) $\rightarrow$ GELU $\rightarrow$ Dropout(0.3)
- **Hidden Layer 2:** Linear(256, 128) $\rightarrow$ LayerNorm(128) $\rightarrow$ GELU $\rightarrow$ Dropout(0.2)
- **Output Layer:** Linear(128, 267) $\rightarrow$ Softmax Activation (Peak Accuracy: 99.15%)

### 4.2 Architectural Advantages
- **LayerNorm:** Ensures stable normalization across batch sizes, including batch=1 during real-time single query inference.
- **GELU (Gaussian Error Linear Unit):** Provides smooth non-linearity and superior gradient flow compared to standard ReLU.
- **Dropout (0.3 & 0.2):** Prevents co-adaptation of features on small intent datasets.

### 4.3 Training & Optimization
- **Optimizer:** AdamW with weight decay ($1 \times 10^{-4}$)
- **Learning Rate Scheduler:** Cosine Annealing LR ($T_{max} = 350$, $\eta_{min} = 1 \times 10^{-5}$)
- **Checkpoint Preservation:** Tracks and preserves the exact state dictionary of the highest-accuracy epoch (`best_weights`).
- **Training Accuracy:** **100.00%** across 350 epochs.

---

## 5. Speech Recognition & Voice Synthesis System

1. **Speech-to-Text (STT):** Integrates HTML5 Web Speech API (`SpeechRecognition`) for low-latency microphone capture, live interim transcript previews, and state indicators.
2. **Text-to-Speech (TTS):** Uses `SpeechSynthesis` API to vocalize bot responses with customizable voice pitch, speech rate, and mute toggles.
3. **Glassmorphic UI Design:** Styled with dark mode theme (`#090D16`), cyan/indigo gradients, audio wave visualizers, mic pulse keyframe animations, real-time model inspector badge, and one-click copy buttons.

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
│   └── inference.py         # Safe AST math, model loading & Groq inference engine
├── static/
│   ├── css/style.css        # Glassmorphic dark UI theme & animations
│   ├── js/app.js            # Web Speech STT/TTS & API controller
│   └── index.html           # Main web application frontend
├── app.py                   # FastAPI web server with CORS, logging & endpoints
├── train.py                 # PyTorch model training script with CLI & checkpointing
├── requirements.txt         # Package dependencies
├── REPORT.md                # Project documentation & evaluation report
└── README.md                # Setup & project guide
```

---

## 7. How to Run Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Train PyTorch Model (with optional flags)
python train.py --epochs 350 --lr 0.003 --batch-size 16

# 3. Start Web Application Server
python app.py
```
Open your browser at **http://127.0.0.1:8000**
