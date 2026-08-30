import torch
import torch.nn as nn

class IntentClassifierDNN(nn.Module):
    """
    Deep Neural Network (DNN) for Chatbot Intent Classification.
    
    Architecture:
    - Input Layer: Vectorized Bag-of-Words / Token Feature Matrix
    - Hidden Layer 1: Linear(input_size, 128) -> BatchNorm1d -> ReLU -> Dropout(0.3)
    - Hidden Layer 2: Linear(128, 64) -> BatchNorm1d -> ReLU -> Dropout(0.2)
    - Output Layer: Linear(64, num_classes)
    """
    def __init__(self, input_size: int, hidden_size1: int, hidden_size2: int, num_classes: int):
        super(IntentClassifierDNN, self).__init__()
        self.fc1 = nn.Linear(input_size, hidden_size1)
        self.bn1 = nn.BatchNorm1d(hidden_size1)
        self.relu1 = nn.ReLU()
        self.dropout1 = nn.Dropout(0.3)
        
        self.fc2 = nn.Linear(hidden_size1, hidden_size2)
        self.bn2 = nn.BatchNorm1d(hidden_size2)
        self.relu2 = nn.ReLU()
        self.dropout2 = nn.Dropout(0.2)
        
        self.fc3 = nn.Linear(hidden_size2, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Handle 1D input tensor during batch dimension check if needed
        is_single = x.ndim == 1
        if is_single:
            x = x.unsqueeze(0)

        out = self.fc1(x)
        if out.shape[0] > 1:
            out = self.bn1(out)
        out = self.relu1(out)
        out = self.dropout1(out)

        out = self.fc2(out)
        if out.shape[0] > 1:
            out = self.bn2(out)
        out = self.relu2(out)
        out = self.dropout2(out)

        out = self.fc3(out)
        
        if is_single:
            out = out.squeeze(0)
            
        return out
