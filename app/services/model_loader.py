"""
Model loading utilities to handle PyTorch model loading with custom classes
Supports Diabetes, Iron Deficiency Anemia, CKD, and Parathyroid models
"""

import sys
from pathlib import Path
import torch
import torch.nn as nn

# Add project root to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

# Define the Diabetes Progression LSTM model class
class ProgressionBiLSTM(nn.Module):
    """Diabetes Progression BiLSTM Model"""
    def __init__(self, input_size, hidden_size, num_layers, num_classes):
        super(ProgressionBiLSTM, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, bidirectional=True, dropout=0.2 if num_layers > 1 else 0)
        self.dropout = nn.Dropout(0.4)
        self.fc1 = nn.Linear(hidden_size * 2, 64) 
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(64, num_classes)
    
    def forward(self, x):
        _, (h_n, _) = self.lstm(x)
        out = torch.cat((h_n[-2,:,:], h_n[-1,:,:]), dim=1)
        out = self.dropout(out)
        out = self.fc1(out)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.fc2(out)
        return out

# Define the Anemia Progression LSTM model class
class AnemiaProgressionBiLSTM(nn.Module):
    """Iron Deficiency Anemia Progression BiLSTM Model"""
    def __init__(self, input_size, hidden_size, num_layers, num_classes):
        super(AnemiaProgressionBiLSTM, self).__init__()
        self.lstm = nn.LSTM(
            input_size, 
            hidden_size, 
            num_layers, 
            batch_first=True, 
            bidirectional=True, 
            dropout=0.4 if num_layers > 1 else 0
        )
        self.dropout = nn.Dropout(0.5)
        self.fc1 = nn.Linear(hidden_size * 2, 128)
        self.relu = nn.ReLU()
        self.batch_norm = nn.BatchNorm1d(128)
        self.fc2 = nn.Linear(128, 64)
        self.fc3 = nn.Linear(64, num_classes)
    
    def forward(self, x):
        # LSTM layer
        _, (h_n, _) = self.lstm(x)
        
        # Concatenate forward and backward hidden states
        out = torch.cat((h_n[-2,:,:], h_n[-1,:,:]), dim=1)
        
        # Fully connected layers with dropout
        out = self.dropout(out)
        out = self.fc1(out)
        out = self.relu(out)
        out = self.batch_norm(out)
        out = self.dropout(out)
        out = self.fc2(out)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.fc3(out)
        
        return out

# Define the CKD Progression LSTM model class
class CKDProgressionBiLSTM(nn.Module):
    """Chronic Kidney Disease Progression BiLSTM Model"""
    def __init__(self, input_size, hidden_size=40, num_layers=2, num_classes=5, dropout=0.6):
        super(CKDProgressionBiLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, 
                           batch_first=True, bidirectional=True, dropout=dropout)
        self.fc1 = nn.Linear(hidden_size * 2, 40)
        self.dropout1 = nn.Dropout(dropout)
        self.fc2 = nn.Linear(40, 28)
        self.dropout2 = nn.Dropout(dropout * 0.9)
        self.fc3 = nn.Linear(28, num_classes)
    
    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]  # Take the last output
        out = self.fc1(out)
        out = torch.relu(out)
        out = self.dropout1(out)
        out = self.fc2(out)
        out = torch.relu(out)
        out = self.dropout2(out)
        out = self.fc3(out)
        return out


class ParathyroidProgressionBiLSTM(nn.Module):
    """Parathyroid Disorder Progression BiLSTM Model"""
    def __init__(self, input_size, hidden_size=32, num_layers=2, num_classes=3, dropout=0.4):
        super(ParathyroidProgressionBiLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.lstm = nn.LSTM(
            input_size,
            hidden_size,
            num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0
        )
        self.fc1 = nn.Linear(hidden_size * 2, 32)
        self.dropout1 = nn.Dropout(dropout)
        self.fc2 = nn.Linear(32, 16)
        self.dropout2 = nn.Dropout(dropout * 0.8)
        self.fc3 = nn.Linear(16, num_classes)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]
        out = self.fc1(out)
        out = torch.relu(out)
        out = self.dropout1(out)
        out = self.fc2(out)
        out = torch.relu(out)
        out = self.dropout2(out)
        out = self.fc3(out)
        return out

def load_lstm_model(model_path: str, device: str = 'cpu', model_type: str = 'diabetes'):
    """Load the LSTM model with proper class availability
    
    Args:
        model_path: Path to the model file
        device: Device to load model on ('cpu' or 'cuda')
        model_type: Type of model ('diabetes' or 'anemia')
    """
    try:
        # Register all model classes in the __main__ module
        import __main__
        __main__.ProgressionBiLSTM = ProgressionBiLSTM
        __main__.AnemiaProgressionBiLSTM = AnemiaProgressionBiLSTM
        __main__.CKDProgressionBiLSTM = CKDProgressionBiLSTM
        __main__.ParathyroidProgressionBiLSTM = ParathyroidProgressionBiLSTM
        
        # Load the checkpoint
        checkpoint_data = torch.load(model_path, map_location=device, weights_only=False)
        
        # Select the appropriate model class
        if model_type == 'anemia':
            ModelClass = AnemiaProgressionBiLSTM
        elif model_type == 'ckd':
            ModelClass = CKDProgressionBiLSTM
        elif model_type == 'parathyroid':
            ModelClass = ParathyroidProgressionBiLSTM
        else:
            ModelClass = ProgressionBiLSTM
        
        # Handle different save formats
        if isinstance(checkpoint_data, dict) and ('input_size' in checkpoint_data or 'state_dict' in checkpoint_data):
            # Full checkpoint with metadata
            checkpoint = checkpoint_data
            if model_type == 'ckd':
                # CKD model has dropout parameter
                model = ModelClass(
                    checkpoint.get('input_size', 15),  # 15 features for CKD
                    checkpoint.get('hidden_size', 40),
                    checkpoint.get('num_layers', 2),
                    checkpoint.get('num_classes', 6),  # 6 progression outcomes
                    checkpoint.get('dropout', 0.6)
                )
            elif model_type == 'parathyroid':
                model = ModelClass(
                    checkpoint.get('input_size', 8),
                    checkpoint.get('hidden_size', 32),
                    checkpoint.get('num_layers', 2),
                    checkpoint.get('num_classes', 3),
                    checkpoint.get('dropout', 0.4)
                )
            else:
                model = ModelClass(
                    checkpoint['input_size'],
                    checkpoint['hidden_size'],
                    checkpoint['num_layers'],
                    checkpoint['num_classes']
                )
            
            # Load state dict (try both possible keys)
            if 'state_dict' in checkpoint:
                model.load_state_dict(checkpoint['state_dict'])
            elif 'model_state_dict' in checkpoint:
                model.load_state_dict(checkpoint['model_state_dict'])
            else:
                # If checkpoint is the state dict itself
                model.load_state_dict(checkpoint)
        else:
            # Only state_dict was saved (CKD case)
            if model_type == 'ckd':
                # CKD model parameters (from ckd_progression_lstm.py)
                model = ModelClass(
                    input_size=15,  # 15 features
                    hidden_size=40,
                    num_layers=2,
                    num_classes=6,  # 6 progression outcomes: Normal, Stable, Slowly Progressing, Rapidly Progressing, Improving, ESRD
                    dropout=0.6
                )
                model.load_state_dict(checkpoint_data)
                # Create a minimal checkpoint for compatibility
                checkpoint = {
                    'input_size': 15,
                    'hidden_size': 40,
                    'num_layers': 2,
                    'num_classes': 6,
                    'dropout': 0.6
                }
            elif model_type == 'parathyroid':
                model = ModelClass(
                    input_size=8,
                    hidden_size=32,
                    num_layers=2,
                    num_classes=3,
                    dropout=0.4
                )
                model.load_state_dict(checkpoint_data)
                checkpoint = {
                    'input_size': 8,
                    'hidden_size': 32,
                    'num_layers': 2,
                    'num_classes': 3,
                    'dropout': 0.4
                }
            else:
                raise ValueError(f"Unexpected checkpoint format for {model_type}")
        
        model.eval()
        
        return model, checkpoint
    except Exception as e:
        print(f"Error loading LSTM model: {e}")
        return None, None
