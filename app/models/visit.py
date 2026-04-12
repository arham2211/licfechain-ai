from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Integer, Float, Text, Enum as SQLEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum

from app.models.base import Base


class VisitTypeEnum(str, enum.Enum):
    CONSULTATION = "consultation"
    FOLLOW_UP = "follow_up"
    ROUTINE_CHECKUP = "routine_checkup"
    LAB_REVIEW = "lab_review"
    EMERGENCY = "emergency"


class DiagnosisStatusEnum(str, enum.Enum):
    SUSPECTED = "suspected"
    CONFIRMED = "confirmed"


class DoctorVisit(Base):
    __tablename__ = "doctor_visits"

    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    doctor_patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    visit_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_type: Mapped[VisitTypeEnum] = mapped_column(
        SQLEnum(VisitTypeEnum, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False
    )
    doctor_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    vital_signs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    patient = relationship("Patient", foreign_keys="DoctorVisit.patient_id", back_populates="doctor_visits")
    doctor_patient = relationship("Patient", foreign_keys="DoctorVisit.doctor_patient_id", back_populates="doctor_visits_as_doctor")
    symptoms = relationship(
        "Symptom", back_populates="visit", cascade="all, delete-orphan"
    )
    diagnoses = relationship(
        "Diagnosis", back_populates="visit", cascade="all, delete-orphan"
    )
    prescriptions = relationship(
        "Prescription", back_populates="visit", cascade="all, delete-orphan"
    )
    lab_reports = relationship(
        "LabReport", back_populates="visit"
    )
    oral_cancer_screenings = relationship(
        "OralCancerScreening", back_populates="visit"
    )

    def __repr__(self) -> str:
        return f"<DoctorVisit(visit_id={self.visit_id}, patient_id={self.patient_id}, date={self.visit_date})>"


class Symptom(Base):
    __tablename__ = "symptoms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctor_visits.visit_id", ondelete="CASCADE"), nullable=False
    )
    symptom_name: Mapped[str] = mapped_column(String(200), nullable=False)
    severity: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-10 scale
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    visit = relationship("DoctorVisit", back_populates="symptoms")

    def __repr__(self) -> str:
        return f"<Symptom(symptom={self.symptom_name}, severity={self.severity})>"


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    diagnosis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctor_visits.visit_id", ondelete="CASCADE"), nullable=False
    )
    disease_name: Mapped[str] = mapped_column(String(200), nullable=False)
    diagnosis_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ml_model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[DiagnosisStatusEnum] = mapped_column(
        SQLEnum(DiagnosisStatusEnum, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False, default=DiagnosisStatusEnum.SUSPECTED
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    visit = relationship("DoctorVisit", back_populates="diagnoses")

    def __repr__(self) -> str:
        return f"<Diagnosis(disease={self.disease_name}, status={self.status})>"


class Prescription(Base):
    __tablename__ = "prescriptions"

    prescription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctor_visits.visit_id", ondelete="CASCADE"), nullable=False
    )
    medication_name: Mapped[str] = mapped_column(String(200), nullable=False)
    dosage: Mapped[str] = mapped_column(String(100), nullable=False)
    frequency: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    visit = relationship("DoctorVisit", back_populates="prescriptions")

    def __repr__(self) -> str:
        return f"<Prescription(medication={self.medication_name}, dosage={self.dosage})>"
