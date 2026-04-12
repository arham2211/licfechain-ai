"""
Unified ML Inference API endpoints
Supports multiple diseases through a single unified interface
"""

from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.services.multi_disease_inference import multi_disease_inference
from app.models import Patient, LabTestResult, LabReport, DoctorVisit, Diagnosis
from app.models.disease import DiseaseProgression
from app.models.visit import VisitTypeEnum, DiagnosisStatusEnum
from app.api.v1.dependencies import get_translation_language, apply_translation
from app.services.translation import translate_text
from datetime import datetime, timedelta

router = APIRouter()

# Helper functions for auto-creating visits and diagnoses
async def find_or_create_lab_review_visit(
    patient_id: UUID,
    db: AsyncSession,
    visit_date: datetime = None
) -> DoctorVisit:
    """
    Find a recent visit (within 7 days) or create a new lab_review visit.
    
    Args:
        patient_id: Patient ID
        db: Database session
        visit_date: Optional visit date (defaults to now)
    
    Returns:
        DoctorVisit instance
    """
    if visit_date is None:
        visit_date = datetime.utcnow()
    
    # Try to find a recent visit (within 7 days)
    seven_days_ago = visit_date - timedelta(days=7)
    recent_visit_query = select(DoctorVisit).where(
        DoctorVisit.patient_id == patient_id,
        DoctorVisit.visit_date >= seven_days_ago,
        DoctorVisit.visit_date <= visit_date
    ).order_by(DoctorVisit.visit_date.desc()).limit(1)
    
    recent_visit_result = await db.execute(recent_visit_query)
    recent_visit = recent_visit_result.scalar_one_or_none()
    
    if recent_visit:
        return recent_visit
    
    # No recent visit found, create a new lab_review visit
    # First, find any doctor in the system
    doctor_query = select(Patient).where(
        Patient.is_doctor == True
    ).limit(1)
    
    doctor_result = await db.execute(doctor_query)
    doctor = doctor_result.scalar_one_or_none()
    
    if not doctor:
        raise HTTPException(
            status_code=500,
            detail="No doctor found in system. Please create at least one doctor before using auto-diagnosis."
        )
    
    # Create lab_review visit
    new_visit = DoctorVisit(
        patient_id=patient_id,
        doctor_patient_id=doctor.patient_id,
        visit_date=visit_date,
        visit_type=VisitTypeEnum.LAB_REVIEW,
        chief_complaint="Lab results review - Auto-generated visit for ML diagnosis",
        doctor_notes=f"Automatically created visit for ML-based diagnosis review. Visit type: lab_review"
    )
    
    db.add(new_visit)
    await db.commit()
    await db.refresh(new_visit)
    
    return new_visit


def _map_diagnosis_to_progression_stage(disease_name: str, diagnosis: str) -> str:
    """
    Map diagnosis result to progression stage for DiseaseProgression record.
    
    Args:
        disease_name: Name of the disease
        diagnosis: Diagnosis result (e.g., "Normal", "Diabetes", "Stage 1", etc.)
    
    Returns:
        Progression stage string
    """
    disease_lower = disease_name.lower()
    diagnosis_lower = diagnosis.lower()
    
    # Diabetes progression stages
    if 'diabetes' in disease_lower or 'diabetic' in disease_lower:
        if 'normal' in diagnosis_lower:
            return "Normal"
        elif 'prediabetes' in diagnosis_lower or 'prediabetic' in diagnosis_lower:
            return "Prediabetes"
        elif 'diabetes' in diagnosis_lower:
            return "Diabetes"
        else:
            return diagnosis  # Use diagnosis as-is
    
    # CKD progression stages
    elif 'ckd' in disease_lower or 'kidney' in disease_lower:
        if 'normal' in diagnosis_lower:
            return "Normal"
        elif 'stage 1' in diagnosis_lower:
            return "Stage 1"
        elif 'stage 2' in diagnosis_lower:
            return "Stage 2"
        elif 'stage 3' in diagnosis_lower:
            return "Stage 3"
        elif 'stage 4' in diagnosis_lower:
            return "Stage 4"
        elif 'stage 5' in diagnosis_lower or 'esrd' in diagnosis_lower:
            return "ESRD"
        else:
            return diagnosis  # Use diagnosis as-is
    
    # Anemia progression stages
    elif 'anemia' in disease_lower or 'ida' in disease_lower:
        if 'normal' in diagnosis_lower:
            return "Normal"
        elif 'mild' in diagnosis_lower:
            return "Mild"
        elif 'moderate' in diagnosis_lower:
            return "Moderate"
        elif 'severe' in diagnosis_lower:
            return "Severe"
        else:
            return diagnosis  # Use diagnosis as-is

    # Parathyroid progression stages
    elif 'parathyroid' in disease_lower:
        if 'normal' in diagnosis_lower:
            return "Normal"
        elif 'primary' in diagnosis_lower:
            return "Primary Hyperparathyroidism"
        elif 'secondary' in diagnosis_lower:
            return "Secondary Hyperparathyroidism"
        elif 'hypoparathyroidism' in diagnosis_lower:
            return "Hypoparathyroidism"
        elif 'indeterminate' in diagnosis_lower:
            return "Indeterminate"
        else:
            return diagnosis  # Use diagnosis as-is
    
    # Default: use diagnosis as progression stage
    return diagnosis


async def auto_create_diagnosis(
    visit_id: UUID,
    disease_name: str,
    prediction_result: Dict[str, Any],
    db: AsyncSession,
    patient_id: UUID = None
) -> Diagnosis:
    """
    Automatically create a diagnosis record and progression record from ML prediction.
    
    Args:
        visit_id: Visit ID to link diagnosis to
        disease_name: Name of the disease
        prediction_result: Result from ML prediction (should contain diagnosis, confidence, etc.)
        db: Database session
        patient_id: Patient ID (required for creating progression record)
    
    Returns:
        Diagnosis instance
    """
    # Extract model name from prediction result or use default
    model_name = prediction_result.get('model_used', 'multi_disease_inference')
    if 'ml_model_used' in prediction_result:
        model_name = prediction_result['ml_model_used']
    
    # Determine model name based on disease
    disease_lower = disease_name.lower()
    if 'diabetes' in disease_lower or 'diabetic' in disease_lower:
        model_name = 'xgb_diabetes_v1'
    elif 'anemia' in disease_lower or 'ida' in disease_lower:
        model_name = 'xgb_anemia_v1'
    elif 'ckd' in disease_lower or 'kidney' in disease_lower:
        model_name = 'xgb_ckd_v1'
    elif 'parathyroid' in disease_lower:
        model_name = 'rule_based_parathyroid_v1'
    elif 'oral' in disease_lower and 'cancer' in disease_lower:
        model_name = 'roboflow_oral_cancer_v1'
    
    # Get diagnosis result
    diagnosis_result = prediction_result.get('diagnosis', 'Unknown')
    confidence = prediction_result.get('confidence', 0.0)
    assessed_date = datetime.utcnow()
    
    # Create diagnosis with SUSPECTED status (doctor can confirm later)
    diagnosis = Diagnosis(
        visit_id=visit_id,
        disease_name=disease_name.lower(),
        diagnosis_date=assessed_date,
        confidence_score=confidence,
        ml_model_used=model_name,
        status=DiagnosisStatusEnum.SUSPECTED,  # Auto-created diagnoses start as SUSPECTED
        notes=f"Auto-generated diagnosis from ML model ({model_name}). Confidence: {confidence:.2%}. Doctor review recommended."
    )
    
    db.add(diagnosis)
    await db.flush()  # Flush to get diagnosis ID if needed
    
    # Also create DiseaseProgression record for timeline
    if patient_id:
        progression_stage = _map_diagnosis_to_progression_stage(disease_name, diagnosis_result)
        
        progression = DiseaseProgression(
            patient_id=patient_id,
            disease_name=disease_name.lower(),
            progression_stage=progression_stage,
            assessed_date=assessed_date,
            ml_model_used=model_name,
            confidence_score=confidence,
            notes=f"Auto-generated progression from ML diagnosis. Stage: {progression_stage}. Confidence: {confidence:.2%}."
        )
        
        db.add(progression)
    
    await db.commit()
    await db.refresh(diagnosis)
    
    return diagnosis

# Request schemas
class UnifiedDiagnosisRequest(BaseModel):
    """Flexible diagnosis request that accepts any features"""
    disease_name: str = Field(..., description="Name of the disease (e.g., 'diabetes', 'anemia', 'iron_deficiency_anemia')")
    features: Dict[str, float] = Field(..., description="Dictionary of patient features/lab values")

class UnifiedProgressionRequest(BaseModel):
    """Flexible progression request that accepts any features"""
    disease_name: str = Field(..., description="Name of the disease (e.g., 'diabetes', 'anemia', 'iron_deficiency_anemia')")
    sequence: List[Dict[str, float]] = Field(..., min_items=1, description="Sequence of visit data with features")

class UnifiedDiagnosisResponse(BaseModel):
    """Unified diagnosis response"""
    disease: str
    prediction_type: str = "diagnosis"
    diagnosis: str
    confidence: float
    probabilities: Dict[str, float]
    input_features: Dict[str, float]
    timestamp: datetime = Field(default_factory=datetime.now)

class UnifiedProgressionResponse(BaseModel):
    """Unified progression response"""
    disease: str
    prediction_type: str = "progression"
    progression: str
    confidence: float
    probabilities: Dict[str, float]
    num_visits: int
    timestamp: datetime = Field(default_factory=datetime.now)

@router.get("/models/info")
async def get_model_info():
    """Get information about loaded ML models for all diseases"""
    try:
        if not multi_disease_inference._models_loaded:
            multi_disease_inference.load_models()
        
        info = multi_disease_inference.get_model_info()
        return {
            "models_loaded": info['models_loaded'],
            "supported_diseases": info['supported_diseases'],
            "diseases": info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get model info: {str(e)}")

@router.get("/diseases")
async def get_supported_diseases():
    """Get list of supported diseases"""
    try:
        if not multi_disease_inference._models_loaded:
            multi_disease_inference.load_models()
        
        diseases = multi_disease_inference.get_supported_diseases()
        disease_info = {}
        
        for disease in diseases:
            try:
                diagnosis_features = multi_disease_inference.get_disease_features(disease, 'diagnosis')
                disease_info[disease] = {
                    "diagnosis_features": diagnosis_features
                }
                
                # Try to get progression features if available
                try:
                    progression_features = multi_disease_inference.get_disease_features(disease, 'progression')
                    disease_info[disease]["progression_features"] = progression_features
                except:
                    disease_info[disease]["progression_features"] = None
            except:
                disease_info[disease] = {"error": "Feature information not available"}
        
        return {
            "supported_diseases": diseases,
            "disease_info": disease_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get supported diseases: {str(e)}")

@router.post("/diagnosis/predict", response_model=UnifiedDiagnosisResponse)
async def predict_diagnosis(
    request: UnifiedDiagnosisRequest,
    lang: str = Depends(get_translation_language)
):
    """
    Predict diagnosis for any disease
    
    Pass the disease name and relevant features. The system will automatically
    route to the appropriate model.
    
    **Supported diseases:**
    - diabetes (or 'diabetic')
    - anemia (or 'iron_deficiency_anemia', 'iron deficiency anemia', 'ida')
    - ckd (or 'chronic_kidney_disease', 'chronic kidney disease', 'kidney_disease')
    - parathyroid (or 'parathyroid disorder', 'hyperparathyroidism', 'hypoparathyroidism')
    
    **Example for diabetes:**
    ```json
    {
        "disease_name": "diabetes",
        "features": {
            "fasting_glucose": 120,
            "hba1c": 7.5,
            "hdl": 45,
            "ldl": 120,
            "triglycerides": 150,
            "total_cholesterol": 200,
            "creatinine": 1.0,
            "bmi": 28,
            "systolic_bp": 130,
            "diastolic_bp": 85
        }
    }
    ```
    
    **Example for anemia:**
    ```json
    {
        "disease_name": "anemia",
        "features": {
            "hemoglobin": 10.5,
            "hematocrit": 32,
            "mcv": 75,
            "mch": 22,
            "mchc": 28,
            "rdw": 15.5,
            "serum_iron": 30,
            "ferritin": 8,
            "tibc": 450,
            "transferrin_saturation": 6.7,
            "reticulocyte_count": 1.2,
            "wbc": 6000,
            "platelet_count": 250000,
            "esr": 25,
            "bmi": 22,
            "systolic_bp": 120,
            "diastolic_bp": 80
        }
    }
    ```
    
    **Example for CKD:**
    ```json
    {
        "disease_name": "ckd",
        "features": {
            "serum_creatinine": 1.8,
            "egfr": 45,
            "uacr": 150,
            "bun": 35,
            "sodium": 140,
            "potassium": 4.5,
            "calcium": 9.5,
            "phosphorus": 4.2,
            "hemoglobin": 11.5,
            "pth": 85,
            "bicarbonate": 22,
            "albumin": 3.8,
            "bmi": 28,
            "systolic_bp": 135,
            "diastolic_bp": 85
        }
    }
    ```
    """
    try:
        # Load models if not already loaded
        if not multi_disease_inference._models_loaded:
            multi_disease_inference.load_models()
        
        # Make prediction
        result = multi_disease_inference.predict_diagnosis(
            request.disease_name,
            request.features
        )
        
        # Translate diagnosis if needed
        diagnosis_text = result['diagnosis']
        if lang != "en":
            diagnosis_text = await translate_text(diagnosis_text, lang, "medical")
        
        return UnifiedDiagnosisResponse(
            disease=request.disease_name.lower(),
            diagnosis=diagnosis_text,
            confidence=result['confidence'],
            probabilities=result['probabilities'],
            input_features=result.get('input_features', request.features)
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.post("/progression/predict", response_model=UnifiedProgressionResponse)
async def predict_progression(
    request: UnifiedProgressionRequest,
    lang: str = Depends(get_translation_language)
):
    """
    Predict progression for any disease
    
    Pass the disease name and a sequence of visit data. The system will automatically
    route to the appropriate model.
    
    **Supported diseases:**
    - anemia (or 'iron_deficiency_anemia', 'iron deficiency anemia', 'ida')
    - ckd (or 'chronic_kidney_disease', 'chronic kidney disease', 'kidney_disease')
    - parathyroid (or 'parathyroid disorder', 'hyperparathyroidism', 'hypoparathyroidism')
    
    **Example for anemia:**
    ```json
    {
        "disease_name": "anemia",
        "sequence": [
            {
                "hemoglobin": 12.0,
                "hematocrit": 36,
                "mcv": 80,
                "mch": 26,
                "mchc": 32,
                "rdw": 13.5,
                "serum_iron": 50,
                "ferritin": 20,
                "tibc": 400,
                "transferrin_saturation": 12.5,
                "reticulocyte_count": 1.5,
                "bmi": 22,
                "systolic_bp": 120,
                "diastolic_bp": 80
            },
            {
                "hemoglobin": 11.0,
                "hematocrit": 33,
                "mcv": 78,
                "mch": 24,
                "mchc": 31,
                "rdw": 14.0,
                "serum_iron": 40,
                "ferritin": 15,
                "tibc": 420,
                "transferrin_saturation": 9.5,
                "reticulocyte_count": 1.3,
                "bmi": 22,
                "systolic_bp": 118,
                "diastolic_bp": 78
            }
        ]
    }
    ```
    
    **Example for CKD:**
    ```json
    {
        "disease_name": "ckd",
        "sequence": [
            {
                "serum_creatinine": 1.2,
                "egfr": 65,
                "uacr": 45,
                "bun": 22,
                "sodium": 140,
                "potassium": 4.2,
                "calcium": 9.8,
                "phosphorus": 3.8,
                "hemoglobin": 13.5,
                "pth": 45,
                "bicarbonate": 24,
                "albumin": 4.2,
                "bmi": 26,
                "systolic_bp": 128,
                "diastolic_bp": 82
            },
            {
                "serum_creatinine": 1.4,
                "egfr": 58,
                "uacr": 65,
                "bun": 26,
                "sodium": 139,
                "potassium": 4.3,
                "calcium": 9.6,
                "phosphorus": 4.0,
                "hemoglobin": 12.8,
                "pth": 52,
                "bicarbonate": 23,
                "albumin": 4.0,
                "bmi": 27,
                "systolic_bp": 132,
                "diastolic_bp": 84
            },
            {
                "serum_creatinine": 1.8,
                "egfr": 45,
                "uacr": 120,
                "bun": 35,
                "sodium": 140,
                "potassium": 4.5,
                "calcium": 9.4,
                "phosphorus": 4.2,
                "hemoglobin": 11.5,
                "pth": 68,
                "bicarbonate": 22,
                "albumin": 3.8,
                "bmi": 28,
                "systolic_bp": 135,
                "diastolic_bp": 85
            }
        ]
    }
    ```
    """
    try:
        # Load models if not already loaded
        if not multi_disease_inference._models_loaded:
            multi_disease_inference.load_models()
        
        # Make prediction
        result = multi_disease_inference.predict_progression(
            request.disease_name,
            request.sequence
        )
        
        # Translate progression if needed
        progression_text = result['progression']
        if lang != "en":
            progression_text = await translate_text(progression_text, lang, "medical")
        
        return UnifiedProgressionResponse(
            disease=request.disease_name.lower(),
            progression=progression_text,
            confidence=result['confidence'],
            probabilities=result['probabilities'],
            num_visits=result.get('num_visits', len(request.sequence))
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.post("/diagnosis/patient/{patient_id}")
async def predict_patient_diagnosis(
    patient_id: UUID,
    disease_name: str = Query(..., description="Name of the disease"),
    auto_save: bool = Query(True, description="Automatically save diagnosis to database (default: True)"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """
    Predict diagnosis for a specific patient using their latest lab results
    
    The system will automatically fetch the patient's latest lab results and
    use the appropriate model based on the disease name.
    
    **Auto-Save Feature:**
    - If `auto_save=True` (default): Automatically creates a diagnosis record with "suspected" status
    - If `auto_save=False`: Only returns prediction without saving to database
    - Auto-created diagnoses are linked to a visit (recent visit or auto-created lab_review visit)
    - Doctor can later review and change status from "suspected" to "confirmed"
    """
    try:
        # Load models if not already loaded
        if not multi_disease_inference._models_loaded:
            multi_disease_inference.load_models()
        
        # Get required features for this disease
        required_features = multi_disease_inference.get_disease_features(disease_name, 'diagnosis')
        
        # Get latest lab test results for patient
        # Handle both cases: lab reports with visit_id and without visit_id
        query = select(
            LabTestResult.test_name,
            LabTestResult.test_value
        ).join(
            LabReport, LabTestResult.report_id == LabReport.report_id
        ).where(
            LabReport.patient_id == patient_id
        ).where(
            LabTestResult.test_name.in_(required_features)
        )
        
        # Try to join with visit if visit_id exists, otherwise order by report date
        query = query.outerjoin(
            DoctorVisit, LabReport.visit_id == DoctorVisit.visit_id
        ).order_by(
            DoctorVisit.visit_date.desc().nulls_last(),
            LabReport.report_date.desc().nulls_last()
        ).limit(20)
        
        result = await db.execute(query)
        rows = result.all()
        
        if not rows:
            raise HTTPException(status_code=404, detail="No lab results found for patient")
        
        # Convert to dict
        lab_data = {}
        for row in rows:
            lab_data[row[0]] = float(row[1])
        
        # Fill missing features with 0
        for feature in required_features:
            if feature not in lab_data:
                lab_data[feature] = 0.0
        
        # Make prediction
        prediction_result = multi_disease_inference.predict_diagnosis(disease_name, lab_data)
        
        # Auto-create visit and diagnosis if requested
        if auto_save:
            try:
                # Find or create a lab_review visit
                visit = await find_or_create_lab_review_visit(patient_id, db)
                
                # Auto-create diagnosis with SUSPECTED status (also creates progression record)
                diagnosis = await auto_create_diagnosis(
                    visit.visit_id,
                    disease_name,
                    prediction_result,
                    db,
                    patient_id=patient_id
                )
                
                # Add diagnosis info to response
                prediction_result["diagnosis_saved"] = True
                prediction_result["diagnosis_id"] = str(diagnosis.diagnosis_id)
                prediction_result["visit_id"] = str(visit.visit_id)
                prediction_result["diagnosis_status"] = "suspected"
                prediction_result["note"] = "Diagnosis automatically created with 'suspected' status. Doctor review recommended."
            except Exception as e:
                # If auto-creation fails, still return prediction but log the error
                prediction_result["diagnosis_saved"] = False
                prediction_result["error"] = f"Failed to auto-create diagnosis: {str(e)}"
                # Don't fail the entire request, just log the issue
        else:
            prediction_result["diagnosis_saved"] = False
            prediction_result["note"] = "Auto-save disabled. Diagnosis not saved to database."
        
        # Translate diagnosis if needed
        if lang != "en" and "diagnosis" in prediction_result:
            prediction_result["diagnosis"] = await translate_text(
                prediction_result["diagnosis"],
                lang,
                "medical"
            )
        
        return {
            "patient_id": str(patient_id),
            "disease": disease_name.lower(),
            "prediction_type": "diagnosis",
            **prediction_result
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.post("/progression/patient/{patient_id}")
async def predict_patient_progression(
    patient_id: UUID,
    disease_name: str = Query(..., description="Name of the disease"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """
    Predict progression for a specific patient using their visit history
    
    The system will automatically fetch the patient's visit history and
    use the appropriate model based on the disease name.
    """
    try:
        # Load models if not already loaded
        if not multi_disease_inference._models_loaded:
            multi_disease_inference.load_models()
        
        # Get required features for this disease
        required_features = multi_disease_inference.get_disease_features(disease_name, 'progression')
        
        # Get visit sequence for patient
        query = select(
            DoctorVisit.visit_date,
            LabTestResult.test_name,
            LabTestResult.test_value
        ).join(
            LabReport, DoctorVisit.visit_id == LabReport.visit_id
        ).join(
            LabTestResult, LabReport.report_id == LabTestResult.report_id
        ).where(
            DoctorVisit.patient_id == patient_id
        ).where(
            LabTestResult.test_name.in_(required_features)
        ).order_by(
            DoctorVisit.visit_date.asc()
        )
        
        result = await db.execute(query)
        rows = result.all()
        
        if not rows:
            raise HTTPException(status_code=404, detail="No visit history found for patient")
        
        # Group by visit
        visits_data = {}
        for row in rows:
            visit_date = row[0]
            if visit_date not in visits_data:
                visits_data[visit_date] = {}
            visits_data[visit_date][row[1]] = float(row[2])
        
        # Convert to sequence
        sequence = []
        for visit_date in sorted(visits_data.keys()):
            visit_features = {}
            for feature in required_features:
                visit_features[feature] = visits_data[visit_date].get(feature, 0.0)
            sequence.append(visit_features)
        
        if len(sequence) < 3:
            raise HTTPException(
                status_code=400, 
                detail="Insufficient visit history (minimum 3 visits required)"
            )
        
        # Make prediction
        prediction_result = multi_disease_inference.predict_progression(disease_name, sequence)
        
        # Translate progression if needed
        if lang != "en" and "progression" in prediction_result:
            prediction_result["progression"] = await translate_text(
                prediction_result["progression"],
                lang,
                "medical"
            )
        
        return {
            "patient_id": str(patient_id),
            "disease": disease_name.lower(),
            "prediction_type": "progression",
            **prediction_result
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.get("/health")
async def health_check():
    """Health check for inference service"""
    try:
        if not multi_disease_inference._models_loaded:
            multi_disease_inference.load_models()
        
        info = multi_disease_inference.get_model_info()
        models_loaded = (
            info['diabetes'].get('diagnosis_loaded', False) or info['diabetes'].get('progression_loaded', False) or
            info['anemia'].get('diagnosis_loaded', False) or info['anemia'].get('progression_loaded', False) or
            info['ckd'].get('diagnosis_loaded', False) or info['ckd'].get('progression_loaded', False) or
            info.get('parathyroid', {}).get('diagnosis_loaded', False) or
            info.get('parathyroid', {}).get('progression_loaded', False)
        )
        
        if not models_loaded:
            raise HTTPException(status_code=503, detail="No models loaded")
        
        return {
            "status": "healthy",
            "models_loaded": models_loaded,
            "supported_diseases": info['supported_diseases'],
            "timestamp": datetime.now()
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")
