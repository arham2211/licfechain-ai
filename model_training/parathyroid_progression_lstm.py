"""
Parathyroid progression model training (BiLSTM).
Predicts progression class from sequence of parathyroid panels.
"""

import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras.preprocessing.sequence import pad_sequences
from torch.utils.data import DataLoader, Dataset


FEATURES = [
    "pth",
    "calcium",
    "phosphorus",
    "vitamin_d",
    "creatinine",
    "egfr",
    "alkaline_phosphatase",
    "albumin",
]

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data generation"
MODELS_DIR = PROJECT_ROOT / "models"


class PatientDataset(Dataset):
    def __init__(self, sequences, labels):
        self.sequences = torch.tensor(sequences, dtype=torch.float32)
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self):
        return len(self.sequences)

    def __getitem__(self, idx):
        return self.sequences[idx], self.labels[idx]


class ParathyroidProgressionBiLSTM(nn.Module):
    def __init__(self, input_size, hidden_size=32, num_layers=2, num_classes=3, dropout=0.4):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size,
            hidden_size,
            num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.fc1 = nn.Linear(hidden_size * 2, 32)
        self.drop1 = nn.Dropout(dropout)
        self.fc2 = nn.Linear(32, 16)
        self.drop2 = nn.Dropout(dropout * 0.8)
        self.out = nn.Linear(16, num_classes)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]
        out = torch.relu(self.fc1(out))
        out = self.drop1(out)
        out = torch.relu(self.fc2(out))
        out = self.drop2(out)
        return self.out(out)


def load_data(prefix: str = "generated_parathyroid_") -> pd.DataFrame:
    reports = pd.read_json(DATA_DIR / f"{prefix}lab_reports.json")
    results = pd.read_json(DATA_DIR / f"{prefix}lab_test_results.json")
    progressions = pd.read_json(DATA_DIR / f"{prefix}disease_progressions.json")

    pivot = results.pivot_table(index="report_id", columns="test_name", values="test_value", aggfunc="first").reset_index()
    df = reports.merge(pivot, on="report_id", how="left")

    for feat in FEATURES:
        if feat not in df.columns:
            df[feat] = 0.0
        df[feat] = df[feat].fillna(df[feat].median())

    label_map = progressions.set_index("patient_id")["progression_stage"].to_dict()
    df["progression"] = df["patient_id"].map(label_map)
    df = df.dropna(subset=["progression"]).copy()
    return df.sort_values(["patient_id", "report_date"])


def main() -> None:
    df = load_data()
    grouped = df.groupby("patient_id")
    sequences = []
    labels = []
    for _, group in grouped:
        sequences.append(group[FEATURES].values)
        labels.append(group["progression"].iloc[-1])

    max_length = 20
    X = pad_sequences(sequences, maxlen=max_length, dtype="float32", padding="pre", truncating="pre")
    enc = LabelEncoder()
    y = enc.fit_transform(labels)

    X_train_full, X_test, y_train_full, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_full, y_train_full, test_size=0.15, random_state=42, stratify=y_train_full
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train.reshape(-1, X_train.shape[-1])).reshape(X_train.shape)
    X_val_scaled = scaler.transform(X_val.reshape(-1, X_val.shape[-1])).reshape(X_val.shape)
    X_test_scaled = scaler.transform(X_test.reshape(-1, X_test.shape[-1])).reshape(X_test.shape)

    train_loader = DataLoader(PatientDataset(X_train_scaled, y_train), batch_size=32, shuffle=True)
    val_loader = DataLoader(PatientDataset(X_val_scaled, y_val), batch_size=64, shuffle=False)
    test_loader = DataLoader(PatientDataset(X_test_scaled, y_test), batch_size=32, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device}")
    print(f"Classes: {list(enc.classes_)}")
    unique, counts = np.unique(y, return_counts=True)
    print("Class distribution:", {enc.inverse_transform([u])[0]: int(c) for u, c in zip(unique, counts)})

    model = ParathyroidProgressionBiLSTM(
        input_size=len(FEATURES),
        hidden_size=48,
        num_layers=2,
        num_classes=len(enc.classes_),
        dropout=0.30,
    ).to(device)

    class_weights = compute_class_weight(
        class_weight="balanced",
        classes=np.unique(y_train),
        y=y_train
    )
    class_weights_tensor = torch.tensor(class_weights, dtype=torch.float32).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0008, weight_decay=0.004)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", factor=0.5, patience=4
    )

    epochs = 60
    best_val_f1 = -1.0
    best_state = None
    patience = 10
    patience_counter = 0

    for epoch in range(epochs):
        model.train()
        epoch_loss = 0.0
        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            epoch_loss += loss.item()

        # Validation (macro F1 is better than plain accuracy for multi-class balance)
        model.eval()
        val_preds = []
        val_true = []
        with torch.no_grad():
            for xb, yb in val_loader:
                xb = xb.to(device)
                logits = model(xb)
                pred = torch.argmax(logits, dim=1).cpu().numpy()
                val_preds.extend(pred)
                val_true.extend(yb.numpy())

        val_f1 = f1_score(val_true, val_preds, average="macro")
        val_acc = accuracy_score(val_true, val_preds)
        scheduler.step(val_f1)

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1

        if (epoch + 1) % 5 == 0:
            print(
                f"Epoch {epoch + 1}/{epochs} "
                f"train_loss={epoch_loss/len(train_loader):.4f} "
                f"val_acc={val_acc:.4f} val_macro_f1={val_f1:.4f}"
            )

        if patience_counter >= patience:
            print(f"Early stopping at epoch {epoch + 1}; best val macro F1={best_val_f1:.4f}")
            break

    if best_state is not None:
        model.load_state_dict(best_state)

    model.eval()
    all_preds = []
    all_true = []
    with torch.no_grad():
        for xb, yb in test_loader:
            xb = xb.to(device)
            logits = model(xb)
            pred = torch.argmax(logits, dim=1).cpu().numpy()
            all_preds.extend(pred)
            all_true.extend(yb.numpy())

    acc = accuracy_score(all_true, all_preds)
    macro_f1 = f1_score(all_true, all_preds, average="macro")
    weighted_f1 = f1_score(all_true, all_preds, average="weighted")
    print(f"Test accuracy: {acc:.4f}")
    print(f"Test macro F1: {macro_f1:.4f}")
    print(f"Test weighted F1: {weighted_f1:.4f}")
    print(classification_report(
        enc.inverse_transform(all_true),
        enc.inverse_transform(all_preds),
        zero_division=0
    ))

    os.makedirs(MODELS_DIR, exist_ok=True)
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "input_size": len(FEATURES),
            "hidden_size": 48,
            "num_layers": 2,
            "num_classes": len(enc.classes_),
            "dropout": 0.30,
            "max_length": max_length,
            "val_macro_f1_best": best_val_f1,
        },
        MODELS_DIR / "parathyroid_progression_lstm_model.pth",
    )
    joblib.dump(scaler, MODELS_DIR / "parathyroid_progression_scaler.pkl")
    joblib.dump(enc, MODELS_DIR / "parathyroid_progression_encoder.pkl")
    with open(MODELS_DIR / "parathyroid_progression_features.json", "w", encoding="utf-8") as f:
        json.dump(FEATURES, f, indent=2)
    with open(MODELS_DIR / "parathyroid_progression_metrics.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "accuracy": acc,
                "macro_f1": macro_f1,
                "weighted_f1": weighted_f1,
                "best_val_macro_f1": best_val_f1,
            },
            f,
            indent=2,
        )

    print("Saved parathyroid progression model artifacts in models/")


if __name__ == "__main__":
    main()
