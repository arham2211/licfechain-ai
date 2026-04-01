"""
Parathyroid diagnosis model training (XGBoost multi-class).
Uses generated_parathyroid_* JSON files.
"""

import json
import os
from pathlib import Path

import joblib
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder


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


def load_and_prepare_data(prefix: str = "generated_parathyroid_") -> pd.DataFrame:
    print("Loading generated parathyroid files...")
    lab_reports = pd.read_json(DATA_DIR / f"{prefix}lab_reports.json")
    lab_results = pd.read_json(DATA_DIR / f"{prefix}lab_test_results.json")
    diagnoses = pd.read_json(DATA_DIR / f"{prefix}diagnoses.json")

    lab_pivot = (
        lab_results.pivot_table(index="report_id", columns="test_name", values="test_value", aggfunc="first")
        .reset_index()
    )
    df = lab_reports.merge(lab_pivot, on="report_id", how="left")
    df = df.merge(diagnoses[["visit_id", "disease_name"]], on="visit_id", how="left")
    df = df.rename(columns={"disease_name": "diagnosis"})

    for feat in FEATURES:
        if feat not in df.columns:
            df[feat] = 0.0
        df[feat] = df[feat].fillna(df[feat].median())

    valid_labels = [
        "Normal Parathyroid Function",
        "Primary Hyperparathyroidism",
        "Secondary Hyperparathyroidism",
        "Hypoparathyroidism",
        "Indeterminate Parathyroid Pattern",
    ]
    df = df[df["diagnosis"].isin(valid_labels)].copy()
    print(f"Prepared {len(df)} training rows")
    return df


def main() -> None:
    df = load_and_prepare_data()

    X = df[FEATURES]
    y_text = df["diagnosis"]
    encoder = LabelEncoder()
    y = encoder.fit_transform(y_text)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=250,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="multi:softprob",
        eval_metric="mlogloss",
        random_state=42,
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv, scoring="accuracy", n_jobs=-1)
    print(f"CV accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std() * 2:.4f})")

    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    acc = accuracy_score(y_test, preds)
    f1 = f1_score(y_test, preds, average="weighted")
    print(f"Test accuracy: {acc:.4f}")
    print(f"Weighted F1: {f1:.4f}")
    print(classification_report(encoder.inverse_transform(y_test), encoder.inverse_transform(preds)))

    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(model, MODELS_DIR / "parathyroid_diagnosis_xgb_model.pkl")
    joblib.dump(encoder, MODELS_DIR / "parathyroid_diagnosis_label_encoder.pkl")

    with open(MODELS_DIR / "parathyroid_diagnosis_features.json", "w", encoding="utf-8") as f:
        json.dump(FEATURES, f, indent=2)

    metrics = {"accuracy": acc, "f1_weighted": f1}
    with open(MODELS_DIR / "parathyroid_diagnosis_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print("Saved parathyroid diagnosis model artifacts in models/")


if __name__ == "__main__":
    main()
