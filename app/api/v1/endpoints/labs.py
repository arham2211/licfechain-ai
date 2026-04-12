"""
Lab CRUD API endpoints
"""

from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from uuid import UUID
from datetime import datetime, date

from app.db.session import get_db
from app.models import Lab, LabReport, LabTestResult, Patient, DoctorVisit
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
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """Get list of lab reports with filters"""
    try:
        query = select(LabReport)
        
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
        
        # Auto-update report status to COMPLETED as soon as a result is added
        if db_report.status != "completed":
            db_report.status = "completed"
            
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
        
        await db.delete(db_lab)
        await db.commit()
        
        return {"message": "Lab deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete lab: {str(e)}")
