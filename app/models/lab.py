from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Float, Boolean, Enum as SQLEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum

from app.models.base import Base


class ReportStatusEnum(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"


class Lab(Base):
    __tablename__ = "labs"

    lab_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lab_name: Mapped[str] = mapped_column(String(200), nullable=False)
    lab_location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    accreditation_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    lab_reports = relationship(
        "LabReport", back_populates="lab", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Lab(name={self.lab_name}, location={self.lab_location})>"


class LabReport(Base):
    __tablename__ = "lab_reports"

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    lab_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("labs.lab_id", ondelete="CASCADE"), nullable=False
    )
    visit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctor_visits.visit_id", ondelete="SET NULL"), nullable=True
    )
    report_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    report_type: Mapped[str] = mapped_column(String(100), nullable=False)  # blood_test, urine_test, etc.
    status: Mapped[ReportStatusEnum] = mapped_column(
        SQLEnum(ReportStatusEnum, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False, default=ReportStatusEnum.PENDING
    )
    pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    test_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Test name for this report
    performed_by: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Lab technician name
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    patient = relationship("Patient", back_populates="lab_reports")
    lab = relationship("Lab", back_populates="lab_reports")
    visit = relationship("DoctorVisit", back_populates="lab_reports")
    test_results = relationship(
        "LabTestResult", back_populates="report", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<LabReport(report_id={self.report_id}, patient_id={self.patient_id}, type={self.report_type})>"


class LabTestResult(Base):
    __tablename__ = "lab_test_results"

    result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_reports.report_id", ondelete="CASCADE"), nullable=False
    )
    test_name: Mapped[str] = mapped_column(String(200), nullable=False)
    test_value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_range_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    reference_range_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_abnormal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    report = relationship("LabReport", back_populates="test_results")

    def __repr__(self) -> str:
        return f"<LabTestResult(test={self.test_name}, value={self.test_value} {self.unit})>"

