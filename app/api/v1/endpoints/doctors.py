"""
Doctor CRUD API endpoints
Note: Doctors are patients with additional fields. A doctor must first exist as a patient.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from uuid import UUID

from app.db.session import get_db
from app.models import Patient
from app.models.auth import User, UserRole, Role
from app.api.v1.dependencies import require_roles
from app.schemas.doctor import Doctor as DoctorSchema, DoctorCreate, DoctorUpdate

router = APIRouter()

@router.post("/", response_model=DoctorSchema)
async def create_doctor(
    doctor: DoctorCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a doctor by adding doctor-specific fields to an existing patient"""
    try:
        # Check if patient exists
        patient_result = await db.execute(
            select(Patient).where(Patient.patient_id == doctor.patient_id)
        )
        db_patient = patient_result.scalar_one_or_none()
        
        if not db_patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Check if patient is already a doctor
        if db_patient.is_doctor:
            raise HTTPException(status_code=400, detail="This patient is already registered as a doctor")
        
        # Check if license number already exists
        existing_doctor = await db.execute(
            select(Patient).where(
                Patient.license_number == doctor.license_number,
                Patient.is_doctor == True
            )
        )
        if existing_doctor.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Doctor with this license number already exists")
        
        # Add doctor-specific fields to the patient
        db_patient.is_doctor = True
        db_patient.specialization = doctor.specialization
        db_patient.license_number = doctor.license_number
        db_patient.hospital_affiliation = doctor.hospital_affiliation
        
        await db.commit()
        await db.refresh(db_patient)
        
        return db_patient
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create doctor: {str(e)}")

@router.get("/", response_model=List[DoctorSchema])
async def get_doctors(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = Query(None, description="Search by name or specialization"),
    specialization: Optional[str] = Query(None, description="Filter by specialization"),
    db: AsyncSession = Depends(get_db)
):
    """Get list of doctors with pagination and search"""
    try:
        query = select(Patient).where(Patient.is_doctor == True)
        
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Patient.first_name.ilike(search_term),
                    Patient.last_name.ilike(search_term),
                    Patient.specialization.ilike(search_term)
                )
            )
        
        if specialization:
            query = query.where(Patient.specialization.ilike(f"%{specialization}%"))
        
        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        doctors = result.scalars().all()
        
        return doctors
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get doctors: {str(e)}")

@router.get("/{doctor_id}", response_model=DoctorSchema)
async def get_doctor(
    doctor_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific doctor by patient ID"""
    try:
        result = await db.execute(
            select(Patient).where(
                Patient.patient_id == doctor_id,
                Patient.is_doctor == True
            )
        )
        doctor = result.scalar_one_or_none()
        
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        return doctor
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get doctor: {str(e)}")

@router.put("/{doctor_id}", response_model=DoctorSchema)
async def update_doctor(
    doctor_id: UUID,
    doctor_update: DoctorUpdate,
    _user=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db)
):
    """Update a doctor's doctor-specific fields"""
    try:
        result = await db.execute(
            select(Patient).where(
                Patient.patient_id == doctor_id,
                Patient.is_doctor == True
            )
        )
        db_doctor = result.scalar_one_or_none()
        
        if not db_doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        # Check license number uniqueness if updating
        if doctor_update.license_number and doctor_update.license_number != db_doctor.license_number:
            existing_doctor = await db.execute(
                select(Patient).where(
                    Patient.license_number == doctor_update.license_number,
                    Patient.is_doctor == True,
                    Patient.patient_id != doctor_id
                )
            )
            if existing_doctor.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Doctor with this license number already exists")
        
        # Update doctor-specific fields only
        update_data = doctor_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_doctor, field, value)
        
        await db.commit()
        await db.refresh(db_doctor)
        
        return db_doctor
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update doctor: {str(e)}")

@router.delete("/{doctor_id}")
async def delete_doctor(
    doctor_id: UUID,
    _user=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db)
):
    """Remove all doctor functionality from a person while preserving the patient record."""
    try:
        result = await db.execute(
            select(Patient).where(
                Patient.patient_id == doctor_id,
                Patient.is_doctor == True
            )
        )
        db_doctor = result.scalar_one_or_none()
        
        if not db_doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        # Remove doctor-specific fields but keep the patient record.
        db_doctor.is_doctor = False
        db_doctor.specialization = None
        db_doctor.license_number = None
        db_doctor.hospital_affiliation = None

        # Remove doctor-role access from linked auth accounts.
        doctor_users_result = await db.execute(
            select(User)
            .join(User.user_roles)
            .join(UserRole.role)
            .where(
                User.patient_id == doctor_id,
                Role.name == "doctor",
            )
        )
        doctor_users = doctor_users_result.scalars().unique().all()
        for doctor_user in doctor_users:
            doctor_role_links_result = await db.execute(
                select(UserRole)
                .join(UserRole.role)
                .where(
                    UserRole.user_id == doctor_user.user_id,
                    Role.name == "doctor",
                )
            )
            doctor_role_links = doctor_role_links_result.scalars().all()
            for doctor_role_link in doctor_role_links:
                await db.delete(doctor_role_link)

            remaining_roles_result = await db.execute(
                select(UserRole).where(UserRole.user_id == doctor_user.user_id)
            )
            remaining_roles = remaining_roles_result.scalars().all()
            if not remaining_roles:
                await db.delete(doctor_user)
        
        await db.commit()
        
        return {"message": "Doctor functionality removed successfully. Patient record preserved."}
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to remove doctor functionality: {str(e)}")

@router.get("/specializations/list")
async def get_specializations(db: AsyncSession = Depends(get_db)):
    """Get list of all specializations"""
    try:
        result = await db.execute(
            select(Patient.specialization).where(
                Patient.is_doctor == True,
                Patient.specialization.isnot(None)
            ).distinct()
        )
        specializations = [row[0] for row in result.fetchall() if row[0]]
        
        return {"specializations": specializations}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get specializations: {str(e)}")
