"""
Pydantic schemas for Lab-related API endpoints
"""

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from pydantic import BaseModel, Field
from uuid import UUID

if TYPE_CHECKING:
    from app.schemas.patient import Patient
    from app.schemas.visit import DoctorVisit


class LabBase(BaseModel):
    lab_name: str = Field(..., min_length=1, max_length=200)
    lab_location: Optional[str] = Field(None, max_length=500)
    accreditation_number: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)


class LabCreate(LabBase):
    pass


class LabUpdate(BaseModel):
    lab_name: Optional[str] = Field(None, min_length=1, max_length=200)
    lab_location: Optional[str] = Field(None, max_length=500)
    accreditation_number: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)


class Lab(LabBase):
    lab_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class LabReportBase(BaseModel):
    patient_id: UUID
    lab_id: UUID
    visit_id: Optional[UUID] = None
    report_date: datetime
    report_type: str = Field(..., min_length=1, max_length=100)
    status: str = Field(..., pattern='^(pending|completed)$')
    pdf_url: Optional[str] = Field(None, max_length=500)
    test_name: Optional[str] = Field(None, max_length=200, description="Test name for this report (e.g., 'hba1c', 'fasting_glucose')")
    performed_by: Optional[str] = Field(None, max_length=200, description="Name of the lab technician who performed the test")


class LabReportCreate(LabReportBase):
    pass


class LabReportUpdate(BaseModel):
    visit_id: Optional[UUID] = None
    report_date: Optional[datetime] = None
    report_type: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[str] = Field(None, pattern='^(pending|completed)$')
    pdf_url: Optional[str] = Field(None, max_length=500)
    performed_by: Optional[str] = Field(None, max_length=200)


class LabReport(LabReportBase):
    report_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LabReportWithRelations(LabReport):
    patient: Optional['Patient'] = None
    lab: Optional['Lab'] = None
    visit: Optional['DoctorVisit'] = None
    test_results: List['LabTestResult'] = []

    class Config:
        from_attributes = True


class LabTestResultBase(BaseModel):
    test_name: str = Field(..., min_length=1, max_length=200)
    test_value: float = Field(..., ge=0)
    unit: Optional[str] = Field(None, min_length=1, max_length=50, description="Auto-filled if not provided")
    reference_range_min: Optional[float] = Field(None, ge=0, description="Auto-filled from standard ranges if not provided")
    reference_range_max: Optional[float] = Field(None, ge=0, description="Auto-filled from standard ranges if not provided")
    is_abnormal: Optional[bool] = Field(None, description="Auto-calculated based on reference range - do not provide manually")


class LabTestResultCreate(LabTestResultBase):
    pass


class LabTestResult(LabTestResultBase):
    result_id: UUID
    report_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# Forward references are handled by string annotations
