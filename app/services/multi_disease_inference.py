"""
Multi-Disease Inference Service
Handles predictions for both Diabetes and Iron Deficiency Anemia
"""

import pickle
import json
import numpy as np
import torch
import joblib
from pathlib import Path
from typing import Dict, List, Any, Optional
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.preprocessing.sequence import pad_sequences

from app.services.model_loader import load_lstm_model

class MultiDiseaseInference:
    """Handles ML predictions for multiple diseases"""
    
    def __init__(self):
        self.models_dir = Path("models")
        self.models = {
            'diabetes': {},
            'anemia': {},
            'ckd': {},
            'parathyroid': {}
        }
        self._models_loaded = False
    
    def reload_models(self):
        """Force reload all models (clears cache)"""
        self._models_loaded = False
        self.models = {
            'diabetes': {},
            'anemia': {},
            'ckd': {},
            'parathyroid': {}
        }
        self.load_models()
    
    def load_models(self):
        """Load all disease models"""
        print("Loading ML models...")
        
        try:
            # Load Diabetes Models
            self._load_diabetes_models()
            
            # Load Anemia Models
            self._load_anemia_models()
            
            # Load CKD Models
            self._load_ckd_models()

            # Parathyroid currently uses rule-based inference until
            # dedicated trained models are added to the repository.
            self._load_parathyroid_models()
            
            self._models_loaded = True
            print("✅ All models loaded successfully!")
            
        except Exception as e:
            print(f"❌ Error loading models: {e}")
            raise
    
    def _load_diabetes_models(self):
        """Load diabetes diagnosis and progression models"""
        print("\n📊 Loading Diabetes models...")
        
        # Load XGBoost diagnosis model
        diagnosis_path = self.models_dir / "diabetes_diagnosis_xgb.pkl"
        if diagnosis_path.exists():
            with open(diagnosis_path, 'rb') as f:
                loaded_data = pickle.load(f)
                # Handle both dict format and direct model object
                if isinstance(loaded_data, dict):
                    if 'model' in loaded_data:
                        # Extract the actual model from dict
                        self.models['diabetes']['diagnosis'] = loaded_data['model']
                        self.models['diabetes']['diagnosis_features'] = loaded_data.get('feature_columns', [])
                        print(f"  ✅ Diabetes diagnosis model extracted from dict. Model type: {type(loaded_data['model'])}")
                    else:
                        raise ValueError(f"Diabetes model file contains dict but no 'model' key. Keys found: {list(loaded_data.keys())}")
                else:
                    # Direct model object
                    self.models['diabetes']['diagnosis'] = loaded_data
                    print(f"  ✅ Diabetes diagnosis model loaded directly. Model type: {type(loaded_data)}")
            
            # Verify the loaded model has predict method
            if not hasattr(self.models['diabetes']['diagnosis'], 'predict'):
                raise ValueError(f"Loaded diabetes model does not have 'predict' method. Type: {type(self.models['diabetes']['diagnosis'])}")
            
            print("  ✅ Diabetes diagnosis model loaded and verified")
        
        # Load LSTM progression model
        progression_path = self.models_dir / "diabetes_progression_lstm.pth"
        if progression_path.exists():
            model, checkpoint = load_lstm_model(str(progression_path), device='cpu', model_type='diabetes')
            
            # Load full checkpoint to get scaler and encoder
            import torch
            full_checkpoint = torch.load(str(progression_path), map_location='cpu', weights_only=False)
            
            # Extract scaler and encoder if available
            scaler = full_checkpoint.get('scaler')
            encoder = full_checkpoint.get('encoder')
            features = full_checkpoint.get('feature_columns', [
                'fasting_glucose', 'hba1c', 'hdl', 'ldl', 'triglycerides',
                'total_cholesterol', 'creatinine', 'bmi', 'systolic_bp', 'diastolic_bp'
            ])
            
            self.models['diabetes']['progression'] = {
                'model': model,
                'checkpoint': checkpoint,
                'scaler': scaler,
                'encoder': encoder,
                'features': features,
                'max_length': 25  # From train_models.py
            }
            print("  ✅ Diabetes progression model loaded")
            if scaler:
                print("  ✅ Diabetes progression scaler loaded")
            if encoder:
                print("  ✅ Diabetes progression encoder loaded")
    
    def _load_anemia_models(self):
        """Load anemia diagnosis and progression models"""
        print("\n🩸 Loading Anemia models...")
        
        # Load XGBoost diagnosis model
        diagnosis_path = self.models_dir / "anemia_diagnosis_xgb.pkl"
        if diagnosis_path.exists():
            with open(diagnosis_path, 'rb') as f:
                self.models['anemia']['diagnosis'] = pickle.load(f)
            print("  ✅ Anemia diagnosis model loaded")
        
        # Load diagnosis features
        features_path = self.models_dir / "anemia_diagnosis_features.json"
        if features_path.exists():
            with open(features_path, 'r') as f:
                self.models['anemia']['diagnosis_features'] = json.load(f)
            print("  ✅ Anemia diagnosis features loaded")
        
        # Load LSTM progression model
        progression_path = self.models_dir / "anemia_progression_lstm.pth"
        if progression_path.exists():
            model, checkpoint = load_lstm_model(str(progression_path), device='cpu', model_type='anemia')
            self.models['anemia']['progression'] = {
                'model': model,
                'checkpoint': checkpoint
            }
            print("  ✅ Anemia progression model loaded")
        
        # Load scaler and encoder for progression
        scaler_path = self.models_dir / "anemia_progression_scaler.pkl"
        encoder_path = self.models_dir / "anemia_progression_encoder.pkl"
        config_path = self.models_dir / "anemia_progression_config.json"
        
        if scaler_path.exists():
            with open(scaler_path, 'rb') as f:
                self.models['anemia']['progression_scaler'] = pickle.load(f)
            print("  ✅ Anemia progression scaler loaded")
        
        if encoder_path.exists():
            with open(encoder_path, 'rb') as f:
                self.models['anemia']['progression_encoder'] = pickle.load(f)
            print("  ✅ Anemia progression encoder loaded")
        
        if config_path.exists():
            with open(config_path, 'r') as f:
                self.models['anemia']['progression_config'] = json.load(f)
            print("  ✅ Anemia progression config loaded")
    
    def _load_ckd_models(self):
        """Load CKD diagnosis and progression models"""
        print("\n🫘 Loading CKD models...")
        
        # Load XGBoost diagnosis model (saved with joblib)
        diagnosis_path = self.models_dir / "ckd_diagnosis_xgb_model.pkl"
        if diagnosis_path.exists():
            self.models['ckd']['diagnosis'] = joblib.load(diagnosis_path)
            print("  ✅ CKD diagnosis model loaded")
        
        # Load diagnosis features
        features_path = self.models_dir / "ckd_diagnosis_features.json"
        if features_path.exists():
            with open(features_path, 'r') as f:
                self.models['ckd']['diagnosis_features'] = json.load(f)
            print("  ✅ CKD diagnosis features loaded")
        
        # Load label encoder (saved with joblib)
        label_encoder_path = self.models_dir / "ckd_diagnosis_label_encoder.pkl"
        if label_encoder_path.exists():
            self.models['ckd']['diagnosis_encoder'] = joblib.load(label_encoder_path)
            print("  ✅ CKD diagnosis label encoder loaded")
        
        # Load LSTM progression model
        progression_path = self.models_dir / "ckd_progression_lstm_model.pth"
        if progression_path.exists():
            model, checkpoint = load_lstm_model(str(progression_path), device='cpu', model_type='ckd')
            self.models['ckd']['progression'] = {
                'model': model,
                'checkpoint': checkpoint
            }
            print("  ✅ CKD progression model loaded")
        
        # Load scaler and encoder for progression
        scaler_path = self.models_dir / "ckd_progression_scaler.pkl"
        encoder_path = self.models_dir / "ckd_progression_encoder.pkl"
        features_path = self.models_dir / "ckd_progression_features.json"
        
        if scaler_path.exists():
            self.models['ckd']['progression_scaler'] = joblib.load(scaler_path)
            print("  ✅ CKD progression scaler loaded")
        
        if encoder_path.exists():
            self.models['ckd']['progression_encoder'] = joblib.load(encoder_path)
            print("  ✅ CKD progression encoder loaded")
        
        if features_path.exists():
            with open(features_path, 'r') as f:
                features = json.load(f)
                self.models['ckd']['progression_config'] = {
                    'features': features,
                    'max_length': 25  # From ckd_progression_lstm.py
                }
            print("  ✅ CKD progression config loaded")

    def _load_parathyroid_models(self):
        """Load parathyroid ML models, with rule-based fallback."""
        print("\n🧠 Loading Parathyroid support...")

        # Defaults
        self.models['parathyroid']['diagnosis'] = "rule_based"
        self.models['parathyroid']['progression'] = "rule_based"

        # Diagnosis model
        diagnosis_path = self.models_dir / "parathyroid_diagnosis_xgb_model.pkl"
        diagnosis_encoder_path = self.models_dir / "parathyroid_diagnosis_label_encoder.pkl"
        diagnosis_features_path = self.models_dir / "parathyroid_diagnosis_features.json"
        if diagnosis_path.exists() and diagnosis_encoder_path.exists():
            self.models['parathyroid']['diagnosis'] = joblib.load(diagnosis_path)
            self.models['parathyroid']['diagnosis_encoder'] = joblib.load(diagnosis_encoder_path)
            print("  ✅ Parathyroid diagnosis model loaded")

            if diagnosis_features_path.exists():
                with open(diagnosis_features_path, 'r') as f:
                    self.models['parathyroid']['diagnosis_features'] = json.load(f)
                print("  ✅ Parathyroid diagnosis features loaded")

        # Progression model
        progression_path = self.models_dir / "parathyroid_progression_lstm_model.pth"
        progression_scaler_path = self.models_dir / "parathyroid_progression_scaler.pkl"
        progression_encoder_path = self.models_dir / "parathyroid_progression_encoder.pkl"
        progression_features_path = self.models_dir / "parathyroid_progression_features.json"
        if progression_path.exists() and progression_scaler_path.exists() and progression_encoder_path.exists():
            model, checkpoint = load_lstm_model(str(progression_path), device='cpu', model_type='parathyroid')
            if model is not None:
                self.models['parathyroid']['progression'] = {
                    'model': model,
                    'checkpoint': checkpoint
                }
                self.models['parathyroid']['progression_scaler'] = joblib.load(progression_scaler_path)
                self.models['parathyroid']['progression_encoder'] = joblib.load(progression_encoder_path)
                print("  ✅ Parathyroid progression model loaded")

                if progression_features_path.exists():
                    with open(progression_features_path, 'r') as f:
                        features = json.load(f)
                    self.models['parathyroid']['progression_config'] = {
                        'features': features,
                        'max_length': 20
                    }
                    print("  ✅ Parathyroid progression config loaded")

        if self.models['parathyroid']['diagnosis'] == "rule_based" or self.models['parathyroid']['progression'] == "rule_based":
            print("  ⚠️  Using rule-based fallback for missing parathyroid model artifacts")

    def _normalize_parathyroid_features(self, patient_data: Dict[str, float]) -> Dict[str, float]:
        """Normalize common aliases for parathyroid-related lab features."""
        aliases = {
            'pth': ['parathyroid_hormone', 'intact_pth', 'iPTH'],
            'calcium': ['serum_calcium', 'ca'],
            'phosphorus': ['phosphate', 'serum_phosphorus'],
            'vitamin_d': ['vitamin_d_25oh', 'vitamin_d_25_oh', 'vitamin_d3'],
            'creatinine': ['serum_creatinine', 'cr'],
            'egfr': ['e_gfr', 'estimated_gfr'],
            'alkaline_phosphatase': ['alp', 'alk_phos']
        }

        normalized = dict(patient_data)
        for canonical, keys in aliases.items():
            if canonical in normalized:
                continue
            for key in keys:
                if key in normalized:
                    normalized[canonical] = normalized[key]
                    break
        return normalized
    
    def predict_diabetes_diagnosis(self, patient_data: Dict[str, float]) -> Dict[str, Any]:
        """Predict diabetes diagnosis from single visit data"""
        if not self._models_loaded:
            self.load_models()
        
        model = self.models['diabetes'].get('diagnosis')
        
        # Verify model is loaded and is actually a model object
        if model is None:
            raise ValueError("Diabetes diagnosis model not loaded. Please ensure models/diabetes_diagnosis_xgb.pkl exists.")
        
        # If model is still a dict, try to extract it (safety check for cached models)
        if isinstance(model, dict):
            if 'model' in model:
                # Fix it on the fly
                self.models['diabetes']['diagnosis'] = model['model']
                model = model['model']
                print("⚠️  WARNING: Diabetes model was a dict, extracted model object. Consider restarting server.")
            else:
                # Try to reload models
                print("⚠️  WARNING: Diabetes model is invalid dict, attempting reload...")
                self.reload_models()
                model = self.models['diabetes'].get('diagnosis')
                if isinstance(model, dict):
                    raise ValueError(f"Diabetes model is a dict but doesn't contain 'model' key. Keys: {list(model.keys())}")
        
        # Verify model has predict method
        if not hasattr(model, 'predict'):
            raise ValueError(f"Loaded object is not a valid model. Type: {type(model)}, has predict: {hasattr(model, 'predict')}")
        
        # Expected features for diabetes
        features = [
            'fasting_glucose', 'hba1c', 'hdl', 'ldl', 'triglycerides',
            'total_cholesterol', 'creatinine', 'bmi', 'systolic_bp', 'diastolic_bp'
        ]
        
        # Prepare input
        X = np.array([[patient_data.get(f, 0.0) for f in features]])
        
        # Predict
        prediction = model.predict(X)[0]
        probabilities = model.predict_proba(X)[0]
        
        diagnosis_map = {0: "Normal", 1: "Prediabetes", 2: "Diabetes"}
        
        return {
            'diagnosis': diagnosis_map[prediction],
            'confidence': float(max(probabilities)),
            'probabilities': {
                'Normal': float(probabilities[0]),
                'Prediabetes': float(probabilities[1]),
                'Diabetes': float(probabilities[2])
            },
            'input_features': patient_data
        }
    
    def predict_anemia_diagnosis(self, patient_data: Dict[str, float]) -> Dict[str, Any]:
        """Predict anemia diagnosis from single visit data"""
        if not self._models_loaded:
            self.load_models()
        
        model = self.models['anemia']['diagnosis']
        features_config = self.models['anemia'].get('diagnosis_features', {})
        
        # Expected features for anemia
        features = features_config.get('features', [
            'hemoglobin', 'hematocrit', 'mcv', 'mch', 'mchc', 'rdw',
            'serum_iron', 'ferritin', 'tibc', 'transferrin_saturation',
            'reticulocyte_count', 'wbc', 'platelet_count', 'esr',
            'bmi', 'systolic_bp', 'diastolic_bp'
        ])
        
        # Prepare input
        X = np.array([[patient_data.get(f, 0.0) for f in features]])
        
        # Predict
        prediction = model.predict(X)[0]
        probabilities = model.predict_proba(X)[0]
        
        diagnosis_map = features_config.get('diagnosis_mapping', {
            0: "Normal",
            1: "Iron Deficiency without Anemia",
            2: "Mild Iron Deficiency Anemia",
            3: "Moderate Iron Deficiency Anemia",
            4: "Severe Iron Deficiency Anemia"
        })
        
        # Handle reversed mapping (diagnosis_name -> label) by inverting it
        if diagnosis_map and len(diagnosis_map) > 0:
            first_key = list(diagnosis_map.keys())[0]
            if isinstance(first_key, str):
                # Mapping is reversed (diagnosis -> label), invert it
                # Values should be integers (labels), keys are diagnosis names
                diagnosis_map = {int(v): k for k, v in diagnosis_map.items()}
        
        target_names = features_config.get('target_names', list(diagnosis_map.values()))
        
        prob_dict = {name: float(probabilities[i]) for i, name in enumerate(target_names)}
        
        return {
            'diagnosis': diagnosis_map[prediction],
            'confidence': float(max(probabilities)),
            'probabilities': prob_dict,
            'input_features': patient_data
        }
    
    def predict_diabetes_progression(self, patient_sequence: List[Dict[str, float]]) -> Dict[str, Any]:
        """Predict diabetes progression from patient visit sequence"""
        if not self._models_loaded:
            self.load_models()
        
        if 'progression' not in self.models['diabetes']:
            raise ValueError("Diabetes progression model not loaded. Please ensure models/diabetes_progression_lstm.pth exists.")
        
        model = self.models['diabetes']['progression']['model']
        checkpoint = self.models['diabetes']['progression']['checkpoint']
        scaler = self.models['diabetes']['progression'].get('scaler')
        encoder = self.models['diabetes']['progression'].get('encoder')
        features = self.models['diabetes']['progression'].get('features', [
            'fasting_glucose', 'hba1c', 'hdl', 'ldl', 'triglycerides',
            'total_cholesterol', 'creatinine', 'bmi', 'systolic_bp', 'diastolic_bp'
        ])
        max_length = self.models['diabetes']['progression'].get('max_length', 25)
        
        # Prepare sequence
        sequence = []
        for visit in patient_sequence:
            visit_data = [visit.get(f, 0.0) for f in features]
            sequence.append(visit_data)
        
        # Pad sequence
        X = pad_sequences([sequence], maxlen=max_length, dtype='float32', padding='pre', truncating='pre')
        
        # Scale if scaler is available
        if scaler:
            X_flat = X.reshape(-1, X.shape[-1])
            X_scaled = scaler.transform(X_flat).reshape(X.shape)
        else:
            X_scaled = X
        
        # Convert to tensor
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        
        # Predict
        model.eval()
        with torch.no_grad():
            outputs = model(X_tensor)
            probabilities = torch.softmax(outputs, dim=1).numpy()[0]
            prediction = torch.argmax(outputs, dim=1).item()
        
        # Get class names
        if encoder:
            progression_classes = encoder.classes_
        else:
            # Default classes if encoder not available
            progression_classes = ['Normal', 'Controlled', 'Uncontrolled', 'Complicated']
        
        prob_dict = {str(cls): float(probabilities[i]) for i, cls in enumerate(progression_classes)}
        
        return {
            'progression': str(progression_classes[prediction]),
            'confidence': float(max(probabilities)),
            'probabilities': prob_dict,
            'num_visits': len(patient_sequence),
            'model_used': 'diabetes_progression_lstm'
        }
    
    def predict_anemia_progression(self, patient_sequence: List[Dict[str, float]]) -> Dict[str, Any]:
        """Predict anemia progression from patient visit sequence"""
        if not self._models_loaded:
            self.load_models()
        
        model = self.models['anemia']['progression']['model']
        checkpoint = self.models['anemia']['progression']['checkpoint']
        scaler = self.models['anemia']['progression_scaler']
        encoder = self.models['anemia']['progression_encoder']
        config = self.models['anemia']['progression_config']
        
        # Get features from config
        features = config.get('features', checkpoint['features'])
        max_length = config.get('max_length', 20)
        
        # Prepare sequence
        sequence = []
        for visit in patient_sequence:
            visit_data = [visit.get(f, 0.0) for f in features]
            sequence.append(visit_data)
        
        # Pad sequence
        X = pad_sequences([sequence], maxlen=max_length, dtype='float32', padding='pre')
        
        # Scale
        X_flat = X.reshape(-1, X.shape[-1])
        X_scaled = scaler.transform(X_flat).reshape(X.shape)
        
        # Convert to tensor
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        
        # Predict
        with torch.no_grad():
            outputs = model(X_tensor)
            probabilities = torch.softmax(outputs, dim=1).numpy()[0]
            prediction = torch.argmax(outputs, dim=1).item()
        
        # Get class names
        progression_classes = encoder.classes_
        
        prob_dict = {str(cls): float(probabilities[i]) for i, cls in enumerate(progression_classes)}
        
        return {
            'progression': str(progression_classes[prediction]),
            'confidence': float(max(probabilities)),
            'probabilities': prob_dict,
            'num_visits': len(patient_sequence)
        }
    
    def predict_ckd_diagnosis(self, patient_data: Dict[str, float]) -> Dict[str, Any]:
        """Predict CKD diagnosis from single visit data"""
        if not self._models_loaded:
            self.load_models()
        
        model = self.models['ckd']['diagnosis']
        encoder = self.models['ckd']['diagnosis_encoder']
        features_config = self.models['ckd'].get('diagnosis_features', [])
        
        # Expected features for CKD
        # features_config is a JSON array, so it's already a list
        if isinstance(features_config, list) and len(features_config) > 0:
            features = features_config
        else:
            # Fallback to default features
            features = [
                'serum_creatinine', 'egfr', 'uacr', 'bun', 'sodium', 'potassium',
                'calcium', 'phosphorus', 'hemoglobin', 'pth', 'bicarbonate',
                'albumin', 'bmi', 'systolic_bp', 'diastolic_bp'
            ]
        
        # Prepare input
        X = np.array([[patient_data.get(f, 0.0) for f in features]])
        
        # Predict
        prediction = model.predict(X)[0]
        probabilities = model.predict_proba(X)[0]
        
        # Decode prediction using label encoder
        diagnosis = encoder.inverse_transform([prediction])[0]
        
        # Get all class names
        class_names = encoder.classes_
        prob_dict = {str(cls): float(probabilities[i]) for i, cls in enumerate(class_names)}
        
        return {
            'diagnosis': str(diagnosis),
            'confidence': float(max(probabilities)),
            'probabilities': prob_dict,
            'input_features': patient_data
        }
    
    def predict_ckd_progression(self, patient_sequence: List[Dict[str, float]]) -> Dict[str, Any]:
        """Predict CKD progression from patient visit sequence"""
        if not self._models_loaded:
            self.load_models()
        
        model = self.models['ckd']['progression']['model']
        checkpoint = self.models['ckd']['progression']['checkpoint']
        scaler = self.models['ckd']['progression_scaler']
        encoder = self.models['ckd']['progression_encoder']
        config = self.models['ckd']['progression_config']
        
        # Get features from config
        features = config.get('features', checkpoint.get('features', []))
        max_length = config.get('max_length', 25)
        
        # Prepare sequence
        sequence = []
        for visit in patient_sequence:
            visit_data = [visit.get(f, 0.0) for f in features]
            sequence.append(visit_data)
        
        # Pad sequence
        X = pad_sequences([sequence], maxlen=max_length, dtype='float32', padding='pre', truncating='pre')
        
        # Scale
        X_flat = X.reshape(-1, X.shape[-1])
        X_scaled = scaler.transform(X_flat).reshape(X.shape)
        
        # Convert to tensor
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        
        # Predict
        with torch.no_grad():
            outputs = model(X_tensor)
            probabilities = torch.softmax(outputs, dim=1).numpy()[0]
            prediction = torch.argmax(outputs, dim=1).item()
        
        # Get class names
        progression_classes = encoder.classes_
        
        prob_dict = {str(cls): float(probabilities[i]) for i, cls in enumerate(progression_classes)}
        
        return {
            'progression': str(progression_classes[prediction]),
            'confidence': float(max(probabilities)),
            'probabilities': prob_dict,
            'num_visits': len(patient_sequence)
        }

    def predict_parathyroid_diagnosis(self, patient_data: Dict[str, float]) -> Dict[str, Any]:
        """
        Rule-based parathyroid diagnosis using typical endocrine lab patterns.
        """
        if not self._models_loaded:
            self.load_models()

        data = self._normalize_parathyroid_features(patient_data)

        # ML-first path (if trained artifacts are available)
        model = self.models['parathyroid'].get('diagnosis')
        encoder = self.models['parathyroid'].get('diagnosis_encoder')
        if model not in (None, "rule_based") and encoder is not None:
            features = self.models['parathyroid'].get('diagnosis_features', [
                'pth', 'calcium', 'phosphorus', 'vitamin_d',
                'creatinine', 'egfr', 'alkaline_phosphatase', 'albumin'
            ])
            X = np.array([[data.get(f, 0.0) for f in features]])
            prediction = model.predict(X)[0]
            probabilities = model.predict_proba(X)[0]
            class_names = encoder.classes_
            prob_dict = {str(cls): float(probabilities[i]) for i, cls in enumerate(class_names)}
            diagnosis = str(encoder.inverse_transform([prediction])[0])
            return {
                'diagnosis': diagnosis,
                'confidence': float(max(probabilities)),
                'probabilities': prob_dict,
                'input_features': data,
                'model_used': 'xgb_parathyroid_v1'
            }

        pth = float(data.get('pth', 0.0))
        calcium = float(data.get('calcium', 0.0))
        phosphorus = float(data.get('phosphorus', 0.0))
        vitamin_d = float(data.get('vitamin_d', 0.0))
        egfr = float(data.get('egfr', 0.0))

        diagnosis = "Normal Parathyroid Function"
        confidence = 0.65
        probabilities = {
            "Normal Parathyroid Function": 0.2,
            "Possible Primary Hyperparathyroidism": 0.2,
            "Possible Secondary Hyperparathyroidism": 0.2,
            "Possible Hypoparathyroidism": 0.2,
            "Indeterminate Parathyroid Pattern": 0.2,
        }

        # Heuristic thresholds (prototype-level rules for pilot support)
        if pth > 65 and calcium > 10.2:
            diagnosis = "Possible Primary Hyperparathyroidism"
            confidence = 0.86
            probabilities = {
                "Normal Parathyroid Function": 0.03,
                "Possible Primary Hyperparathyroidism": 0.86,
                "Possible Secondary Hyperparathyroidism": 0.07,
                "Possible Hypoparathyroidism": 0.01,
                "Indeterminate Parathyroid Pattern": 0.03,
            }
        elif pth > 65 and (calcium <= 10.2) and (vitamin_d < 30 or egfr < 60):
            diagnosis = "Possible Secondary Hyperparathyroidism"
            confidence = 0.84
            probabilities = {
                "Normal Parathyroid Function": 0.03,
                "Possible Primary Hyperparathyroidism": 0.06,
                "Possible Secondary Hyperparathyroidism": 0.84,
                "Possible Hypoparathyroidism": 0.02,
                "Indeterminate Parathyroid Pattern": 0.05,
            }
        elif pth < 15 and calcium < 8.5:
            diagnosis = "Possible Hypoparathyroidism"
            confidence = 0.82
            probabilities = {
                "Normal Parathyroid Function": 0.04,
                "Possible Primary Hyperparathyroidism": 0.01,
                "Possible Secondary Hyperparathyroidism": 0.04,
                "Possible Hypoparathyroidism": 0.82,
                "Indeterminate Parathyroid Pattern": 0.09,
            }
        elif 15 <= pth <= 65 and 8.5 <= calcium <= 10.2 and 2.5 <= phosphorus <= 4.5:
            diagnosis = "Normal Parathyroid Function"
            confidence = 0.78
            probabilities = {
                "Normal Parathyroid Function": 0.78,
                "Possible Primary Hyperparathyroidism": 0.05,
                "Possible Secondary Hyperparathyroidism": 0.07,
                "Possible Hypoparathyroidism": 0.03,
                "Indeterminate Parathyroid Pattern": 0.07,
            }
        else:
            diagnosis = "Indeterminate Parathyroid Pattern"
            confidence = 0.58
            probabilities = {
                "Normal Parathyroid Function": 0.14,
                "Possible Primary Hyperparathyroidism": 0.18,
                "Possible Secondary Hyperparathyroidism": 0.26,
                "Possible Hypoparathyroidism": 0.07,
                "Indeterminate Parathyroid Pattern": 0.35,
            }

        return {
            'diagnosis': diagnosis,
            'confidence': confidence,
            'probabilities': probabilities,
            'input_features': data,
            'model_used': 'rule_based_parathyroid_v1'
        }

    def predict_parathyroid_progression(self, patient_sequence: List[Dict[str, float]]) -> Dict[str, Any]:
        """
        Rule-based progression trend for parathyroid disorder monitoring.
        """
        if not self._models_loaded:
            self.load_models()

        if not patient_sequence:
            raise ValueError("Patient sequence cannot be empty")

        normalized_seq = [self._normalize_parathyroid_features(v) for v in patient_sequence]

        # ML-first path (if trained artifacts are available)
        progression_bundle = self.models['parathyroid'].get('progression')
        scaler = self.models['parathyroid'].get('progression_scaler')
        encoder = self.models['parathyroid'].get('progression_encoder')
        config = self.models['parathyroid'].get('progression_config', {})
        if isinstance(progression_bundle, dict) and scaler is not None and encoder is not None:
            model = progression_bundle['model']
            features = config.get('features', [
                'pth', 'calcium', 'phosphorus', 'vitamin_d',
                'creatinine', 'egfr', 'alkaline_phosphatase', 'albumin'
            ])
            max_length = config.get('max_length', 20)
            sequence = [[visit.get(f, 0.0) for f in features] for visit in normalized_seq]
            X = pad_sequences([sequence], maxlen=max_length, dtype='float32', padding='pre', truncating='pre')
            X_flat = X.reshape(-1, X.shape[-1])
            X_scaled = scaler.transform(X_flat).reshape(X.shape)
            X_tensor = torch.tensor(X_scaled, dtype=torch.float32)

            with torch.no_grad():
                outputs = model(X_tensor)
                probabilities = torch.softmax(outputs, dim=1).numpy()[0]
                prediction = torch.argmax(outputs, dim=1).item()

            progression_classes = encoder.classes_
            prob_dict = {str(cls): float(probabilities[i]) for i, cls in enumerate(progression_classes)}
            return {
                'progression': str(progression_classes[prediction]),
                'confidence': float(max(probabilities)),
                'probabilities': prob_dict,
                'num_visits': len(normalized_seq),
                'model_used': 'lstm_parathyroid_progression_v1'
            }

        if len(normalized_seq) < 2:
            return {
                'progression': 'Insufficient Data',
                'confidence': 0.5,
                'probabilities': {
                    'Improving': 0.15,
                    'Stable': 0.70,
                    'Worsening': 0.15,
                },
                'num_visits': len(normalized_seq),
                'model_used': 'rule_based_parathyroid_v1'
            }

        first = normalized_seq[0]
        last = normalized_seq[-1]

        first_pth = float(first.get('pth', 0.0))
        last_pth = float(last.get('pth', 0.0))
        first_ca = float(first.get('calcium', 0.0))
        last_ca = float(last.get('calcium', 0.0))

        trend_score = 0
        if first_pth and last_pth:
            if last_pth < first_pth * 0.9:
                trend_score += 1
            elif last_pth > first_pth * 1.1:
                trend_score -= 1

        if first_ca and last_ca:
            if abs(last_ca - 9.2) < abs(first_ca - 9.2):
                trend_score += 1
            elif abs(last_ca - 9.2) > abs(first_ca - 9.2):
                trend_score -= 1

        if trend_score >= 1:
            progression = "Improving"
            probabilities = {'Improving': 0.78, 'Stable': 0.18, 'Worsening': 0.04}
            confidence = 0.78
        elif trend_score <= -1:
            progression = "Worsening"
            probabilities = {'Improving': 0.05, 'Stable': 0.23, 'Worsening': 0.72}
            confidence = 0.72
        else:
            progression = "Stable"
            probabilities = {'Improving': 0.16, 'Stable': 0.68, 'Worsening': 0.16}
            confidence = 0.68

        return {
            'progression': progression,
            'confidence': confidence,
            'probabilities': probabilities,
            'num_visits': len(normalized_seq),
            'model_used': 'rule_based_parathyroid_v1'
        }
    
    def predict_diagnosis(self, disease_name: str, patient_data: Dict[str, float]) -> Dict[str, Any]:
        """
        Generic method to predict diagnosis for any disease
        
        Args:
            disease_name: Name of the disease ('diabetes', 'anemia', 'iron_deficiency_anemia')
            patient_data: Dictionary of patient features
            
        Returns:
            Dictionary with diagnosis prediction results
        """
        # Normalize disease name
        disease_name = disease_name.lower().strip()
        
        # Map common variations
        disease_map = {
            'diabetes': 'diabetes',
            'diabetic': 'diabetes',
            'anemia': 'anemia',
            'iron_deficiency_anemia': 'anemia',
            'iron deficiency anemia': 'anemia',
            'ida': 'anemia',
            'ckd': 'ckd',
            'chronic_kidney_disease': 'ckd',
            'chronic kidney disease': 'ckd',
            'kidney_disease': 'ckd',
            'kidney disease': 'ckd',
            'parathyroid': 'parathyroid',
            'parathyroid_disorder': 'parathyroid',
            'parathyroid disorder': 'parathyroid',
            'hyperparathyroidism': 'parathyroid',
            'hypoparathyroidism': 'parathyroid'
        }
        
        disease_key = disease_map.get(disease_name, disease_name)
        
        if disease_key not in self.models:
            raise ValueError(f"Unsupported disease: {disease_name}. Supported diseases: {list(self.models.keys())}")
        
        # Route to appropriate method
        if disease_key == 'diabetes':
            return self.predict_diabetes_diagnosis(patient_data)
        elif disease_key == 'anemia':
            return self.predict_anemia_diagnosis(patient_data)
        elif disease_key == 'ckd':
            return self.predict_ckd_diagnosis(patient_data)
        elif disease_key == 'parathyroid':
            return self.predict_parathyroid_diagnosis(patient_data)
        else:
            raise ValueError(f"Prediction not implemented for disease: {disease_name}")
    
    def predict_progression(self, disease_name: str, patient_sequence: List[Dict[str, float]]) -> Dict[str, Any]:
        """
        Generic method to predict progression for any disease
        
        Args:
            disease_name: Name of the disease ('diabetes', 'anemia', 'iron_deficiency_anemia')
            patient_sequence: List of visit data dictionaries
            
        Returns:
            Dictionary with progression prediction results
        """
        # Normalize disease name
        disease_name = disease_name.lower().strip()
        
        # Map common variations
        disease_map = {
            'diabetes': 'diabetes',
            'diabetic': 'diabetes',
            'anemia': 'anemia',
            'iron_deficiency_anemia': 'anemia',
            'iron deficiency anemia': 'anemia',
            'ida': 'anemia',
            'ckd': 'ckd',
            'chronic_kidney_disease': 'ckd',
            'chronic kidney disease': 'ckd',
            'kidney_disease': 'ckd',
            'kidney disease': 'ckd',
            'parathyroid': 'parathyroid',
            'parathyroid_disorder': 'parathyroid',
            'parathyroid disorder': 'parathyroid',
            'hyperparathyroidism': 'parathyroid',
            'hypoparathyroidism': 'parathyroid'
        }
        
        disease_key = disease_map.get(disease_name, disease_name)
        
        if disease_key not in self.models:
            raise ValueError(f"Unsupported disease: {disease_name}. Supported diseases: {list(self.models.keys())}")
        
        # Route to appropriate method
        if disease_key == 'diabetes':
            return self.predict_diabetes_progression(patient_sequence)
        elif disease_key == 'anemia':
            return self.predict_anemia_progression(patient_sequence)
        elif disease_key == 'ckd':
            return self.predict_ckd_progression(patient_sequence)
        elif disease_key == 'parathyroid':
            return self.predict_parathyroid_progression(patient_sequence)
        else:
            raise ValueError(f"Progression prediction not implemented for disease: {disease_name}")
    
    def get_supported_diseases(self) -> List[str]:
        """Get list of supported disease names"""
        return list(self.models.keys())
    
    def get_disease_features(self, disease_name: str, prediction_type: str = 'diagnosis') -> List[str]:
        """
        Get required features for a disease
        
        Args:
            disease_name: Name of the disease
            prediction_type: 'diagnosis' or 'progression'
            
        Returns:
            List of required feature names
        """
        disease_name = disease_name.lower().strip()
        disease_map = {
            'diabetes': 'diabetes',
            'diabetic': 'diabetes',
            'anemia': 'anemia',
            'iron_deficiency_anemia': 'anemia',
            'iron deficiency anemia': 'anemia',
            'ida': 'anemia',
            'ckd': 'ckd',
            'chronic_kidney_disease': 'ckd',
            'chronic kidney disease': 'ckd',
            'kidney_disease': 'ckd',
            'kidney disease': 'ckd',
            'parathyroid': 'parathyroid',
            'parathyroid_disorder': 'parathyroid',
            'parathyroid disorder': 'parathyroid',
            'hyperparathyroidism': 'parathyroid',
            'hypoparathyroidism': 'parathyroid'
        }
        
        disease_key = disease_map.get(disease_name, disease_name)
        
        if disease_key == 'diabetes' and prediction_type == 'diagnosis':
            return [
                'fasting_glucose', 'hba1c', 'hdl', 'ldl', 'triglycerides',
                'total_cholesterol', 'creatinine', 'bmi', 'systolic_bp', 'diastolic_bp'
            ]
        elif disease_key == 'diabetes' and prediction_type == 'progression':
            return [
                'fasting_glucose', 'hba1c', 'hdl', 'ldl', 'triglycerides',
                'total_cholesterol', 'creatinine', 'bmi', 'systolic_bp', 'diastolic_bp'
            ]
        elif disease_key == 'anemia' and prediction_type == 'diagnosis':
            return [
                'hemoglobin', 'hematocrit', 'mcv', 'mch', 'mchc', 'rdw',
                'serum_iron', 'ferritin', 'tibc', 'transferrin_saturation',
                'reticulocyte_count', 'wbc', 'platelet_count', 'esr',
                'bmi', 'systolic_bp', 'diastolic_bp'
            ]
        elif disease_key == 'anemia' and prediction_type == 'progression':
            return [
                'hemoglobin', 'hematocrit', 'mcv', 'mch', 'mchc', 'rdw',
                'serum_iron', 'ferritin', 'tibc', 'transferrin_saturation',
                'reticulocyte_count', 'bmi', 'systolic_bp', 'diastolic_bp'
            ]
        elif disease_key == 'ckd' and prediction_type == 'diagnosis':
            return [
                'serum_creatinine', 'egfr', 'uacr', 'bun', 'sodium', 'potassium',
                'calcium', 'phosphorus', 'hemoglobin', 'pth', 'bicarbonate',
                'albumin', 'bmi', 'systolic_bp', 'diastolic_bp'
            ]
        elif disease_key == 'ckd' and prediction_type == 'progression':
            return [
                'serum_creatinine', 'egfr', 'uacr', 'bun', 'sodium', 'potassium',
                'calcium', 'phosphorus', 'hemoglobin', 'pth', 'bicarbonate',
                'albumin', 'bmi', 'systolic_bp', 'diastolic_bp'
            ]
        elif disease_key == 'parathyroid' and prediction_type == 'diagnosis':
            return [
                'pth', 'calcium', 'phosphorus', 'vitamin_d',
                'creatinine', 'egfr', 'alkaline_phosphatase', 'albumin'
            ]
        elif disease_key == 'parathyroid' and prediction_type == 'progression':
            return [
                'pth', 'calcium', 'phosphorus', 'vitamin_d',
                'creatinine', 'egfr', 'alkaline_phosphatase', 'albumin'
            ]
        else:
            raise ValueError(f"Features not available for {disease_name} {prediction_type}")
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about loaded models"""
        return {
            'diabetes': {
                'diagnosis_loaded': 'diagnosis' in self.models['diabetes'],
                'progression_loaded': 'progression' in self.models['diabetes'],
            },
            'anemia': {
                'diagnosis_loaded': 'diagnosis' in self.models['anemia'],
                'progression_loaded': 'progression' in self.models['anemia'],
            },
            'ckd': {
                'diagnosis_loaded': 'diagnosis' in self.models['ckd'],
                'progression_loaded': 'progression' in self.models['ckd'],
            },
            'parathyroid': {
                'diagnosis_loaded': 'diagnosis' in self.models['parathyroid'],
                'progression_loaded': 'progression' in self.models['parathyroid'],
            },
            'models_loaded': self._models_loaded,
            'supported_diseases': self.get_supported_diseases()
        }

# Global instance
multi_disease_inference = MultiDiseaseInference()

