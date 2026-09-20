import torch
import torch.nn as nn

class IntentClassifierDNN(nn.Module):
    """
    Upgraded Deep Neural Network (DNN) for Chatbot Intent Classification.
    
    Architecture:
    - Input Layer: Vectorized N-gram Feature Matrix (Unigrams + Bigrams)
    - Hidden Layer 1: Linear(input_size, hidden_size1) -> LayerNorm -> GELU -> Dropout(0.3)
    - Hidden Layer 2: Linear(hidden_size1, hidden_size2) -> LayerNorm -> GELU -> Dropout(0.2)
    - Output Layer: Linear(hidden_size2, num_classes)
    
    Features:
    - LayerNorm ensures stable normalization regardless of batch size (batch=1 safe).
    - GELU activation offers smooth non-linearity and superior gradient flow.
    """
    def __init__(self, input_size: int, hidden_size1: int = 128, hidden_size2: int = 64, num_classes: int = 25):
        super(IntentClassifierDNN, self).__init__()
        self.fc1 = nn.Linear(input_size, hidden_size1)
        self.norm1 = nn.LayerNorm(hidden_size1)
        self.act1 = nn.GELU()
        self.dropout1 = nn.Dropout(0.3)
        
        self.fc2 = nn.Linear(hidden_size1, hidden_size2)
        self.norm2 = nn.LayerNorm(hidden_size2)
        self.act2 = nn.GELU()
        self.dropout2 = nn.Dropout(0.2)
        
        self.fc3 = nn.Linear(hidden_size2, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        is_single = x.ndim == 1
        if is_single:
            x = x.unsqueeze(0)

        out = self.fc1(x)
        out = self.norm1(out)
        out = self.act1(out)
        out = self.dropout1(out)

        out = self.fc2(out)
        out = self.norm2(out)
        out = self.act2(out)
        out = self.dropout2(out)

        out = self.fc3(out)
        
        if is_single:
            out = out.squeeze(0)
            
        return out
