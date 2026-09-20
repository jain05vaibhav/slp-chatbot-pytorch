import re
import numpy as np

# Common English contractions mapping for normalization
CONTRACTIONS = {
    "what's": "what is",
    "what're": "what are",
    "who's": "who is",
    "where's": "where is",
    "how's": "how is",
    "it's": "it is",
    "that's": "that is",
    "there's": "there is",
    "here's": "here is",
    "i'm": "i am",
    "you're": "you are",
    "we're": "we are",
    "they're": "they are",
    "i've": "i have",
    "you've": "you have",
    "we've": "we have",
    "they've": "they have",
    "i'll": "i will",
    "you'll": "you will",
    "he'll": "he will",
    "she'll": "she will",
    "we'll": "we will",
    "they'll": "they will",
    "i'd": "i would",
    "you'd": "you would",
    "he'd": "he would",
    "she'd": "she would",
    "we'd": "we would",
    "they'd": "they would",
    "he's": "he is",
    "she's": "she is",
    "can't": "can not",
    "cannot": "can not",
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "won't": "will not",
    "wouldn't": "would not",
    "shouldn't": "should not",
    "couldn't": "could not",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "haven't": "have not",
    "hasn't": "has not",
    "hadn't": "had not",
    "let's": "let us",
    "mustn't": "must not",
    "needn't": "need not",
    "shan't": "shall not"
}

def expand_contractions(text: str) -> str:
    """Expands common contractions in text for consistent tokenization."""
    lower_text = text.lower()
    for contraction, expansion in CONTRACTIONS.items():
        lower_text = re.sub(r'\b' + re.escape(contraction) + r'\b', expansion, lower_text)
    return lower_text

def stem(word: str) -> str:
    """
    Robust pure Python Porter-style Stemmer rules.
    Normalizes words to root form for vocabulary matching.
    """
    word = word.lower().strip()
    if len(word) <= 3:
        return word
    
    # Common suffixes ordered by length (specific before general)
    suffixes = [
        ('ization', 'ize'),
        ('ational', 'ate'),
        ('fulness', 'ful'),
        ('ousness', 'ous'),
        ('bilities', 'ble'),
        ('bility', 'ble'),
        ('tional', 'tion'),
        ('ment', ''),
        ('ness', ''),
        ('able', ''),
        ('ible', ''),
        ('ious', ''),
        # Doubled consonant gerunds: running -> run, chatting -> chat
        ('nning', 'n'),
        ('tting', 't'),
        ('rring', 'r'),
        ('pping', 'p'),
        ('mming', 'm'),
        ('ing', ''),
        ('ied', 'y'),
        ('ies', 'y'),
        # Doubled consonant past tense: nodded -> nod, spotted -> spot
        ('dded', 'd'),
        ('tted', 't'),
        ('pped', 'p'),
        ('ed', ''),
        ('ive', ''),
        ('ful', ''),
        ('ly', ''),
        ('es', ''),
        ('s', '')
    ]
    
    doubled_suffixes = {'nning', 'tting', 'rring', 'pping', 'mming', 'dded', 'tted', 'pped', 'nhed'}
    
    for suffix, replacement in suffixes:
        min_prefix_len = 2 if suffix in doubled_suffixes else 3
        if word.endswith(suffix) and len(word) - len(suffix) >= min_prefix_len:
            return word[:-len(suffix)] + replacement
            
    return word

def tokenize(sentence: str) -> list[str]:
    """
    Normalizes and tokenizes a sentence string into clean lowercase word tokens.
    """
    expanded = expand_contractions(sentence)
    words = re.findall(r'\b\w+\b', expanded.lower())
    return words

def get_ngrams(tokens: list[str]) -> list[str]:
    """
    Generates unigrams and bigrams from a list of tokens.
    E.g. ['deep', 'learning'] -> ['deep', 'learning', 'deep_learning']
    """
    stemmed_unigrams = [stem(w) for w in tokens]
    bigrams = [f"{stemmed_unigrams[i]}_{stemmed_unigrams[i+1]}" for i in range(len(stemmed_unigrams) - 1)]
    return stemmed_unigrams + bigrams

def bag_of_words(tokenized_sentence: list[str], vocabulary: list[str]) -> np.ndarray:
    """
    Converts tokenized sentence into an n-gram feature vector matching the vocabulary.
    Returns a float32 numpy vector with binary/frequency presence.
    """
    all_features = get_ngrams(tokenized_sentence)
    bag = np.zeros(len(vocabulary), dtype=np.float32)
    
    for idx, word in enumerate(vocabulary):
        if word in all_features:
            bag[idx] = 1.0
            
    return bag

def count_matched_features(tokenized_sentence: list[str], vocabulary: list[str]) -> int:
    """
    Counts how many vocabulary features match the tokenized sentence.
    Used for Out-Of-Vocabulary (OOV) / Zero-Vector detection.
    """
    all_features = get_ngrams(tokenized_sentence)
    feature_set = set(all_features)
    vocab_set = set(vocabulary)
    return len(feature_set.intersection(vocab_set))

