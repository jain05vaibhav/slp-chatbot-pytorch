import re
import numpy as np

# Simple, effective Porter-style Stemmer rules in pure Python for robust zero-dependency text normalization
def stem(word: str) -> str:
    """
    Stems a word to its root form for vocabulary matching.
    """
    word = word.lower().strip()
    if len(word) <= 3:
        return word
    
    # Common suffix stripping rules
    suffixes = ['ing', 'ly', 'ed', 'ious', 'ies', 'ive', 'es', 's']
    for suffix in suffixes:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            if suffix == 'ies':
                return word[:-3] + 'y'
            return word[:-len(suffix)]
    return word

def tokenize(sentence: str) -> list[str]:
    """
    Tokenizes a sentence string into clean lowercase word tokens.
    """
    words = re.findall(r'\b\w+\b', sentence.lower())
    return words

def bag_of_words(tokenized_sentence: list[str], vocabulary: list[str]) -> np.ndarray:
    """
    Converts tokenized sentence into a binary Bag-of-Words feature vector.
    1 if word exists in sentence vocabulary, 0 otherwise.
    """
    stemmed_tokens = [stem(w) for w in tokenized_sentence]
    bag = np.zeros(len(vocabulary), dtype=np.float32)
    
    for idx, word in enumerate(vocabulary):
        if word in stemmed_tokens:
            bag[idx] = 1.0
            
    return bag
