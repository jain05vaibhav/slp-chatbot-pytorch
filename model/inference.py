import ast
import json
import logging
import operator as op
import os
import random
import re
from datetime import datetime
from typing import Optional, Union
import torch

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

from model.nlp_utils import tokenize, bag_of_words, count_matched_features
from model.neural_net import IntentClassifierDNN

logger = logging.getLogger("voxai.inference")

# Supported operators for safe AST arithmetic evaluation
SAFE_OPERATORS = {
    ast.Add: op.add,
    ast.Sub: op.sub,
    ast.Mult: op.mul,
    ast.Div: op.truediv,
    ast.FloorDiv: op.floordiv,
    ast.Mod: op.mod,
    ast.Pow: op.pow,
    ast.USub: op.neg,
    ast.UAdd: op.pos,
}

def safe_eval_node(node: ast.AST) -> Union[int, float]:
    """Recursively evaluates an AST node containing only safe arithmetic operations."""
    if isinstance(node, ast.Expression):
        return safe_eval_node(node.body)
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value)}")
    elif isinstance(node, ast.BinOp):
        left = safe_eval_node(node.left)
        right = safe_eval_node(node.right)
        op_type = type(node.op)
        if op_type not in SAFE_OPERATORS:
            raise ValueError(f"Unsupported operator: {op_type}")
        if op_type in (ast.Div, ast.FloorDiv, ast.Mod) and right == 0:
            raise ZeroDivisionError("Division by zero is undefined.")
        if op_type == ast.Pow and (abs(right) > 100 or abs(left) > 10000):
            raise ValueError("Exponent or base is too large.")
        return SAFE_OPERATORS[op_type](left, right)
    elif isinstance(node, ast.UnaryOp):
        operand = safe_eval_node(node.operand)
        op_type = type(node.op)
        if op_type not in SAFE_OPERATORS:
            raise ValueError(f"Unsupported operator: {op_type}")
        return SAFE_OPERATORS[op_type](operand)
    else:
        raise TypeError(f"Unsupported AST node: {type(node)}")

def safe_evaluate_math(expr_str: str) -> Union[int, float]:
    """Parses and safely evaluates an arithmetic expression string via AST without eval()."""
    parsed = ast.parse(expr_str.strip(), mode='eval')
    return safe_eval_node(parsed)

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
            raise FileNotFoundError(f"Model files missing in {self.data_dir}. Please run train.py first.")

        with open(self.meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        with open(self.intents_path, "r", encoding="utf-8") as f:
            self.intents = json.load(f)

        self.all_words = meta["all_words"]
        self.tags = meta["tags"]
        self.input_size = meta["input_size"]
        self.hidden_size1 = meta.get("hidden_size1", 128)
        self.hidden_size2 = meta.get("hidden_size2", 64)
        self.output_size = meta["output_size"]

        self.model = IntentClassifierDNN(
            self.input_size,
            self.hidden_size1,
            self.hidden_size2,
            self.output_size
        ).to(self.device)

        self.model.load_state_dict(
            torch.load(self.model_path, map_location=self.device, weights_only=True)
        )
        self.model.eval()
        self.is_loaded = True
        logger.info(f"Loaded VoxAI model from {self.model_path} on {self.device} (vocab: {len(self.all_words)}, intents: {len(self.tags)})")

    def reload(self) -> bool:
        """Reloads model weights and metadata from disk."""
        try:
            self.load_resources()
            return True
        except Exception as e:
            logger.error(f"Failed to reload model: {e}")
            return False

    def _handle_dynamic_time_date(self, query: str) -> str:
        """Generates real-time, dynamic local date and time response."""
        now = datetime.now()
        time_str = now.strftime("%I:%M %p").lstrip("0")
        date_str = now.strftime("%A, %B %d, %Y")
        day_str = now.strftime("%A")
        
        q_lower = query.lower()
        if "day" in q_lower and "time" not in q_lower and "date" not in q_lower:
            return f"Today is {day_str} ({date_str})."
        elif "date" in q_lower and "time" not in q_lower:
            return f"Today's date is {date_str}."
        elif "time" in q_lower and "date" not in q_lower:
            return f"The current time is {time_str}."
        else:
            return f"The current time is {time_str}, and today is {date_str}."

    def _handle_dynamic_math(self, query: str) -> str:
        """Safely parses and calculates arithmetic expressions offline using AST."""
        cleaned = query.lower()
        for prefix in ["what is", "calculate", "solve", "evaluate", "can you do math", "can you calculate"]:
            cleaned = cleaned.replace(prefix, "")
        cleaned = cleaned.strip()

        # Word-to-operator normalization
        cleaned = (cleaned
            .replace("plus", "+")
            .replace("minus", "-")
            .replace("times", "*")
            .replace("multiplied by", "*")
            .replace("divided by", "/")
            .replace("modulo", "%")
            .replace("mod", "%")
            .replace("x", "*")
        )
        
        # Extract expression pattern
        match = re.search(r'[\d\.\s\+\-\*\/\(\)\%]+', cleaned)
        if match:
            expr = match.group(0).strip()
            # Verify string contains valid arithmetic syntax and at least one operator
            if re.fullmatch(r'[\d\.\s\+\-\*\/\(\)\%]+', expr) and any(op in expr for op in "+-*/%"):
                try:
                    result = safe_evaluate_math(expr)
                    if isinstance(result, float) and result.is_integer():
                        result = int(result)
                    elif isinstance(result, float):
                        result = round(result, 4)
                    return f"The result of {expr} is {result}."
                except ZeroDivisionError:
                    return f"Cannot calculate {expr}: Division by zero is undefined."
                except Exception as ex:
                    logger.debug(f"Math evaluation failed for '{expr}': {ex}")

        return "I can solve arithmetic expressions! For example, try asking 'What is 25 * 4?' or 'What is 100 divided by 5?'"

    def query_groq_llm(self, user_text: str, intent_tag: str, confidence: float, base_response: str, api_key: Optional[str] = None) -> str:
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
            "qwen/qwen3.8-27b",
            "allam-2-7b",
            "openai/gpt-oss-120b",
            "groq/compound-mini",
            "openai/gpt-oss-20b"
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
                    max_tokens=300
                )
                raw_output = (chat_completion.choices[0].message.content or "").strip()
                if not raw_output:
                    continue
                
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
                
        if last_err:
            raise last_err
        return base_response

    def get_response(self, text: str, threshold: float = 0.50, use_groq: bool = False, groq_api_key: Optional[str] = None) -> dict:
        if not text or not text.strip():
            return {
                "intent": "empty_input",
                "confidence": 0.0,
                "response": "I didn't hear anything. Please speak into the microphone or type your message.",
                "query": text,
                "engine": "PyTorch DNN (Offline)"
            }

        # =========================================================================
        # 1. PRIMARY BRAIN: PyTorch Deep Neural Network (DNN) Intent Classification
        # =========================================================================
        tokens = tokenize(text)

        # Zero-Vector / Out-Of-Vocabulary (OOV) Protection
        matched_count = count_matched_features(tokens, self.all_words)
        if matched_count == 0:
            return {
                "intent": "fallback",
                "confidence": 0.0,
                "response": "I didn't recognize any keywords in that query. As an offline Deep Learning model, I'm trained on topics like AI, deep learning, tech stack, weather, time, jokes, and voice capabilities. Try asking one of those!",
                "pytorch_base_response": "I didn't recognize any keywords in that query.",
                "query": text,
                "engine": "PyTorch DNN (Offline)"
            }

        bow = bag_of_words(tokens, self.all_words)
        x_tensor = torch.from_numpy(bow).to(self.device)

        with torch.no_grad():
            outputs = self.model(x_tensor)
            probs = torch.softmax(outputs, dim=0)
            prob, pred_idx = torch.max(probs, dim=0)

        confidence = round(prob.item() * 100, 2)
        intent_tag = self.tags[pred_idx.item()]

        # Dynamic and Canned Response Generation
        pytorch_base_response = None
        if confidence >= threshold * 100:
            if intent_tag == "time_date":
                pytorch_base_response = self._handle_dynamic_time_date(text)
            elif intent_tag == "math_calc":
                pytorch_base_response = self._handle_dynamic_math(text)
            else:
                for intent in self.intents["intents"]:
                    if intent["tag"] == intent_tag:
                        pytorch_base_response = random.choice(intent["responses"])
                        break

        if not pytorch_base_response:
            fallback_responses = [
                "I'm not completely sure I understood that command. Could you rephrase or ask what I can do?",
                "My offline deep learning model has lower confidence on that topic. Try asking about weather, deep learning, time, or my capabilities!",
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
                if polished_response and polished_response.strip():
                    return {
                        "intent": intent_tag,
                        "confidence": confidence,
                        "response": polished_response.strip(),
                        "pytorch_base_response": pytorch_base_response,
                        "query": text,
                        "engine": "PyTorch DNN + Groq Voice"
                    }
            except Exception as err:
                logger.warning(f"Groq voice polishing failed, returning raw PyTorch DNN response: {err}")

        # Return primary PyTorch DNN offline response
        return {
            "intent": intent_tag,
            "confidence": confidence,
            "response": pytorch_base_response,
            "pytorch_base_response": pytorch_base_response,
            "query": text,
            "engine": "PyTorch DNN (Offline)"
        }

# Global singleton engine instance
_engine = None

def get_engine() -> ChatbotInferenceEngine:
    global _engine
    if _engine is None:
        _engine = ChatbotInferenceEngine()
    return _engine

