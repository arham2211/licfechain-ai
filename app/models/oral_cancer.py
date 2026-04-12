from datetime import datetime
import uuid

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class OralCancerScreening(Base):
    __tablename__ = "oral_cancer_screenings"

    screening_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False, index=True
    )
    visit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctor_visits.visit_id", ondelete="SET NULL"), nullable=True, index=True
    )
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_reports.report_id", ondelete="SET NULL"), nullable=True, index=True
    )
    lab_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("labs.lab_id", ondelete="SET NULL"), nullable=True, index=True
    )
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    image_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    diagnosis_label: Mapped[str] = mapped_column(String(200), nullable=False)
    progression_stage: Mapped[str] = mapped_column(String(100), nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    patient = relationship("Patient", back_populates="oral_cancer_screenings")
    visit = relationship("DoctorVisit", back_populates="oral_cancer_screenings")
    report = relationship("LabReport", back_populates="oral_cancer_screenings")
    lab = relationship("Lab", back_populates="oral_cancer_screenings")

