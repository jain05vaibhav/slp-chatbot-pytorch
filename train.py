import json
import os
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import numpy as np

from model.nlp_utils import tokenize, stem, bag_of_words
from model.neural_net import IntentClassifierDNN

class ChatDataset(Dataset):
    def __init__(self, X_data, y_data):
        self.n_samples = len(X_data)
        self.x_data = torch.tensor(X_data, dtype=torch.float32)
        self.y_data = torch.tensor(y_data, dtype=torch.long)

    def __getitem__(self, index):
        return self.x_data[index], self.y_data[index]

    def __len__(self):
        return self.n_samples

def train():
    print("=" * 60)
    print("[+] Starting PyTorch Deep Learning Chatbot Training Pipeline")
    print("=" * 60)

    # 1. Load intents dataset
    intents_file = os.path.join("data", "intents.json")
    with open(intents_file, "r", encoding="utf-8") as f:
        intents = json.load(f)

    all_words = []
    tags = []
    xy = []

    # 2. Extract patterns and tags
    for intent in intents["intents"]:
        tag = intent["tag"]
        if tag not in tags:
            tags.append(tag)
        for pattern in intent["patterns"]:
            w = tokenize(pattern)
            all_words.extend(w)
            xy.append((w, tag))

    ignore_words = ["?", "!", ".", ","]
    all_words = [stem(w) for w in all_words if w not in ignore_words]
    all_words = sorted(set(all_words))
    tags = sorted(set(tags))

    print(f"[*] Dataset Stats:")
    print(f"   - Patterns count: {len(xy)}")
    print(f"   - Unique Intent Tags ({len(tags)}): {tags}")
    print(f"   - Vocabulary size: {len(all_words)} words")

    # 3. Create training data
    X_train = []
    y_train = []

    for (pattern_sentence, tag) in xy:
        bag = bag_of_words(pattern_sentence, all_words)
        X_train.append(bag)
        label = tags.index(tag)
        y_train.append(label)

    X_train = np.array(X_train)
    y_train = np.array(y_train)

    # 4. PyTorch DataLoader
    batch_size = 8
    dataset = ChatDataset(X_train, y_train)
    train_loader = DataLoader(dataset=dataset, batch_size=batch_size, shuffle=True)

    # 5. Hyperparameters & Model Setup
    input_size = len(all_words)
    hidden_size1 = 128
    hidden_size2 = 64
    output_size = len(tags)
    learning_rate = 0.003
    num_epochs = 300

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training Device: {device}")

    model = IntentClassifierDNN(input_size, hidden_size1, hidden_size2, output_size).to(device)

    # 6. Loss and Optimizer
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    # 7. Training Loop
    best_acc = 0.0
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

        epoch_loss = total_loss / total
        epoch_acc = (correct / total) * 100

        if (epoch + 1) % 50 == 0 or epoch == num_epochs - 1:
            print(f"Epoch [{epoch+1}/{num_epochs}] | Loss: {epoch_loss:.4f} | Accuracy: {epoch_acc:.2f}%")

    print("=" * 60)
    print(f"[+] Training Complete! Final Accuracy: {epoch_acc:.2f}%")

    # 8. Save Model and Metadata
    os.makedirs("data", exist_ok=True)
    model_save_path = os.path.join("data", "model.pth")
    meta_save_path = os.path.join("data", "model_data.json")

    # Save model weights
    torch.save(model.state_dict(), model_save_path)

    # Save dataset metadata for inference
    data_meta = {
        "input_size": input_size,
        "hidden_size1": hidden_size1,
        "hidden_size2": hidden_size2,
        "output_size": output_size,
        "all_words": all_words,
        "tags": tags,
        "final_accuracy": epoch_acc,
        "epochs": num_epochs
    }

    with open(meta_save_path, "w", encoding="utf-8") as f:
        json.dump(data_meta, f, indent=2)

    print(f"[+] Saved Model Checkpoint to: {model_save_path}")
    print(f"[+] Saved Vocabulary & Config to: {meta_save_path}")
    print("=" * 60)

if __name__ == "__main__":
    train()
