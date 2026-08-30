import json
import os
import random
import torch

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

from model.nlp_utils import tokenize, bag_of_words
from model.neural_net import IntentClassifierDNN

class ChatbotInferenceEngine:
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.model_path = os.path.join(data_dir, "model.pth")
        self.meta_path = os.path.join(data_dir, "model_data.json")
        self.intents_path = os.path.join(data_dir, "intents.json")
        
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.is_loaded = False
        
        self.load_resources()

    def load_resources(self):
        if not (os.path.exists(self.model_path) and os.path.exists(self.meta_path)):
            raise FileNotFoundError("Model files missing. Please run train.py first.")

        with open(self.meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        with open(self.intents_path, "r", encoding="utf-8") as f:
            self.intents = json.load(f)

        self.all_words = meta["all_words"]
        self.tags = meta["tags"]
        input_size = meta["input_size"]
        hidden_size1 = meta["hidden_size1"]
        hidden_size2 = meta["hidden_size2"]
        output_size = meta["output_size"]

        self.model = IntentClassifierDNN(input_size, hidden_size1, hidden_size2, output_size).to(self.device)
        self.model.load_state_dict(torch.load(self.model_path, map_location=self.device))
        self.model.eval()
        self.is_loaded = True

    def query_groq_llm(self, user_text: str, intent_tag: str, confidence: float, base_response: str, api_key: str = None) -> str:
        """
        Enhances the PyTorch DNN's canonical intent response using Groq LLM API.
        The PyTorch DNN remains the primary brain; Groq acts as a voice polisher/vocalizer.
        """
        key = api_key or os.getenv("GROQ_API_KEY")
        if not key:
            raise ValueError("GROQ_API_KEY is not set.")

        client = Groq(api_key=key)
        
        system_prompt = (
            "You are VoxAI, a voice synthesis polisher for a PyTorch Deep Learning Chatbot system. "
            f"The primary PyTorch Neural Network brain classified the user's intent as '{intent_tag}' ({confidence:.1f}% confidence) "
            f"and generated this core canonical answer: '{base_response}'. "
            "YOUR MANDATORY TASK: Rephrase the PyTorch Neural Network's core answer into a short, warm, natural 1-2 sentence spoken response suitable for Text-to-Speech playback. "
            "CRITICAL: Output ONLY the spoken response sentences. Do NOT output markdown headers, bullet points, meta-commentary, or extra text."
        )

        models_to_try = [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768",
            "openai/gpt-oss-20b",
            "qwen/qwen3.6-27b"
        ]
        
        last_err = None
        for m in models_to_try:
            try:
                chat_completion = client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text}
                    ],
                    model=m,
                    temperature=0.6,
                    max_tokens=150
                )
                raw_output = chat_completion.choices[0].message.content.strip()
                # Extract clean spoken quote block if present
                if ">" in raw_output:
                    quote_lines = [l.strip().lstrip('>').strip() for l in raw_output.split('\n') if l.strip().startswith('>')]
                    if quote_lines:
                        return ' '.join(quote_lines)
                
                # Filter out markdown headers if model returns reasoning structure
                lines = [l.strip() for l in raw_output.split('\n') if l.strip() and not l.strip().startswith('#') and not l.strip().startswith('-') and not l.strip().startswith('*')]
                if lines:
                    return ' '.join(lines[:2])

                return raw_output
            except Exception as e:
                last_err = e
                continue
                
        raise last_err

    def get_response(self, text: str, threshold: float = 0.55, use_groq: bool = False, groq_api_key: str = None) -> dict:
        if not text or not text.strip():
            return {
                "intent": "empty_input",
                "confidence": 0.0,
                "response": "I didn't hear anything. Please speak into the microphone or type your message.",
                "query": text,
                "engine": "PyTorch DNN"
            }

        # =========================================================================
        # 1. PRIMARY BRAIN: PyTorch Deep Neural Network (DNN) Intent Classification
        # =========================================================================
        tokens = tokenize(text)
        bow = bag_of_words(tokens, self.all_words)
        x_tensor = torch.from_numpy(bow).to(self.device)

        with torch.no_grad():
            outputs = self.model(x_tensor)
            probs = torch.softmax(outputs, dim=0)
            prob, pred_idx = torch.max(probs, dim=0)

        confidence = round(prob.item() * 100, 2)
        intent_tag = self.tags[pred_idx.item()]

        # Find PyTorch DNN Base Response from intents.json
        pytorch_base_response = None
        if confidence >= threshold * 100:
            for intent in self.intents["intents"]:
                if intent["tag"] == intent_tag:
                    pytorch_base_response = random.choice(intent["responses"])
                    break

        if not pytorch_base_response:
            fallback_responses = [
                "I'm not completely sure I understood that voice command. Could you rephrase or ask what I can do?",
                "I heard you, but my deep learning model has low confidence on that topic. Try asking about weather, deep learning, or my capabilities!",
                "Pardon me! Could you speak again or rephrase your statement?"
            ]
            pytorch_base_response = random.choice(fallback_responses)
            intent_tag = "fallback"

        # =========================================================================
        # 2. VOICE ENHANCER: Groq LLM (Grounded on PyTorch Brain Output)
        # =========================================================================
        effective_key = groq_api_key or os.getenv("GROQ_API_KEY")
        should_use_groq = use_groq and bool(effective_key) and GROQ_AVAILABLE

        if should_use_groq and effective_key:
            try:
                polished_response = self.query_groq_llm(
                    user_text=text,
                    intent_tag=intent_tag,
                    confidence=confidence,
                    base_response=pytorch_base_response,
                    api_key=effective_key
                )
                return {
                    "intent": intent_tag,
                    "confidence": confidence,
                    "response": polished_response,
                    "pytorch_base_response": pytorch_base_response,
                    "query": text,
                    "engine": "PyTorch DNN + Groq Voice"
                }
            except Exception as err:
                print(f"[!] Groq voice polishing failed, returning raw PyTorch DNN response: {err}")

        # Return primary PyTorch DNN response
        return {
            "intent": intent_tag,
            "confidence": confidence,
            "response": pytorch_base_response,
            "pytorch_base_response": pytorch_base_response,
            "query": text,
            "engine": "PyTorch DNN"
        }

# Global singleton engine instance
_engine = None

def get_engine() -> ChatbotInferenceEngine:
    global _engine
    if _engine is None:
        _engine = ChatbotInferenceEngine()
    return _engine
