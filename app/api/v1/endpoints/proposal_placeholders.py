from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from uuid import UUID


router = APIRouter()


class OcrIngestRequest(BaseModel):
    patient_id: UUID
    file_name: str = Field(..., min_length=3, max_length=300)


class DentalAnalyzeRequest(BaseModel):
    patient_id: UUID
    image_name: str = Field(..., min_length=3, max_length=300)


@router.post("/ocr/ingest")
async def ocr_ingest_placeholder(payload: OcrIngestRequest):
    # Placeholder adapter until OCR parser + extraction pipeline is connected.
    return {
        "status": "coming_soon",
        "module": "ocr_ingestion",
        "message": "OCR extraction pipeline is pending full backend implementation.",
        "submitted": {
            "patient_id": str(payload.patient_id),
            "file_name": payload.file_name,
            "submitted_at": datetime.utcnow().isoformat(),
        },
        "next_step": "Backend OCR/NLP extraction service integration",
    }


@router.post("/dental/analyze")
async def dental_analyze_placeholder(payload: DentalAnalyzeRequest):
    return {
        "status": "coming_soon",
        "module": "dental_diagnosis",
        "message": "Dental lesion model API is not fully integrated yet.",
        "submitted": {
            "patient_id": str(payload.patient_id),
            "image_name": payload.image_name,
            "submitted_at": datetime.utcnow().isoformat(),
        },
        "demo_output": {
            "predicted_class": "Pending Model Integration",
            "confidence": 0.0,
        },
    }


@router.get("/dental/progression/{patient_id}")
async def dental_progression_placeholder(patient_id: UUID):
    if not patient_id:
        raise HTTPException(status_code=400, detail="patient_id is required")
    return {
        "status": "coming_soon",
        "module": "dental_progression",
        "patient_id": str(patient_id),
        "message": "Longitudinal dental progression endpoint will be enabled after model + timeline integration.",
        "demo_output": {
            "progression": "Pending Model Integration",
            "confidence": 0.0,
        },
    }
