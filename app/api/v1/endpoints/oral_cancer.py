from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_roles
from app.db.session import get_db
from app.models import (
    Diagnosis,
    DiseaseProgression,
    DoctorVisit,
    Lab,
    LabReport,
    MLPrediction,
    OralCancerScreening,
    Patient,
)
from app.models.auth import User
from app.models.visit import DiagnosisStatusEnum, VisitTypeEnum
from app.services.oral_cancer_service import oral_cancer_service

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOADS_DIR = PROJECT_ROOT / "uploads" / "oral_cancer"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


async def _find_or_create_visit(patient_id: UUID, db: AsyncSession) -> DoctorVisit:
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    recent_q = select(DoctorVisit).where(
        DoctorVisit.patient_id == patient_id,
        DoctorVisit.visit_date >= seven_days_ago,
        DoctorVisit.visit_date <= now,
    ).order_by(DoctorVisit.visit_date.desc()).limit(1)
    recent = (await db.execute(recent_q)).scalar_one_or_none()
    if recent:
        return recent

    doctor = (await db.execute(select(Patient).where(Patient.is_doctor == True).limit(1))).scalar_one_or_none()  # noqa: E712
    if not doctor:
        raise HTTPException(status_code=500, detail="No doctor available for auto-created oral cancer review visit")

    visit = DoctorVisit(
        patient_id=patient_id,
        doctor_patient_id=doctor.patient_id,
        visit_date=now,
        visit_type=VisitTypeEnum.LAB_REVIEW,
        chief_complaint="Oral cancer image screening review",
        doctor_notes="Auto-created visit from oral cancer image detection",
    )
    db.add(visit)
    await db.flush()
    return visit


@router.post("/detect")
async def detect_oral_cancer(
    patient_id: UUID = Form(...),
    image: UploadFile = File(...),
    lab_id: Optional[UUID] = Form(None),
    visit_id: Optional[UUID] = Form(None),
    report_id: Optional[UUID] = Form(None),
    auto_save: bool = Form(True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("admin", "doctor", "lab")),
) -> dict[str, Any]:
    patient = (await db.execute(select(Patient).where(Patient.patient_id == patient_id))).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    ext = Path(image.filename or "upload.jpg").suffix or ".jpg"
    file_id = uuid4().hex
    file_path = UPLOADS_DIR / f"{file_id}{ext}"
    file_path.write_bytes(image_bytes)
    image_hash = hashlib.sha256(image_bytes).hexdigest()

    try:
        raw_prediction = await oral_cancer_service.detect_from_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Roboflow inference failed: {str(e)}")

    mapped = oral_cancer_service.map_prediction_to_clinical_outcome(raw_prediction)
    now = datetime.utcnow()
    model_name = f"roboflow_{oral_cancer_service.settings.ROBOFLOW_ORAL_MODEL_ID}"
    model_version = oral_cancer_service.settings.ROBOFLOW_ORAL_MODEL_VERSION

    selected_visit: Optional[DoctorVisit] = None
    if visit_id:
        selected_visit = (await db.execute(select(DoctorVisit).where(DoctorVisit.visit_id == visit_id))).scalar_one_or_none()
        if not selected_visit or selected_visit.patient_id != patient_id:
            raise HTTPException(status_code=400, detail="visit_id does not belong to this patient")
    else:
        selected_visit = await _find_or_create_visit(patient_id, db)

    selected_report: Optional[LabReport] = None
    if report_id:
        selected_report = (await db.execute(select(LabReport).where(LabReport.report_id == report_id))).scalar_one_or_none()
        if not selected_report or selected_report.patient_id != patient_id:
            raise HTTPException(status_code=400, detail="report_id does not belong to this patient")
    elif lab_id:
        lab = (await db.execute(select(Lab).where(Lab.lab_id == lab_id))).scalar_one_or_none()
        if not lab:
            raise HTTPException(status_code=404, detail="Lab not found")
        selected_report = LabReport(
            patient_id=patient_id,
            lab_id=lab_id,
            visit_id=selected_visit.visit_id if selected_visit else None,
            report_date=now,
            report_type="oral_cancer_screening",
            status="completed",
            test_name="oral_cancer_image_screening",
            performed_by=user.username,
            pdf_url=str(file_path.relative_to(PROJECT_ROOT)),
        )
        db.add(selected_report)
        await db.flush()

    screening = OralCancerScreening(
        patient_id=patient_id,
        visit_id=selected_visit.visit_id if selected_visit else None,
        report_id=selected_report.report_id if selected_report else None,
        lab_id=lab_id,
        image_path=str(file_path.relative_to(PROJECT_ROOT)),
        image_hash=image_hash,
        model_name=model_name,
        model_version=model_version,
        diagnosis_label=mapped["diagnosis_label"],
        progression_stage=mapped["progression_stage"],
        confidence_score=mapped["confidence_score"],
        raw_response=raw_prediction,
    )
    db.add(screening)

    ml_prediction = MLPrediction(
        patient_id=patient_id,
        model_name=model_name,
        model_version=model_version or "1",
        input_features={
            "image_path": screening.image_path,
            "report_id": str(selected_report.report_id) if selected_report else None,
            "visit_id": str(selected_visit.visit_id) if selected_visit else None,
            "mime_type": image.content_type,
            "size_bytes": len(image_bytes),
        },
        prediction_result=raw_prediction,
        confidence_score=mapped["confidence_score"],
        prediction_date=now,
    )
    db.add(ml_prediction)

    diagnosis_id: Optional[str] = None
    progression_id: Optional[str] = None
    if auto_save and selected_visit:
        diagnosis = Diagnosis(
            visit_id=selected_visit.visit_id,
            disease_name="oral_cancer",
            diagnosis_date=now,
            confidence_score=mapped["confidence_score"],
            ml_model_used=f"{model_name}_v{model_version}",
            status=DiagnosisStatusEnum.SUSPECTED,
            notes=(
                f"Auto-generated from oral image screening. Label={mapped['top_class']}, "
                f"Screening ID={screening.screening_id}"
            ),
        )
        db.add(diagnosis)
        await db.flush()

        progression = DiseaseProgression(
            patient_id=patient_id,
            disease_name="oral_cancer",
            progression_stage=mapped["progression_stage"],
            assessed_date=now,
            ml_model_used=f"{model_name}_v{model_version}",
            confidence_score=mapped["confidence_score"],
            notes=f"Auto-generated from oral image screening (report_id={selected_report.report_id if selected_report else None})",
        )
        db.add(progression)
        await db.flush()

        diagnosis_id = str(diagnosis.diagnosis_id)
        progression_id = str(progression.progression_id)

    await db.commit()
    await db.refresh(screening)

    return {
        "screening_id": str(screening.screening_id),
        "patient_id": str(patient_id),
        "report_id": str(selected_report.report_id) if selected_report else None,
        "visit_id": str(selected_visit.visit_id) if selected_visit else None,
        "diagnosis_id": diagnosis_id,
        "progression_id": progression_id,
        "diagnosis_label": mapped["diagnosis_label"],
        "progression_stage": mapped["progression_stage"],
        "confidence_score": mapped["confidence_score"],
        "model_name": model_name,
        "model_version": model_version,
        "top_class": mapped["top_class"],
        "raw_prediction": raw_prediction,
        "created_at": screening.created_at.isoformat(),
    }
