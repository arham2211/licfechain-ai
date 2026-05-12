"""
Progression Report API endpoints
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func
from uuid import UUID

from app.db.session import get_db
from app.schemas.disease import ProgressionReport
from app.services.progression_report_service import ProgressionReportService
from app.services.translation import translate_text
from app.api.v1.dependencies import get_translation_language
from app.models import Patient

router = APIRouter()

# Initialize progression report service
progression_service = ProgressionReportService()

_TRANSLATION_SKIP_KEYS = {
    "patient_id",
    "relative_id",
    "assessment_date",
    "prediction_date",
    "generated_at",
    "date",
    "visit_date",
    "diagnosed_at",
    "assessed_date",
    "diagnosis_date",
    "timestamp",
}


async def _translate_payload(payload: Any, lang: str, parent_key: Optional[str] = None) -> Any:
    if lang == "en" or payload is None:
        return payload

    if isinstance(payload, str):
        if parent_key in _TRANSLATION_SKIP_KEYS:
            return payload
        return await translate_text(payload, lang, "medical")

    if isinstance(payload, list):
        translated = []
        for item in payload:
            translated.append(await _translate_payload(item, lang, parent_key))
        return translated

    if isinstance(payload, dict):
        translated_dict = {}
        for key, value in payload.items():
            translated_dict[key] = await _translate_payload(value, lang, key)
        return translated_dict

    return payload

@router.get("/patient/{patient_id}/progression-report", response_model=ProgressionReport)
async def get_progression_report(
    patient_id: UUID,
    disease_name: str = Query(..., description="Name of the disease to generate report for"),
    months_back: int = Query(12, ge=1, le=60, description="Number of months to look back for progression data"),
    db: AsyncSession = Depends(get_db)
):
    """Generate comprehensive progression report for a patient"""
    try:
        # Get patient information
        patient_query = select(Patient).where(Patient.patient_id == patient_id)
        patient_result = await db.execute(patient_query)
        patient = patient_result.scalar_one_or_none()
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Generate progression report
        report = await progression_service.generate_progression_report(
            patient_id=patient_id,
            patient_name=f"{patient.first_name} {patient.last_name}",
            disease_name=disease_name,
            months_back=months_back,
            db=db
        )
        
        if not report:
            raise HTTPException(status_code=404, detail="No progression data found for the specified disease")
        
        return ProgressionReport(**report)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate progression report: {str(e)}")

@router.get("/patient/{patient_id}/progression-timeline")
async def get_progression_timeline(
    patient_id: UUID,
    disease_name: str = Query(..., description="Name of the disease"),
    months_back: int = Query(12, ge=1, le=60, description="Number of months to look back"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get progression timeline data for visualization"""
    try:
        timeline_data = await progression_service.get_progression_timeline(
            patient_id=patient_id,
            disease_name=disease_name,
            months_back=months_back,
            db=db
        )
        
        if not timeline_data:
            return []
        
        return await _translate_payload(timeline_data, lang)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get progression timeline: {str(e)}")

@router.get("/patient/{patient_id}/risk-assessment")
async def get_risk_assessment(
    patient_id: UUID,
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get risk assessment for a patient based on blood relatives' diseases"""
    try:
        risk_data = await progression_service.get_risk_assessment(
            patient_id=patient_id,
            db=db
        )
        
        if not risk_data:
            raise HTTPException(status_code=404, detail="No risk assessment data found")
        
        return await _translate_payload(risk_data, lang)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get risk assessment: {str(e)}")

@router.get("/patient/{patient_id}/recommendations")
async def get_recommendations(
    patient_id: UUID,
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get AI-powered personalized recommendations for a patient based on all conditions and future predictions"""
    try:
        recommendations = await progression_service.get_recommendations(
            patient_id=patient_id,
            db=db
        )
        
        if "error" in recommendations:
            raise HTTPException(status_code=404, detail=recommendations.get("error", "Unable to generate recommendations"))
        
        return await _translate_payload(recommendations, lang)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get recommendations: {str(e)}")

@router.get("/patient/{patient_id}/family-history")
async def get_family_disease_history(
    patient_id: UUID,
    disease_name: str = Query(..., description="Name of the disease"),
    db: AsyncSession = Depends(get_db)
):
    """Get family disease history for a patient"""
    try:
        family_history = await progression_service.get_family_disease_history(
            patient_id=patient_id,
            disease_name=disease_name,
            db=db
        )
        
        return family_history
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get family history: {str(e)}")

@router.post("/patient/{patient_id}/predict-progression")
async def predict_future_progression(
    patient_id: UUID,
    months_ahead: int = Query(6, ge=1, le=24, description="Number of months to predict ahead"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Predict future progression for a patient across all detected conditions"""
    try:
        prediction = await progression_service.predict_all_conditions_progression(
            patient_id=patient_id,
            months_ahead=months_ahead,
            db=db
        )
        
        if not prediction or "error" in prediction:
            raise HTTPException(status_code=404, detail=prediction.get("error", "No data available for prediction"))
        
        return await _translate_payload(prediction, lang)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to predict future progression: {str(e)}")

@router.get("/patient/{patient_id}/lab-measurements-timeline")
async def get_lab_measurements_timeline(
    patient_id: UUID,
    disease_name: Optional[str] = Query(None, description="Filter to the tests relevant for a disease (e.g., 'diabetes', 'ckd')"),
    test_name: Optional[str] = Query(None, description="Filter by specific test name (e.g., 'hba1c', 'glucose'). If not provided, returns all tests"),
    months_back: int = Query(12, ge=1, le=60, description="Number of months to look back"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get numerical lab test measurements over time for graphing with spikes and measurement lines"""
    try:
        # Verify patient exists
        patient_query = select(Patient).where(Patient.patient_id == patient_id)
        patient_result = await db.execute(patient_query)
        patient = patient_result.scalar_one_or_none()
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Get lab measurements timeline
        timeline_data = await progression_service.get_lab_measurements_timeline(
            patient_id=patient_id,
            disease_name=disease_name,
            test_name=test_name,
            months_back=months_back,
            db=db
        )
        
        if "error" in timeline_data:
            raise HTTPException(status_code=500, detail=timeline_data.get("error", "Failed to get lab measurements"))
        
        if lang != "en" and isinstance(timeline_data, dict) and isinstance(timeline_data.get("measurements"), dict):
            translated_measurements = {}
            for raw_test_name, details in timeline_data["measurements"].items():
                translated_name = await translate_text(str(raw_test_name), lang, "medical")
                translated_measurements[translated_name] = details
            timeline_data["measurements"] = translated_measurements

        return timeline_data
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get lab measurements timeline: {str(e)}")
