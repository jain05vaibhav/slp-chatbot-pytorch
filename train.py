import argparse
import copy
import json
import os
import random
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from model.nlp_utils import tokenize, get_ngrams, bag_of_words
from model.neural_net import IntentClassifierDNN

def set_seed(seed: int = 42):
    """Sets random seeds across random, numpy, and torch for reproducible training."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

class ChatDataset(Dataset):
    def __init__(self, X_data: np.ndarray, y_data: np.ndarray):
        self.n_samples = len(X_data)
        self.x_data = torch.as_tensor(X_data, dtype=torch.float32)
        self.y_data = torch.as_tensor(y_data, dtype=torch.long)

    def __getitem__(self, index: int):
        return self.x_data[index], self.y_data[index]

    def __len__(self) -> int:
        return self.n_samples

def train(epochs: int = 350, lr: float = 0.003, batch_size: int = 16, seed: int = 42, hidden1: int = 128, hidden2: int = 64):
    set_seed(seed)

    print("=" * 65)
    print("[+] Starting Upgraded PyTorch Deep Learning Chatbot Training Pipeline")
    print("=" * 65)

    # 1. Load intents dataset
    intents_file = os.path.join("data", "intents.json")
    with open(intents_file, "r", encoding="utf-8") as f:
        intents = json.load(f)

    all_features = []
    tags = []
    xy = []

    # 2. Extract patterns, n-grams (unigrams + bigrams), and tags
    for intent in intents["intents"]:
        tag = intent["tag"]
        if tag not in tags:
            tags.append(tag)
        for pattern in intent["patterns"]:
            tokens = tokenize(pattern)
            ngrams = get_ngrams(tokens)
            all_features.extend(ngrams)
            xy.append((tokens, tag))

    ignore_tokens = ["?", "!", ".", ",", ":", ";"]
    all_features = [f for f in all_features if f not in ignore_tokens]
    all_words = sorted(set(all_features))
    tags = sorted(set(tags))

    print(f"[*] Dataset Statistics:")
    print(f"   - Total Training Patterns: {len(xy)}")
    print(f"   - Unique Intent Tags ({len(tags)}): {tags}")
    print(f"   - N-gram Vocabulary Size: {len(all_words)} features (unigrams + bigrams)")

    # 3. Create training feature vectors and labels
    X_train = []
    y_train = []

    for (tokens, tag) in xy:
        bag = bag_of_words(tokens, all_words)
        X_train.append(bag)
        label = tags.index(tag)
        y_train.append(label)

    X_train = np.array(X_train)
    y_train = np.array(y_train)

    # 4. PyTorch DataLoader
    dataset = ChatDataset(X_train, y_train)
    train_loader = DataLoader(dataset=dataset, batch_size=batch_size, shuffle=True)

    # 5. Hyperparameters & Model Setup
    input_size = len(all_words)
    hidden_size1 = hidden1
    hidden_size2 = hidden2
    output_size = len(tags)
    learning_rate = lr
    num_epochs = epochs

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training Device: {device}")

    model = IntentClassifierDNN(input_size, hidden_size1, hidden_size2, output_size).to(device)

    # 6. Loss, Optimizer & Learning Rate Scheduler
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_epochs, eta_min=1e-5)

    # 7. Training Loop with Best Model Checkpoint Tracking
    best_acc = 0.0
    best_weights = copy.deepcopy(model.state_dict())

    for epoch in range(num_epochs):
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0

        for words_batch, labels_batch in train_loader:
            words_batch = words_batch.to(device)
            labels_batch = labels_batch.to(device)

            outputs = model(words_batch)
            loss = criterion(outputs, labels_batch)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * words_batch.size(0)
            _, predicted = torch.max(outputs.data, 1)
            total += labels_batch.size(0)
            correct += (predicted == labels_batch).sum().item()

        scheduler.step()
        epoch_loss = total_loss / total
        epoch_acc = (correct / total) * 100
        if epoch_acc >= best_acc:
            best_acc = epoch_acc
            best_weights = copy.deepcopy(model.state_dict())

        if (epoch + 1) % 50 == 0 or epoch == num_epochs - 1:
            current_lr = scheduler.get_last_lr()[0]
            print(f"Epoch [{epoch+1:3d}/{num_epochs}] | Loss: {epoch_loss:.4f} | Accuracy: {epoch_acc:6.2f}% | Best: {best_acc:6.2f}% | LR: {current_lr:.6f}")

    print("=" * 65)
    print(f"[+] Training Complete! Final Epoch Accuracy: {epoch_acc:.2f}% (Peak Saved: {best_acc:.2f}%)")

    # 8. Save Best Model and Metadata
    os.makedirs("data", exist_ok=True)
    model_save_path = os.path.join("data", "model.pth")
    meta_save_path = os.path.join("data", "model_data.json")

    # Save best model checkpoint weights
    torch.save(best_weights, model_save_path)

    # Save dataset metadata for inference
    data_meta = {
        "input_size": input_size,
        "hidden_size1": hidden_size1,
        "hidden_size2": hidden_size2,
        "output_size": output_size,
        "all_words": all_words,
        "tags": tags,
        "final_accuracy": epoch_acc,
        "best_accuracy": best_acc,
        "epochs": num_epochs
    }

    with open(meta_save_path, "w", encoding="utf-8") as f:
        json.dump(data_meta, f, indent=2)

    print(f"[+] Saved Best Model Checkpoint to: {model_save_path}")
    print(f"[+] Saved Vocabulary & Config to: {meta_save_path}")
    print("=" * 65)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoxAI Deep Learning Chatbot Training Pipeline")
    parser.add_argument("--epochs", type=int, default=350, help="Number of training epochs (default: 350)")
    parser.add_argument("--lr", type=float, default=0.003, help="Learning rate (default: 0.003)")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size (default: 16)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility (default: 42)")
    parser.add_argument("--hidden1", type=int, default=128, help="Hidden size layer 1 (default: 128)")
    parser.add_argument("--hidden2", type=int, default=64, help="Hidden size layer 2 (default: 64)")
    args = parser.parse_args()

    train(
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch_size,
        seed=args.seed,
        hidden1=args.hidden1,
        hidden2=args.hidden2
    )

