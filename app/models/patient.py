from datetime import datetime
from sqlalchemy import String, Date, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum

from app.models.base import Base


class GenderEnum(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class Patient(Base):
    __tablename__ = "patients"

    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    cnic: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[datetime] = mapped_column(Date, nullable=False)
    gender: Mapped[GenderEnum] = mapped_column(
        SQLEnum(GenderEnum, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False
    )
    blood_group: Mapped[str | None] = mapped_column(String(5), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Doctor-specific fields (nullable, only set for doctors)
    is_doctor: Mapped[bool] = mapped_column(default=False, nullable=False)
    specialization: Mapped[str | None] = mapped_column(String(100), nullable=True)
    license_number: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    hospital_affiliation: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Relationships
    family_relationships = relationship(
        "FamilyRelationship",
        foreign_keys="FamilyRelationship.patient_id",
        back_populates="patient",
        cascade="all, delete-orphan"
    )
    relative_relationships = relationship(
        "FamilyRelationship",
        foreign_keys="FamilyRelationship.relative_patient_id",
        back_populates="relative_patient",
        cascade="all, delete-orphan"
    )
    disease_history = relationship(
        "FamilyDiseaseHistory", back_populates="patient", cascade="all, delete-orphan"
    )
    doctor_visits = relationship(
        "DoctorVisit", 
        foreign_keys="DoctorVisit.patient_id",
        back_populates="patient", 
        cascade="all, delete-orphan"
    )
    doctor_visits_as_doctor = relationship(
        "DoctorVisit",
        foreign_keys="DoctorVisit.doctor_patient_id",
        back_populates="doctor_patient",
        cascade="all, delete-orphan"
    )
    lab_reports = relationship(
        "LabReport", back_populates="patient", cascade="all, delete-orphan"
    )
    disease_progressions = relationship(
        "DiseaseProgression", back_populates="patient", cascade="all, delete-orphan"
    )
    ml_predictions = relationship(
        "MLPrediction", back_populates="patient", cascade="all, delete-orphan"
    )
    oral_cancer_screenings = relationship(
        "OralCancerScreening", back_populates="patient", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Patient(cnic={self.cnic}, name={self.first_name} {self.last_name})>"
