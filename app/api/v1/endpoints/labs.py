"""
Lab CRUD API endpoints
"""

from typing import List, Optional, Any
import re
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from uuid import UUID
from datetime import datetime, date

from app.db.session import get_db
from app.models import Lab, LabReport, LabTestResult, Patient, DoctorVisit, DiseaseProgression, OralCancerScreening, Diagnosis
from app.models.auth import User, UserRole, Role
from app.models.visit import DiagnosisStatusEnum
from app.schemas.lab import (
    Lab as LabSchema,
    LabCreate,
    LabUpdate,
    LabReport as LabReportSchema,
    LabReportCreate,
    LabReportUpdate,
    LabTestResult as LabTestResultSchema,
    LabTestResultCreate
)
from app.core.test_reference_ranges import (
    calculate_is_abnormal,
    get_reference_range,
    get_all_supported_tests
)
from app.api.v1.dependencies import get_translation_language, apply_translation, require_roles

router = APIRouter()


def _norm(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")


def _infer_disease_key(report: LabReport, test_results: List[LabTestResult]) -> Optional[str]:
    haystack = " ".join(
        [
            _norm(report.report_type),
            _norm(getattr(report, "test_name", None)),
            " ".join(_norm(r.test_name) for r in test_results),
        ]
    )

    if any(k in haystack for k in ["ckd", "kidney", "egfr", "creatinine", "bun", "uacr"]):
        return "ckd"
    if any(k in haystack for k in ["diabetes", "hba1c", "glucose", "insulin"]):
        return "diabetes"
    if any(k in haystack for k in ["anemia", "hemoglobin", "ferritin", "serum_iron", "hematocrit"]):
        return "anemia"
    if any(k in haystack for k in ["parathyroid", "pth", "calcium", "phosphorus"]):
        return "parathyroid"
    if any(k in haystack for k in ["oral", "oral_cancer", "oral_cancer_screening", "oral_cancer_image_screening"]):
        return "oral_cancer"
    return None


def _as_lookup(test_results: List[LabTestResult]) -> dict[str, float]:
    lookup: dict[str, float] = {}
    for row in test_results:
        if row.test_value is None:
            continue
        key = _norm(row.test_name)
        lookup[key] = float(row.test_value)
    return lookup


def _first_value(lookup: dict[str, float], keys: List[str]) -> Optional[float]:
    for key in keys:
        if key in lookup:
            return lookup[key]
    return None


def _estimate_progression_stage(disease_key: str, lookup: dict[str, float]) -> tuple[str, float]:
    if disease_key == "ckd":
        egfr = _first_value(lookup, ["egfr", "e_gfr"])
        if egfr is not None:
            if egfr >= 90:
                return "Stage 1", 0.82
            if egfr >= 60:
                return "Stage 2", 0.84
            if egfr >= 45:
                return "Stage 3a", 0.86
            if egfr >= 30:
                return "Stage 3b", 0.88
            if egfr >= 15:
                return "Stage 4", 0.90
            return "ESRD", 0.92
        creatinine = _first_value(lookup, ["serum_creatinine", "creatinine"])
        if creatinine is not None and creatinine >= 2.0:
            return "Stage 4", 0.74
        return "Stage 3", 0.65

    if disease_key == "diabetes":
        hba1c = _first_value(lookup, ["hba1c", "hb_a1c"])
        glucose = _first_value(lookup, ["fasting_glucose", "glucose"])
        if hba1c is not None:
            if hba1c < 5.7:
                return "Normal", 0.86
            if hba1c < 6.5:
                return "Prediabetes", 0.88
            if hba1c < 8.0:
                return "Diabetes", 0.9
            return "Complicated", 0.92
        if glucose is not None:
            if glucose < 100:
                return "Normal", 0.8
            if glucose < 126:
                return "Prediabetes", 0.82
            if glucose < 180:
                return "Diabetes", 0.84
            return "Complicated", 0.86
        return "Diabetes", 0.6

    if disease_key == "anemia":
        hb = _first_value(lookup, ["hemoglobin", "hb"])
        if hb is not None:
            if hb >= 12:
                return "Normal", 0.84
            if hb >= 10:
                return "Mild", 0.86
            if hb >= 8:
                return "Moderate", 0.88
            return "Severe", 0.9
        return "Mild", 0.6

    if disease_key == "parathyroid":
        pth = _first_value(lookup, ["pth", "parathyroid_hormone"])
        calcium = _first_value(lookup, ["calcium", "ca"])
        if pth is not None and calcium is not None:
            if pth > 65 and calcium > 10.2:
                return "Primary Hyperparathyroidism", 0.86
            if pth > 65 and calcium <= 10.2:
                return "Secondary Hyperparathyroidism", 0.84
            if pth < 15:
                return "Hypoparathyroidism", 0.83
            return "Normal", 0.8
        return "Normal", 0.6

    return "Stable", 0.5


def _disease_name_from_key(disease_key: str) -> str:
    mapping = {
        "ckd": "chronic_kidney_disease",
        "diabetes": "diabetes",
        "anemia": "anemia",
        "parathyroid": "parathyroid_disorder",
        "oral_cancer": "oral_cancer",
    }
    return mapping.get(disease_key, disease_key)


async def _auto_upsert_visit_diagnosis(
    db: AsyncSession,
    report: LabReport,
    disease_name: str,
    stage: str,
    confidence: float,
) -> None:
    """Auto-create or update a Diagnosis row on the visit linked to this report."""
    if not report.visit_id:
        return
    marker = f"auto_lab_report_id={report.report_id}"
    existing_q = await db.execute(
        select(Diagnosis).where(
            Diagnosis.visit_id == report.visit_id,
            Diagnosis.disease_name == disease_name,
            Diagnosis.notes.ilike(f"%{marker}%"),
        )
    )
    existing_diag = existing_q.scalar_one_or_none()
    diag_notes = f"Auto-confirmed from completed lab report. Stage: {stage}. ({marker})"
    if existing_diag:
        existing_diag.status = DiagnosisStatusEnum.CONFIRMED
        existing_diag.confidence_score = confidence
        existing_diag.notes = diag_notes
        return
    db.add(
        Diagnosis(
            visit_id=report.visit_id,
            disease_name=disease_name,
            diagnosis_date=report.report_date or datetime.utcnow(),
            confidence_score=confidence,
            ml_model_used="lab_report_auto",
            status=DiagnosisStatusEnum.CONFIRMED,
            notes=diag_notes,
        )
    )


async def _sync_progression_from_report(db: AsyncSession, report: LabReport) -> None:
    """Create/update DiseaseProgression when a lab report is completed."""
    results_q = await db.execute(
        select(LabTestResult).where(LabTestResult.report_id == report.report_id)
    )
    test_results = results_q.scalars().all()

    disease_key = _infer_disease_key(report, test_results or [])
    if not disease_key:
        return

    # ── Oral cancer: pull stage from the most recent OralCancerScreening for this report
    if disease_key == "oral_cancer":
        screening_q = await db.execute(
            select(OralCancerScreening)
            .where(OralCancerScreening.report_id == report.report_id)
            .order_by(OralCancerScreening.created_at.desc())
            .limit(1)
        )
        screening = screening_q.scalar_one_or_none()
        if not screening:
            # No scan uploaded yet — nothing to sync
            return
        stage = screening.progression_stage
        confidence = float(screening.confidence_score) if screening.confidence_score else 0.7
        disease_name = "oral_cancer"

        # The /detect endpoint already created a DiseaseProgression row for this report.
        # Find and update it (by screening_id or report_id reference in notes) instead of
        # creating a duplicate.
        report_id_str = str(report.report_id)
        screening_id_str = str(screening.screening_id)
        detect_existing_q = await db.execute(
            select(DiseaseProgression).where(
                DiseaseProgression.patient_id == report.patient_id,
                DiseaseProgression.disease_name == "oral_cancer",
                or_(
                    DiseaseProgression.notes.ilike(f"%report_id={report_id_str}%"),
                    DiseaseProgression.notes.ilike(f"%{screening_id_str}%"),
                ),
            )
        )
        detect_existing = detect_existing_q.scalar_one_or_none()
        if detect_existing:
            # Already exists from /detect — just update stage/confidence in case of re-scan
            detect_existing.progression_stage = stage
            detect_existing.confidence_score = confidence
            await _auto_upsert_visit_diagnosis(db, report, disease_name, stage, confidence)
            return
        # Fall through to create via the shared upsert below
    else:
        if not test_results:
            return
        lookup = _as_lookup(test_results)
        stage, confidence = _estimate_progression_stage(disease_key, lookup)
        disease_name = _disease_name_from_key(disease_key)
    marker = f"source_report_id={report.report_id}"
    notes = (
        f"Auto-generated from completed lab report ({marker}). "
        f"Disease inferred from report/test names."
    )

    existing_q = await db.execute(
        select(DiseaseProgression).where(
            DiseaseProgression.patient_id == report.patient_id,
            DiseaseProgression.disease_name == disease_name,
            DiseaseProgression.notes.ilike(f"%{marker}%"),
        )
    )
    existing = existing_q.scalar_one_or_none()

    if existing:
        existing.progression_stage = stage
        existing.assessed_date = report.report_date or datetime.utcnow()
        existing.confidence_score = confidence
        existing.ml_model_used = "lab_report_auto_mapper_v1"
        existing.notes = notes
        await _auto_upsert_visit_diagnosis(db, report, disease_name, stage, confidence)
        return

    db.add(
        DiseaseProgression(
            patient_id=report.patient_id,
            disease_name=disease_name,
            progression_stage=stage,
            assessed_date=report.report_date or datetime.utcnow(),
            ml_model_used="lab_report_auto_mapper_v1",
            confidence_score=confidence,
            notes=notes,
        )
    )
    await _auto_upsert_visit_diagnosis(db, report, disease_name, stage, confidence)


@router.get("/patient-visits")
async def get_patient_visits_for_lab(
    patient_id: UUID = Query(..., description="Patient ID to fetch visits for"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _user=Depends(require_roles("admin", "doctor", "lab")),
    db: AsyncSession = Depends(get_db)
):
    """Get visits for a patient for lab-report linking (lab role allowed)."""
    try:
        result = await db.execute(
            select(DoctorVisit)
            .where(DoctorVisit.patient_id == patient_id)
            .order_by(DoctorVisit.visit_date.desc())
            .offset(skip)
            .limit(limit)
        )
        visits = result.scalars().all()
        return [
            {
                "visit_id": str(v.visit_id),
                "visit_date": v.visit_date.isoformat() if v.visit_date else None,
                "visit_type": v.visit_type.value if hasattr(v.visit_type, "value") else str(v.visit_type),
                "chief_complaint": v.chief_complaint,
            }
            for v in visits
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch patient visits: {str(e)}")

# Lab endpoints
@router.post("/", response_model=LabSchema)
async def create_lab(
    lab: LabCreate,
    _user=Depends(require_roles("admin", "lab")),
    db: AsyncSession = Depends(get_db)
):
    """Create a new lab"""
    try:
        db_lab = Lab(**lab.dict())
        db.add(db_lab)
        await db.commit()
        await db.refresh(db_lab)
        
        return db_lab
    
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create lab: {str(e)}")

@router.get("/", response_model=List[LabSchema])
async def get_labs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = Query(None, description="Search by lab name or location"),
    db: AsyncSession = Depends(get_db)
):
    """Get list of labs with pagination and search"""
    try:
        query = select(Lab)
        
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Lab.lab_name.ilike(search_term),
                    Lab.lab_location.ilike(search_term)
                )
            )
        
        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        labs = result.scalars().all()
        
        return labs
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get labs: {str(e)}")

# Lab Report endpoints - MUST be before /{lab_id} routes
@router.post("/reports", response_model=LabReportSchema)
async def create_lab_report(
    report: LabReportCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new lab report"""
    try:
        # Verify patient exists
        patient_result = await db.execute(
            select(Patient).where(Patient.patient_id == report.patient_id)
        )
        if not patient_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Verify lab exists
        lab_result = await db.execute(
            select(Lab).where(Lab.lab_id == report.lab_id)
        )
        if not lab_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Lab not found")
        
        # Verify visit exists if provided
        if report.visit_id:
            visit_result = await db.execute(
                select(DoctorVisit).where(DoctorVisit.visit_id == report.visit_id)
            )
            visit = visit_result.scalar_one_or_none()
            if not visit:
                raise HTTPException(status_code=404, detail="Visit not found")
            if visit.patient_id != report.patient_id:
                raise HTTPException(status_code=400, detail="Selected visit does not belong to the selected patient")
        
        # Create report
        report_data = report.dict()
        
        # Ensure report_date is naive (no timezone) to match database/model expectations
        if report_data.get("report_date") and report_data["report_date"].tzinfo:
            report_data["report_date"] = report_data["report_date"].replace(tzinfo=None)
            
        db_report = LabReport(**report_data)
        db.add(db_report)
        await db.commit()
        await db.refresh(db_report)
        
        return db_report
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create lab report: {str(e)}")

@router.get("/reports", response_model=List[LabReportSchema])
async def get_lab_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    patient_id: Optional[UUID] = Query(None, description="Filter by patient ID"),
    lab_id: Optional[UUID] = Query(None, description="Filter by lab ID"),
    report_type: Optional[str] = Query(None, description="Filter by report type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    doctor_patient_id: Optional[UUID] = Query(None, description="Filter by doctor: returns reports for all patients who visited this doctor"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get list of lab reports with filters"""
    try:
        query = select(LabReport)
        
        if doctor_patient_id:
            # Subquery: distinct patient IDs who had at least one visit with this doctor
            visited_patients_subq = (
                select(DoctorVisit.patient_id)
                .where(DoctorVisit.doctor_patient_id == doctor_patient_id)
                .distinct()
                .scalar_subquery()
            )
            query = query.where(LabReport.patient_id.in_(visited_patients_subq))

        if patient_id:
            query = query.where(LabReport.patient_id == patient_id)
        
        if lab_id:
            query = query.where(LabReport.lab_id == lab_id)
        
        if report_type:
            query = query.where(LabReport.report_type == report_type)
        
        if status:
            query = query.where(LabReport.status == status)
        
        if start_date:
            query = query.where(LabReport.report_date >= start_date)
        
        if end_date:
            query = query.where(LabReport.report_date <= end_date)
        
        query = query.order_by(LabReport.report_date.desc())
        query = query.offset(skip).limit(limit)
        
        result = await db.execute(query)
        reports = result.scalars().all()
        
        # Debug: Log query details
        if not reports:
            # Count total reports in database
            count_query = select(LabReport)
            count_result = await db.execute(select(func.count()).select_from(LabReport))
            total_count = count_result.scalar()
            print(f"DEBUG: Total lab reports in database: {total_count}")
            print(f"DEBUG: Query filters - patient_id: {patient_id}, lab_id: {lab_id}, status: {status}")
        
        # Apply translation if needed
        translated_reports = await apply_translation(reports, "lab_report", lang)
        return translated_reports
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get lab reports: {str(e)}")

@router.get("/reports/{report_id}", response_model=LabReportSchema)
async def get_lab_report(
    report_id: UUID,
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific lab report by ID"""
    try:
        result = await db.execute(
            select(LabReport).where(LabReport.report_id == report_id)
        )
        report = result.scalar_one_or_none()
        
        if not report:
            raise HTTPException(status_code=404, detail="Lab report not found")
        
        # Apply translation if needed
        translated_report = await apply_translation(report, "lab_report", lang)
        return translated_report
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get lab report: {str(e)}")

@router.put("/reports/{report_id}", response_model=LabReportSchema)
async def update_lab_report(
    report_id: UUID,
    report_update: LabReportUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a lab report"""
    try:
        result = await db.execute(
            select(LabReport).where(LabReport.report_id == report_id)
        )
        db_report = result.scalar_one_or_none()
        
        if not db_report:
            raise HTTPException(status_code=404, detail="Lab report not found")
        
        # Update fields
        update_data = report_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_report, field, value)

        # If this report is completed, sync progression timeline from its results.
        status_value = getattr(db_report.status, "value", db_report.status)
        if status_value == "completed":
            await _sync_progression_from_report(db, db_report)
        
        await db.commit()
        await db.refresh(db_report)
        
        return db_report
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update lab report: {str(e)}")

@router.delete("/reports/{report_id}")
async def delete_lab_report(
    report_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a lab report"""
    try:
        result = await db.execute(
            select(LabReport).where(LabReport.report_id == report_id)
        )
        db_report = result.scalar_one_or_none()
        
        if not db_report:
            raise HTTPException(status_code=404, detail="Lab report not found")
        
        await db.delete(db_report)
        await db.commit()
        
        return {"message": "Lab report deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete lab report: {str(e)}")

# Lab Test Result endpoints
@router.post("/reports/{report_id}/test-results", response_model=LabTestResultSchema)
async def create_lab_test_result(
    report_id: UUID,
    test_result: LabTestResultCreate,
    db: AsyncSession = Depends(get_db)
):
    """Add a test result to a lab report. is_abnormal is automatically calculated based on reference ranges."""
    try:
        # Verify report exists and get patient info for gender-specific ranges
        report_result = await db.execute(
            select(LabReport).where(LabReport.report_id == report_id)
        )
        db_report = report_result.scalar_one_or_none()
        if not db_report:
            raise HTTPException(status_code=404, detail="Lab report not found")
        
        # Get patient gender for gender-specific reference ranges
        patient_result = await db.execute(
            select(Patient).where(Patient.patient_id == db_report.patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        gender = patient.gender if patient else None
        
        # Prepare test result data
        test_data = test_result.dict()
        
        # Auto-calculate reference ranges if not provided
        if test_data.get("reference_range_min") is None or test_data.get("reference_range_max") is None:
            min_val, max_val, unit = get_reference_range(test_data["test_name"], gender)
            if test_data.get("reference_range_min") is None:
                test_data["reference_range_min"] = min_val
            if test_data.get("reference_range_max") is None:
                test_data["reference_range_max"] = max_val
            if not test_data.get("unit"):
                test_data["unit"] = unit
        
        # Auto-calculate is_abnormal based on reference range (override if manually provided)
        test_data["is_abnormal"] = calculate_is_abnormal(
            test_value=test_data["test_value"],
            test_name=test_data["test_name"],
            gender=gender,
            custom_min=test_data.get("reference_range_min"),
            custom_max=test_data.get("reference_range_max")
        )
        
        # Create test result
        db_test_result = LabTestResult(report_id=report_id, **test_data)
        db.add(db_test_result)
        
        await db.flush()

        # Only sync progression after the report has been explicitly marked completed.
        status_value = getattr(db_report.status, "value", db_report.status)
        if status_value == "completed":
            await _sync_progression_from_report(db, db_report)
            
        await db.commit()
        await db.refresh(db_test_result)
        
        return db_test_result
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create test result: {str(e)}")

@router.get("/reports/{report_id}/test-results", response_model=List[LabTestResultSchema])
async def get_lab_test_results(
    report_id: UUID,
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get test results for a lab report"""
    try:
        result = await db.execute(
            select(LabTestResult).where(LabTestResult.report_id == report_id)
        )
        test_results = result.scalars().all()
        
        # Apply translation if needed
        translated_results = await apply_translation(test_results, "lab_test_result", lang)
        return translated_results
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get test results: {str(e)}")

@router.get("/test-results/abnormal")
async def get_abnormal_test_results(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    patient_id: Optional[UUID] = Query(None, description="Filter by patient ID"),
    test_name: Optional[str] = Query(None, description="Filter by test name"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get abnormal test results"""
    try:
        query = select(LabTestResult).where(LabTestResult.is_abnormal == True)
        
        if patient_id:
            query = query.join(LabReport).where(LabReport.patient_id == patient_id)
        
        if test_name:
            query = query.where(LabTestResult.test_name == test_name)
        
        query = query.order_by(LabTestResult.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await db.execute(query)
        test_results = result.scalars().all()
        
        # Apply translation if needed
        translated_results = await apply_translation(test_results, "lab_test_result", lang)
        return translated_results
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get abnormal test results: {str(e)}")

@router.get("/tests/supported")
async def get_supported_tests(
    lang: str = Depends(get_translation_language)
):
    """
    Get all supported test types with their reference ranges and information
    
    Returns a list of all tests the system supports, including:
    - Test name
    - Unit
    - Reference ranges (general and gender-specific if applicable)
    - Description
    """
    try:
        tests = get_all_supported_tests()
        
        # Format response
        result = []
        for test_name, test_info in tests.items():
            test_data = {
                "test_name": test_name,
                "unit": test_info.get("unit"),
                "description": test_info.get("description", ""),
                "reference_range_min": test_info.get("reference_range_min"),
                "reference_range_max": test_info.get("reference_range_max"),
                "gender_specific": test_info.get("gender_specific", False)
            }
            
            # Add gender-specific ranges if applicable
            if test_info.get("gender_specific"):
                test_data["male_range"] = {
                    "min": test_info.get("male_min"),
                    "max": test_info.get("male_max")
                }
                test_data["female_range"] = {
                    "min": test_info.get("female_min"),
                    "max": test_info.get("female_max")
                }
            
            result.append(test_data)
        
        # Apply translation to test names and descriptions
        if lang != "en":
            translated_result = await apply_translation(result, "lab_test_result", lang)
            return {
                "supported_tests": translated_result,
                "total_count": len(translated_result)
            }
        
        return {
            "supported_tests": result,
            "total_count": len(result)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get supported tests: {str(e)}")

# Lab by ID endpoints - MUST be after all specific routes
@router.get("/{lab_id}", response_model=LabSchema)
async def get_lab(
    lab_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific lab by ID"""
    try:
        result = await db.execute(
            select(Lab).where(Lab.lab_id == lab_id)
        )
        lab = result.scalar_one_or_none()
        
        if not lab:
            raise HTTPException(status_code=404, detail="Lab not found")
        
        return lab
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get lab: {str(e)}")

@router.put("/{lab_id}", response_model=LabSchema)
async def update_lab(
    lab_id: UUID,
    lab_update: LabUpdate,
    _user=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db)
):
    """Update a lab"""
    try:
        result = await db.execute(
            select(Lab).where(Lab.lab_id == lab_id)
        )
        db_lab = result.scalar_one_or_none()
        
        if not db_lab:
            raise HTTPException(status_code=404, detail="Lab not found")
        
        # Update fields
        update_data = lab_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_lab, field, value)
        
        await db.commit()
        await db.refresh(db_lab)
        
        return db_lab
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update lab: {str(e)}")

@router.delete("/{lab_id}")
async def delete_lab(
    lab_id: UUID,
    _user=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db)
):
    """Delete a lab"""
    try:
        result = await db.execute(
            select(Lab).where(Lab.lab_id == lab_id)
        )
        db_lab = result.scalar_one_or_none()
        
        if not db_lab:
            raise HTTPException(status_code=404, detail="Lab not found")

        # Lab accounts are created separately in the auth tables.
        # When deleting the lab, also remove the matching lab login account.
        # We match by email and also by the default username derived from that email,
        # because the lab row itself does not store the auth username.
        if db_lab.email:
            derived_username = db_lab.email.split("@")[0]
            derived_username = re.sub(r"[^a-zA-Z0-9_]", "", derived_username)
            lab_users_result = await db.execute(
                select(User).where(
                    User.patient_id.is_(None),
                    or_(
                        User.email == db_lab.email,
                        User.username == derived_username,
                    ),
                )
            )
            for lab_user in lab_users_result.scalars().unique().all():
                await db.delete(lab_user)
        
        await db.delete(db_lab)
        await db.commit()
        
        return {"message": "Lab deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete lab: {str(e)}")
