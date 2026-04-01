"""
Patient CRUD API endpoints
"""

from typing import List, Optional, Set
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from uuid import UUID

from app.db.session import get_db
from app.models import Patient, FamilyRelationship, FamilyDiseaseHistory, DiseaseProgression, Diagnosis, DoctorVisit
from app.schemas.patient import (
    Patient as PatientSchema,
    PatientCreate,
    PatientUpdate,
    FamilyRelationship as FamilyRelationshipSchema,
    FamilyRelationshipCreate,
    FamilyRelationshipAutoCreate
)
from app.models.family import RelationshipTypeEnum
from app.api.v1.dependencies import get_translation_language, apply_translation

router = APIRouter()

@router.post("/", response_model=PatientSchema)
async def create_patient(
    patient: PatientCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new patient"""
    try:
        # Check if patient with same CNIC already exists
        existing_patient = await db.execute(
            select(Patient).where(Patient.cnic == patient.cnic)
        )
        if existing_patient.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Patient with this CNIC already exists")
        
        # Convert patient data to dict and handle gender enum
        patient_data = patient.dict()
        
        # Create new patient
        db_patient = Patient(**patient_data)
        db.add(db_patient)
        await db.commit()
        await db.refresh(db_patient)
        
        return db_patient
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create patient: {str(e)}")

@router.get("/", response_model=List[PatientSchema])
async def get_patients(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = Query(None, description="Search by name or CNIC"),
    db: AsyncSession = Depends(get_db)
):
    """Get list of patients with pagination and search"""
    try:
        query = select(Patient)
        
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Patient.first_name.ilike(search_term),
                    Patient.last_name.ilike(search_term),
                    Patient.cnic.ilike(search_term)
                )
            )
        
        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        patients = result.scalars().all()
        
        return patients
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get patients: {str(e)}")

@router.get("/{patient_id}", response_model=PatientSchema)
async def get_patient(
    patient_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific patient by ID"""
    try:
        result = await db.execute(
            select(Patient).where(Patient.patient_id == patient_id)
        )
        patient = result.scalar_one_or_none()
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        return patient
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get patient: {str(e)}")

@router.put("/{patient_id}", response_model=PatientSchema)
async def update_patient(
    patient_id: UUID,
    patient_update: PatientUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a patient"""
    try:
        result = await db.execute(
            select(Patient).where(Patient.patient_id == patient_id)
        )
        db_patient = result.scalar_one_or_none()
        
        if not db_patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Check CNIC uniqueness if updating CNIC
        if patient_update.cnic and patient_update.cnic != db_patient.cnic:
            existing_patient = await db.execute(
                select(Patient).where(Patient.cnic == patient_update.cnic)
            )
            if existing_patient.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Patient with this CNIC already exists")
        
        # Update fields
        update_data = patient_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_patient, field, value)
        
        await db.commit()
        await db.refresh(db_patient)
        
        return db_patient
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update patient: {str(e)}")

@router.delete("/{patient_id}")
async def delete_patient(
    patient_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a patient"""
    try:
        result = await db.execute(
            select(Patient).where(Patient.patient_id == patient_id)
        )
        db_patient = result.scalar_one_or_none()
        
        if not db_patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        await db.delete(db_patient)
        await db.commit()
        
        return {"message": "Patient deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete patient: {str(e)}")

@router.post("/{patient_id}/family-relationships", response_model=FamilyRelationshipSchema)
async def create_family_relationship(
    patient_id: UUID,
    relationship: FamilyRelationshipCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a family relationship for a patient"""
    try:
        # Verify patient exists
        patient_result = await db.execute(
            select(Patient).where(Patient.patient_id == patient_id)
        )
        if not patient_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Verify relative exists
        relative_result = await db.execute(
            select(Patient).where(Patient.patient_id == relationship.relative_patient_id)
        )
        if not relative_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Relative patient not found")
        
        # Check if relationship already exists
        existing_relationship = await db.execute(
            select(FamilyRelationship).where(
                and_(
                    FamilyRelationship.patient_id == patient_id,
                    FamilyRelationship.relative_patient_id == relationship.relative_patient_id,
                    FamilyRelationship.relationship_type == relationship.relationship_type
                )
            )
        )
        if existing_relationship.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Family relationship already exists")
        
        # Create relationship
        db_relationship = FamilyRelationship(
            patient_id=patient_id,
            **relationship.dict()
        )
        db.add(db_relationship)
        await db.commit()
        await db.refresh(db_relationship)
        
        return db_relationship
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create family relationship: {str(e)}")

@router.post("/{patient_id}/family-relationships/auto")
async def create_family_relationship_auto(
    patient_id: UUID,
    relationship: FamilyRelationshipAutoCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a family relationship and automatically infer related relationships
    
    When you add a relationship like "parent", the system will automatically:
    - Find and create relationships with spouse (mother/father)
    - Find and create relationships with siblings
    - Find and create relationships with grandparents
    - Find and create relationships with uncles/aunts
    - Continue recursively up to max_depth (default 10, max 20)
    """
    try:
        # Verify patient exists
        patient_result = await db.execute(
            select(Patient).where(Patient.patient_id == patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Verify relative exists
        relative_result = await db.execute(
            select(Patient).where(Patient.patient_id == relationship.relative_patient_id)
        )
        relative = relative_result.scalar_one_or_none()
        if not relative:
            raise HTTPException(status_code=404, detail="Relative patient not found")
        
        # Helper function to safely create a relationship (skip if exists)
        async def create_relationship_safe(
            from_patient_id: UUID,
            to_patient_id: UUID,
            rel_type: RelationshipTypeEnum,
            is_blood: bool = True
        ) -> bool:
            """Create relationship if it doesn't exist. Returns True if created, False if skipped."""
            # Check if relationship already exists
            existing = await db.execute(
                select(FamilyRelationship).where(
                    and_(
                        FamilyRelationship.patient_id == from_patient_id,
                        FamilyRelationship.relative_patient_id == to_patient_id,
                        FamilyRelationship.relationship_type == rel_type
                    )
                )
            )
            if existing.scalar_one_or_none():
                return False  # Already exists, skip
            
            # Create relationship
            db_rel = FamilyRelationship(
                patient_id=from_patient_id,
                relative_patient_id=to_patient_id,
                relationship_type=rel_type,
                is_blood_relative=is_blood
            )
            db.add(db_rel)
            return True  # Created
        
        # Track created relationships
        created_relationships = []
        skipped_count = 0
        visited_pairs = set()  # Track (patient_id, relative_id) pairs to prevent infinite loops
        
        # Create direct relationship (bidirectional)
        rel_type_enum = RelationshipTypeEnum(relationship.relationship_type)
        created1 = await create_relationship_safe(
            patient_id, relationship.relative_patient_id, rel_type_enum, relationship.is_blood_relative
        )
        if created1:
            created_relationships.append({
                "from": str(patient_id),
                "to": str(relationship.relative_patient_id),
                "type": relationship.relationship_type,
                "depth": 0
            })
        else:
            skipped_count += 1
        
        # Create reverse relationship
        reverse_type_map = {
            RelationshipTypeEnum.PARENT: RelationshipTypeEnum.CHILD,
            RelationshipTypeEnum.CHILD: RelationshipTypeEnum.PARENT,
            RelationshipTypeEnum.SIBLING: RelationshipTypeEnum.SIBLING,
            RelationshipTypeEnum.SPOUSE: RelationshipTypeEnum.SPOUSE,
            RelationshipTypeEnum.GRANDPARENT: RelationshipTypeEnum.GRANDCHILD,
            RelationshipTypeEnum.GRANDCHILD: RelationshipTypeEnum.GRANDPARENT,
            RelationshipTypeEnum.AUNT_UNCLE: RelationshipTypeEnum.NIECE_NEPHEW,
            RelationshipTypeEnum.NIECE_NEPHEW: RelationshipTypeEnum.AUNT_UNCLE,
            RelationshipTypeEnum.COUSIN: RelationshipTypeEnum.COUSIN,
        }
        reverse_type = reverse_type_map.get(rel_type_enum)
        if reverse_type:
            created2 = await create_relationship_safe(
                relationship.relative_patient_id, patient_id, reverse_type, relationship.is_blood_relative
            )
            if created2:
                created_relationships.append({
                    "from": str(relationship.relative_patient_id),
                    "to": str(patient_id),
                    "type": reverse_type.value,
                    "depth": 0
                })
            else:
                skipped_count += 1
        
        if not relationship.auto_infer:
            await db.commit()
            return {
                "direct_relationship": {
                    "patient_id": str(patient_id),
                    "relative_id": str(relationship.relative_patient_id),
                    "relationship_type": relationship.relationship_type
                },
                "inferred_relationships": [],
                "total_created": len(created_relationships),
                "skipped_duplicates": skipped_count,
                "max_depth": relationship.max_depth
            }
        
        # Recursive inference function
        async def infer_relationships(
            current_patient_id: UUID,
            current_relative_id: UUID,
            current_rel_type: RelationshipTypeEnum,
            depth: int,
            max_depth: int
        ):
            """Recursively infer and create relationships"""
            if depth >= max_depth:
                return
            
            # Prevent infinite loops
            pair_key = (str(current_patient_id), str(current_relative_id), depth)
            if pair_key in visited_pairs:
                return
            visited_pairs.add(pair_key)
            
            # Get current relative's relationships
            relative_rels_result = await db.execute(
                select(FamilyRelationship).where(
                    FamilyRelationship.patient_id == current_relative_id
                )
            )
            relative_rels = relative_rels_result.scalars().all()
            
            # Inference rules based on relationship type
            if current_rel_type == RelationshipTypeEnum.PARENT:
                # 1. Find spouse (mother/father) - parent's spouse is the other parent
                spouse_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.SPOUSE]
                for spouse_rel in spouse_rels:
                    spouse_id = spouse_rel.relative_patient_id
                    # Create: patient -> spouse (other parent)
                    created = await create_relationship_safe(
                        patient_id, spouse_id, RelationshipTypeEnum.PARENT, True
                    )
                    if created:
                        created_relationships.append({
                            "from": str(patient_id),
                            "to": str(spouse_id),
                            "type": "parent",
                            "depth": depth + 1,
                            "inferred_from": "spouse_of_parent"
                        })
                        # Create reverse
                        await create_relationship_safe(
                            spouse_id, patient_id, RelationshipTypeEnum.CHILD, True
                        )
                        # Recursively infer from spouse
                        await infer_relationships(
                            patient_id, spouse_id, RelationshipTypeEnum.PARENT, depth + 1, max_depth
                        )
                
                # 2. Find siblings - parent's other children
                child_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.CHILD]
                for child_rel in child_rels:
                    sibling_id = child_rel.relative_patient_id
                    if sibling_id != patient_id:  # Don't create self-relationship
                        created = await create_relationship_safe(
                            patient_id, sibling_id, RelationshipTypeEnum.SIBLING, True
                        )
                        if created:
                            created_relationships.append({
                                "from": str(patient_id),
                                "to": str(sibling_id),
                                "type": "sibling",
                                "depth": depth + 1,
                                "inferred_from": "child_of_parent"
                            })
                            # Create reverse
                            await create_relationship_safe(
                                sibling_id, patient_id, RelationshipTypeEnum.SIBLING, True
                            )
                
                # 3. Find grandparents - parent's parents
                parent_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.PARENT]
                for parent_rel in parent_rels:
                    grandparent_id = parent_rel.relative_patient_id
                    created = await create_relationship_safe(
                        patient_id, grandparent_id, RelationshipTypeEnum.GRANDPARENT, True
                    )
                    if created:
                        created_relationships.append({
                            "from": str(patient_id),
                            "to": str(grandparent_id),
                            "type": "grandparent",
                            "depth": depth + 1,
                            "inferred_from": "parent_of_parent"
                        })
                        # Create reverse
                        await create_relationship_safe(
                            grandparent_id, patient_id, RelationshipTypeEnum.GRANDCHILD, True
                        )
                        # Recursively infer from grandparent
                        await infer_relationships(
                            patient_id, grandparent_id, RelationshipTypeEnum.GRANDPARENT, depth + 1, max_depth
                        )
                
                # 4. Find uncles/aunts - parent's siblings
                sibling_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.SIBLING]
                for sibling_rel in sibling_rels:
                    uncle_aunt_id = sibling_rel.relative_patient_id
                    created = await create_relationship_safe(
                        patient_id, uncle_aunt_id, RelationshipTypeEnum.AUNT_UNCLE, True
                    )
                    if created:
                        created_relationships.append({
                            "from": str(patient_id),
                            "to": str(uncle_aunt_id),
                            "type": "aunt_uncle",
                            "depth": depth + 1,
                            "inferred_from": "sibling_of_parent"
                        })
                        # Create reverse
                        await create_relationship_safe(
                            uncle_aunt_id, patient_id, RelationshipTypeEnum.NIECE_NEPHEW, True
                        )
            
            elif current_rel_type == RelationshipTypeEnum.SIBLING:
                # Siblings share same parents
                parent_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.PARENT]
                for parent_rel in parent_rels:
                    shared_parent_id = parent_rel.relative_patient_id
                    # Check if patient already has this parent
                    existing_parent = await db.execute(
                        select(FamilyRelationship).where(
                            and_(
                                FamilyRelationship.patient_id == patient_id,
                                FamilyRelationship.relative_patient_id == shared_parent_id,
                                FamilyRelationship.relationship_type == RelationshipTypeEnum.PARENT
                            )
                        )
                    )
                    if not existing_parent.scalar_one_or_none():
                        created = await create_relationship_safe(
                            patient_id, shared_parent_id, RelationshipTypeEnum.PARENT, True
                        )
                        if created:
                            created_relationships.append({
                                "from": str(patient_id),
                                "to": str(shared_parent_id),
                                "type": "parent",
                                "depth": depth + 1,
                                "inferred_from": "parent_of_sibling"
                            })
                            await create_relationship_safe(
                                shared_parent_id, patient_id, RelationshipTypeEnum.CHILD, True
                            )
                            # Recursively infer from parent
                            await infer_relationships(
                                patient_id, shared_parent_id, RelationshipTypeEnum.PARENT, depth + 1, max_depth
                            )
                
                # Sibling's children are nieces/nephews
                child_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.CHILD]
                for child_rel in child_rels:
                    niece_nephew_id = child_rel.relative_patient_id
                    created = await create_relationship_safe(
                        patient_id, niece_nephew_id, RelationshipTypeEnum.NIECE_NEPHEW, True
                    )
                    if created:
                        created_relationships.append({
                            "from": str(patient_id),
                            "to": str(niece_nephew_id),
                            "type": "niece_nephew",
                            "depth": depth + 1,
                            "inferred_from": "child_of_sibling"
                        })
                        await create_relationship_safe(
                            niece_nephew_id, patient_id, RelationshipTypeEnum.AUNT_UNCLE, True
                        )
            
            elif current_rel_type == RelationshipTypeEnum.GRANDPARENT:
                # Grandparent's children (except parent) are uncles/aunts
                child_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.CHILD]
                for child_rel in child_rels:
                    potential_uncle_aunt_id = child_rel.relative_patient_id
                    # Check if this is already a parent (skip if so)
                    is_parent = await db.execute(
                        select(FamilyRelationship).where(
                            and_(
                                FamilyRelationship.patient_id == patient_id,
                                FamilyRelationship.relative_patient_id == potential_uncle_aunt_id,
                                FamilyRelationship.relationship_type == RelationshipTypeEnum.PARENT
                            )
                        )
                    )
                    if not is_parent.scalar_one_or_none():
                        created = await create_relationship_safe(
                            patient_id, potential_uncle_aunt_id, RelationshipTypeEnum.AUNT_UNCLE, True
                        )
                        if created:
                            created_relationships.append({
                                "from": str(patient_id),
                                "to": str(potential_uncle_aunt_id),
                                "type": "aunt_uncle",
                                "depth": depth + 1,
                                "inferred_from": "child_of_grandparent"
                            })
                            await create_relationship_safe(
                                potential_uncle_aunt_id, patient_id, RelationshipTypeEnum.NIECE_NEPHEW, True
                            )
                
                # Grandparent's parents are great-grandparents
                parent_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.PARENT]
                for parent_rel in parent_rels:
                    great_grandparent_id = parent_rel.relative_patient_id
                    created = await create_relationship_safe(
                        patient_id, great_grandparent_id, RelationshipTypeEnum.GRANDPARENT, True
                    )
                    if created:
                        created_relationships.append({
                            "from": str(patient_id),
                            "to": str(great_grandparent_id),
                            "type": "grandparent",
                            "depth": depth + 1,
                            "inferred_from": "parent_of_grandparent"
                        })
                        await create_relationship_safe(
                            great_grandparent_id, patient_id, RelationshipTypeEnum.GRANDCHILD, True
                        )
                        await infer_relationships(
                            patient_id, great_grandparent_id, RelationshipTypeEnum.GRANDPARENT, depth + 1, max_depth
                        )
            
            elif current_rel_type == RelationshipTypeEnum.AUNT_UNCLE:
                # Aunt/uncle's children are cousins
                child_rels = [r for r in relative_rels if r.relationship_type == RelationshipTypeEnum.CHILD]
                for child_rel in child_rels:
                    cousin_id = child_rel.relative_patient_id
                    created = await create_relationship_safe(
                        patient_id, cousin_id, RelationshipTypeEnum.COUSIN, True
                    )
                    if created:
                        created_relationships.append({
                            "from": str(patient_id),
                            "to": str(cousin_id),
                            "type": "cousin",
                            "depth": depth + 1,
                            "inferred_from": "child_of_aunt_uncle"
                        })
                        await create_relationship_safe(
                            cousin_id, patient_id, RelationshipTypeEnum.COUSIN, True
                        )
        
        # Start recursive inference
        if relationship.auto_infer:
            await infer_relationships(
                patient_id,
                relationship.relative_patient_id,
                rel_type_enum,
                0,
                relationship.max_depth
            )
        
        # Commit all created relationships
        await db.commit()
        
        return {
            "direct_relationship": {
                "patient_id": str(patient_id),
                "relative_id": str(relationship.relative_patient_id),
                "relationship_type": relationship.relationship_type
            },
            "inferred_relationships": created_relationships,
            "total_created": len(created_relationships),
            "skipped_duplicates": skipped_count,
            "max_depth": relationship.max_depth,
            "max_depth_reached": any(r.get("depth", 0) >= relationship.max_depth for r in created_relationships)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create family relationship with auto-inference: {str(e)}")

@router.get("/{patient_id}/family-disease-history")
async def get_family_disease_history(
    patient_id: UUID,
    max_depth: int = Query(5, ge=1, le=10, description="Maximum depth to traverse family tree"),
    lang: str = Depends(get_translation_language),
    db: AsyncSession = Depends(get_db)
):
    """
    Get complete family tree with disease history for all blood relatives
    
    Traverses the family tree recursively up to max_depth levels, collecting all blood relatives
    and their disease diagnoses. Returns the complete family tree structure with:
    - All blood relatives (even if they have no diseases - diagnoses will be empty array)
    - Disease diagnoses for each relative (if any)
    - Relationship information and paths
    
    This endpoint combines family tree structure with disease history in one response.
    """
    try:
        # Verify patient exists
        patient_result = await db.execute(
            select(Patient).where(Patient.patient_id == patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Helper function to normalize disease names to base disease
        def normalize_disease_name(disease_name: str) -> Optional[str]:
            """
            Normalize disease name variations to base disease name.
            Maps all variations (e.g., 'Severe Iron Deficiency Anemia', 'Moderate Iron Deficiency Anemia')
            to the base disease name (e.g., 'iron_deficiency_anemia').
            """
            if not disease_name:
                return None
            
            disease_name_lower = disease_name.lower().strip()
            
            # Exclude "Normal" as it's not a disease
            if disease_name_lower == 'normal':
                return None
            
            # Iron Deficiency Anemia variations (check most specific first)
            # Order matters - check longer/more specific variations first
            if any(term in disease_name_lower for term in ['severe iron deficiency anemia', 'moderate iron deficiency anemia', 
                                                           'mild iron deficiency anemia', 'iron deficiency without anemia']):
                return 'iron_deficiency_anemia'
            elif 'iron_deficiency_anemia' in disease_name_lower or 'iron deficiency anemia' in disease_name_lower:
                return 'iron_deficiency_anemia'
            elif disease_name_lower == 'ida':
                return 'iron_deficiency_anemia'
            
            # Diabetes variations (check most specific first)
            if any(term in disease_name_lower for term in ['type 1 diabetes', 'type 2 diabetes', 'type i diabetes', 
                                                             'type ii diabetes', 't1d', 't2d']):
                return 'diabetes'
            elif 'diabetes' in disease_name_lower or 'diabetic' in disease_name_lower:
                return 'diabetes'
            
            # If no mapping found, return original (for other diseases)
            return disease_name
        
        # Helper function to convert relationship path to clear relationship description
        def get_relationship_description(path: List[str]) -> str:
            """Convert relationship path to a clear description of relationship to searched patient"""
            if not path:
                return "self"
            
            # Single step relationships
            if len(path) == 1:
                rel = path[0]
                if rel == "parent":
                    return "parent"
                elif rel == "child":
                    return "child"
                elif rel == "sibling":
                    return "sibling"
                elif rel == "spouse":
                    return "spouse"
                elif rel == "grandparent":
                    return "grandparent"
                elif rel == "grandchild":
                    return "grandchild"
                elif rel == "aunt_uncle":
                    return "aunt/uncle"
                elif rel == "niece_nephew":
                    return "niece/nephew"
                elif rel == "cousin":
                    return "cousin"
            
            # Multi-step relationships - convert to clear description
            # Examples:
            # ["parent", "parent"] -> "grandparent"
            # ["parent", "sibling"] -> "aunt/uncle"
            # ["parent", "sibling", "child"] -> "cousin"
            # ["child", "child"] -> "grandchild"
            # ["sibling", "child"] -> "niece/nephew"
            
            if path == ["parent", "parent"]:
                return "grandparent"
            elif path == ["parent", "parent", "parent"]:
                return "great-grandparent"
            elif path == ["child", "child"]:
                return "grandchild"
            elif path == ["child", "child", "child"]:
                return "great-grandchild"
            elif path == ["parent", "sibling"]:
                return "aunt/uncle"
            elif path == ["parent", "sibling", "child"]:
                return "cousin"
            elif path == ["sibling", "child"]:
                return "niece/nephew"
            elif path == ["child", "sibling"]:
                return "nephew/niece (child's sibling)"
            elif path == ["parent", "parent", "sibling"]:
                return "great-aunt/uncle"
            elif path == ["parent", "parent", "sibling", "child"]:
                return "second cousin"
            elif len(path) == 2 and path[0] == "parent" and path[1] == "child":
                return "sibling (via parent)"
            elif len(path) == 2 and path[0] == "child" and path[1] == "parent":
                return "spouse (via child)"
            
            # Generic description for complex paths
            return " → ".join(path).replace("_", " ").title()
        
        # Recursively collect all blood relatives
        visited: Set[str] = set()  # Use string UUIDs for consistency
        relatives_map = {}  # {patient_id: {patient_info, relationship_path, depth}}
        
        async def traverse_family_tree(current_patient_id: UUID, depth: int, relationship_path: List[str] = None):
            """Recursively traverse family tree to find all blood relatives"""
            # Convert UUID to string safely (handles asyncpg UUID objects)
            # Use repr() or direct attribute access to avoid .replace() calls
            try:
                if isinstance(current_patient_id, UUID):
                    current_patient_id_str = str(current_patient_id)
                else:
                    # For asyncpg UUID, try accessing hex property first
                    if hasattr(current_patient_id, 'hex'):
                        current_patient_id_str = str(UUID(hex=current_patient_id.hex))
                    else:
                        current_patient_id_str = repr(current_patient_id).strip("'\"")
            except (ValueError, TypeError, AttributeError):
                current_patient_id_str = repr(current_patient_id).strip("'\"")
            
            if depth > max_depth or current_patient_id_str in visited:
                return
            
            visited.add(current_patient_id_str)
            
            if relationship_path is None:
                relationship_path = []
            
            # Get all blood relatives of current patient
            relationships_query = select(
                FamilyRelationship,
                Patient.patient_id,
                Patient.first_name,
                Patient.last_name,
                Patient.date_of_birth,
                Patient.gender,
                Patient.cnic
            ).join(
                Patient, FamilyRelationship.relative_patient_id == Patient.patient_id
            ).where(
                and_(
                    FamilyRelationship.patient_id == current_patient_id,
                    FamilyRelationship.is_blood_relative == True  # Only blood relatives
                )
            )
            
            relationships_result = await db.execute(relationships_query)
            relationships_data = relationships_result.all()
            
            # Process each relative
            for rel_data in relationships_data:
                relationship = rel_data[0]
                relative_id_obj = rel_data[1]  # Patient.patient_id
                relative_name = f"{rel_data[2]} {rel_data[3]}"
                
                # Convert UUID to string safely (handles asyncpg UUID objects)
                # Use hex property for asyncpg UUIDs to avoid .replace() calls
                try:
                    if isinstance(relative_id_obj, UUID):
                        relative_id = relative_id_obj
                        relative_id_str = str(relative_id_obj)
                    else:
                        # For asyncpg UUID, access hex property
                        if hasattr(relative_id_obj, 'hex'):
                            relative_id_str = str(UUID(hex=relative_id_obj.hex))
                            relative_id = UUID(hex=relative_id_obj.hex)
                        else:
                            # Fallback: use repr()
                            relative_id_str = repr(relative_id_obj).strip("'\"")
                            relative_id = UUID(relative_id_str)
                except (ValueError, TypeError, AttributeError) as e:
                    # Ultimate fallback
                    relative_id_str = repr(relative_id_obj).strip("'\"")
                    try:
                        relative_id = UUID(relative_id_str)
                    except (ValueError, TypeError):
                        # If all else fails, keep original (shouldn't happen)
                        relative_id = relative_id_obj
                
                # Build relationship path
                current_path = relationship_path + [relationship.relationship_type.value]
                
                # Store relative information (only if not already stored or if this path is shorter)
                if relative_id_str not in relatives_map or relatives_map[relative_id_str]["depth"] > depth:
                    relationship_description = get_relationship_description(current_path)
                    relatives_map[relative_id_str] = {
                        "patient_id": relative_id_str,
                        "name": relative_name,
                        "cnic": rel_data[6],
                        "date_of_birth": rel_data[4].isoformat() if rel_data[4] else None,
                        "gender": rel_data[5],
                        "relationship_path": current_path,  # Keep original path for reference
                        "relationship_to_searched_patient": relationship_description,  # Clear description
                        "depth": depth,
                        "relationship_type": relationship.relationship_type.value  # Direct relationship type
                    }
                
                # Recursively traverse this relative's family (if not visited and within depth limit)
                if relative_id_str not in visited and depth < max_depth:
                    await traverse_family_tree(relative_id, depth + 1, current_path)
        
        # Start recursive traversal
        await traverse_family_tree(patient_id, 0)
        
        # Get all relative IDs (convert string keys back to UUID for queries)
        relative_ids = [UUID(pid) for pid in relatives_map.keys() if pid]
        
        if not relative_ids:
            return {
                "patient_id": str(patient_id),
                "patient_name": f"{patient.first_name} {patient.last_name}",
                "total_blood_relatives": 0,
                "max_depth": max_depth,
                "family_disease_history": []
            }
        
        # Get all diagnoses from Diagnosis table (via visits)
        diagnoses_query = select(
            Diagnosis.disease_name,
            Diagnosis.diagnosis_date,
            Diagnosis.confidence_score,
            Diagnosis.ml_model_used,
            Diagnosis.status,
            Diagnosis.notes,
            Diagnosis.created_at,
            DoctorVisit.patient_id
        ).join(
            DoctorVisit, Diagnosis.visit_id == DoctorVisit.visit_id
        ).where(
            DoctorVisit.patient_id.in_(relative_ids)
        )
        
        diagnoses_result = await db.execute(diagnoses_query)
        diagnoses_data = diagnoses_result.all()
        
        # Get all disease progressions
        progressions_query = select(DiseaseProgression).where(
            DiseaseProgression.patient_id.in_(relative_ids)
        )
        
        progressions_result = await db.execute(progressions_query)
        progressions_data = progressions_result.scalars().all()

        # Get all records from FamilyDiseaseHistory table (directly seeded data)
        family_history_query = select(FamilyDiseaseHistory).where(
            FamilyDiseaseHistory.patient_id.in_(relative_ids)
        )
        family_history_result = await db.execute(family_history_query)
        family_history_data = family_history_result.scalars().all()
        
        # Group diagnoses by patient_id
        diagnoses_by_patient = {}
        for diag in diagnoses_data:
            # Convert UUID to string safely (handles both Python UUID and asyncpg UUID)
            patient_id_obj = diag[7]  # patient_id
            try:
                if isinstance(patient_id_obj, UUID):
                    pid = str(patient_id_obj)
                else:
                    # For asyncpg UUID, access hex property
                    if hasattr(patient_id_obj, 'hex'):
                        pid = str(UUID(hex=patient_id_obj.hex))
                    else:
                        pid = repr(patient_id_obj).strip("'\"")
            except (ValueError, TypeError, AttributeError):
                # Fallback: use repr()
                pid = repr(patient_id_obj).strip("'\"")
            
            if pid not in diagnoses_by_patient:
                diagnoses_by_patient[pid] = []
            diagnoses_by_patient[pid].append({
                "disease_name": diag[0],
                "diagnosis_date": diag[1].isoformat() if diag[1] else None,
                "confidence_score": float(diag[2]) if diag[2] else None,
                "ml_model_used": diag[3],
                "status": diag[4].value if hasattr(diag[4], 'value') else diag[4],
                "notes": diag[5],
                "diagnosed_at": diag[6].isoformat() if diag[6] else None,
                "source": "diagnosis"
            })
        
        # Add disease progressions
        for prog in progressions_data:
            pid = str(prog.patient_id)
            if pid not in diagnoses_by_patient:
                diagnoses_by_patient[pid] = []
            diagnoses_by_patient[pid].append({
                "disease_name": prog.disease_name,
                "progression_stage": prog.progression_stage,
                "assessed_date": prog.assessed_date.isoformat() if prog.assessed_date else None,
                "confidence_score": float(prog.confidence_score) if prog.confidence_score else None,
                "ml_model_used": prog.ml_model_used,
                "notes": prog.notes,
                "source": "progression"
            })

        # Add FamilyDiseaseHistory records
        for fh in family_history_data:
            pid = str(fh.patient_id)
            if pid not in diagnoses_by_patient:
                diagnoses_by_patient[pid] = []
            diagnoses_by_patient[pid].append({
                "disease_name": fh.disease_name,
                "diagnosis_date": fh.diagnosed_at.isoformat() if fh.diagnosed_at else None,
                "severity": fh.severity.value if hasattr(fh.severity, 'value') else fh.severity,
                "notes": fh.notes,
                "source": "family_history"
            })
        
        # Build final response - include ALL relatives (even if no diseases)
        family_disease_history = []
        for relative_id, relative_info in relatives_map.items():
            all_diagnoses = diagnoses_by_patient.get(relative_id, [])  # Empty array if no diseases
            
            # Deduplicate diagnoses: same model + same base disease = same disease (show only once)
            if all_diagnoses:
                # Group diagnoses by normalized base disease name
                disease_groups = {}  # {base_disease_name: [diagnoses]}
                
                for diag in all_diagnoses:
                    normalized = normalize_disease_name(diag["disease_name"])
                    if normalized:  # Filter out "Normal" and None
                        if normalized not in disease_groups:
                            disease_groups[normalized] = []
                        disease_groups[normalized].append(diag)
                
                # For each base disease, keep only ONE representative diagnosis (most recent)
                unique_diagnoses = []
                disease_names = []
                
                for base_disease, diag_list in disease_groups.items():
                    disease_names.append(base_disease)
                    # Sort by diagnosis_date/assessed_date (most recent first) and take the first one
                    def get_sort_date(diag):
                        """Extract date for sorting - handles both string and datetime formats"""
                        date_str = diag.get("diagnosis_date") or diag.get("assessed_date") or ""
                        if isinstance(date_str, str):
                            return date_str
                        return str(date_str) if date_str else ""
                    
                    sorted_diags = sorted(
                        diag_list,
                        key=get_sort_date,
                        reverse=True
                    )
                    if sorted_diags:
                        # Use the most recent diagnosis, but update disease_name to base disease
                        representative_diag = sorted_diags[0].copy()
                        representative_diag["disease_name"] = base_disease  # Use base disease name
                        unique_diagnoses.append(representative_diag)
                
                disease_names = sorted(disease_names) if disease_names else []
            else:
                disease_names = []
                unique_diagnoses = []
            
            family_disease_history.append({
                **relative_info,
                "total_diseases": len(disease_names),
                "disease_names": disease_names if disease_names else [],  # Unique base diseases only
                "diagnoses": unique_diagnoses if unique_diagnoses else []  # One diagnosis per unique base disease
            })
        
        # Sort by depth (closer relatives first)
        family_disease_history.sort(key=lambda x: x["depth"])
        
        response = {
            "patient_id": str(patient_id),
            "patient_name": f"{patient.first_name} {patient.last_name}",
            "total_blood_relatives": len(family_disease_history),
            "max_depth": max_depth,
            "relatives_with_diseases": len([r for r in family_disease_history if r["diagnoses"]]),
            "relatives_without_diseases": len([r for r in family_disease_history if not r["diagnoses"]]),
            "family_tree": family_disease_history  # Complete family tree with disease history
        }
        
        # Apply translation to disease names and notes
        if lang != "en":
            translated_tree = await apply_translation(family_disease_history, "family_disease_history", lang)
            response["family_tree"] = translated_tree
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get family disease history: {str(e)}")

@router.get("/with-family-tree/list")
async def get_patients_with_family_tree(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """Get list of patients who have family relationships"""
    try:
        # Get patients who have at least one family relationship
        query = select(Patient).join(
            FamilyRelationship,
            Patient.patient_id == FamilyRelationship.patient_id
        ).distinct().offset(skip).limit(limit)
        
        result = await db.execute(query)
        patients = result.scalars().all()
        
        # Get counts for each patient
        patients_with_counts = []
        for patient in patients:
            # Count family relationships
            rel_count_query = select(func.count(FamilyRelationship.id)).where(
                FamilyRelationship.patient_id == patient.patient_id
            )
            rel_count_result = await db.execute(rel_count_query)
            relationship_count = rel_count_result.scalar()
            
            # Count family disease history
            disease_count_query = select(func.count(FamilyDiseaseHistory.id)).where(
                FamilyDiseaseHistory.patient_id == patient.patient_id
            )
            disease_count_result = await db.execute(disease_count_query)
            disease_count = disease_count_result.scalar()
            
            patients_with_counts.append({
                "patient_id": str(patient.patient_id),
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "cnic": patient.cnic,
                "family_relationships_count": relationship_count,
                "family_disease_history_count": disease_count
            })
        
        return {
            "total": len(patients_with_counts),
            "patients": patients_with_counts
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get patients with family tree: {str(e)}")
