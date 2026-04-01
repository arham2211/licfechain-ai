"""
Database seeding script for synthetic Parathyroid Disorder data.
"""

import argparse
import asyncio
import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Add project root to Python path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import get_settings
from app.models import (  # noqa: E402
    Diagnosis,
    DiseaseProgression,
    DoctorVisit,
    FamilyDiseaseHistory,
    FamilyRelationship,
    Lab,
    LabReport,
    LabTestResult,
    Patient,
    Prescription,
    Symptom,
)
from app.models.patient import GenderEnum  # noqa: E402


def convert_timestamps(data: Dict[str, Any]) -> Dict[str, Any]:
    timestamp_fields = {
        "created_at",
        "updated_at",
        "visit_date",
        "diagnosis_date",
        "report_date",
        "assessed_date",
        "diagnosed_at",
    }
    for field in timestamp_fields:
        if field in data and isinstance(data[field], str):
            try:
                if "T" in data[field]:
                    data[field] = datetime.fromisoformat(data[field].replace("Z", "+00:00"))
                else:
                    data[field] = datetime.fromisoformat(data[field])
            except ValueError:
                pass

    if "date_of_birth" in data and isinstance(data["date_of_birth"], str):
        try:
            data["date_of_birth"] = date.fromisoformat(data["date_of_birth"])
        except ValueError:
            pass

    return data


async def seed_parathyroid_database() -> None:
    settings = get_settings()
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=True,
        connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
    )
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    script_dir = Path(__file__).resolve().parent
    data_files = [
        "generated_parathyroid_patients.json",
        "generated_parathyroid_doctors.json",
        "generated_parathyroid_labs.json",
        "generated_parathyroid_family_relationships.json",
        "generated_parathyroid_family_disease_history.json",
        "generated_parathyroid_doctor_visits.json",
        "generated_parathyroid_symptoms.json",
        "generated_parathyroid_diagnoses.json",
        "generated_parathyroid_prescriptions.json",
        "generated_parathyroid_lab_reports.json",
        "generated_parathyroid_lab_test_results.json",
        "generated_parathyroid_disease_progressions.json",
    ]

    try:
        async with async_session() as session:
            print("\n" + "=" * 60)
            print("SEEDING PARATHYROID DISORDER DATA")
            print("=" * 60)

            data: Dict[str, Any] = {}
            for file_name in data_files:
                file_path = script_dir / file_name
                if not file_path.exists():
                    print(f"⚠️  Missing {file_name}, skipping")
                    continue
                with open(file_path, "r", encoding="utf-8") as f:
                    table_name = file_name.replace("generated_parathyroid_", "").replace(".json", "")
                    data[table_name] = json.load(f)
                    print(f"✅ Loaded {len(data[table_name])} from {file_name}")

            if "doctors" in data:
                print("\n⚠️  Doctors data generated as patient records; skipping separate doctors table.")

            if "labs" in data:
                print("\n🔬 Seeding labs...")
                for row in data["labs"]:
                    session.add(Lab(**convert_timestamps(row)))
                await session.commit()
                print(f"✅ Seeded {len(data['labs'])} labs")

            if "patients" in data:
                print("\n👥 Seeding patients...")
                batch_size = 200
                for i in range(0, len(data["patients"]), batch_size):
                    batch = data["patients"][i:i + batch_size]
                    for row in batch:
                        row = convert_timestamps(row)
                        if isinstance(row.get("gender"), str):
                            try:
                                row["gender"] = GenderEnum(row["gender"].lower())
                            except ValueError:
                                row["gender"] = GenderEnum.OTHER
                        session.add(Patient(**row))
                    await session.commit()
                    print(f"   Seeded {min(i + batch_size, len(data['patients']))}/{len(data['patients'])}")
                print(f"✅ Seeded {len(data['patients'])} patients")

            if "family_relationships" in data:
                print("\n👨‍👩‍👧‍👦 Seeding family relationships...")
                for row in data["family_relationships"]:
                    session.add(FamilyRelationship(**convert_timestamps(row)))
                await session.commit()
                print(f"✅ Seeded {len(data['family_relationships'])} relationships")

            if "family_disease_history" in data:
                print("\n🧬 Seeding family disease history...")
                for row in data["family_disease_history"]:
                    session.add(FamilyDiseaseHistory(**convert_timestamps(row)))
                await session.commit()
                print(f"✅ Seeded {len(data['family_disease_history'])} family disease rows")

            if "doctor_visits" in data:
                print("\n📋 Seeding visits...")
                batch_size = 1000
                for i in range(0, len(data["doctor_visits"]), batch_size):
                    batch = data["doctor_visits"][i:i + batch_size]
                    for row in batch:
                        session.add(DoctorVisit(**convert_timestamps(row)))
                    await session.commit()
                    print(f"   Seeded {min(i + batch_size, len(data['doctor_visits']))}/{len(data['doctor_visits'])}")
                print(f"✅ Seeded {len(data['doctor_visits'])} visits")

            if "symptoms" in data:
                print("\n🤒 Seeding symptoms...")
                batch_size = 2000
                for i in range(0, len(data["symptoms"]), batch_size):
                    batch = data["symptoms"][i:i + batch_size]
                    for row in batch:
                        session.add(Symptom(**convert_timestamps(row)))
                    await session.commit()
                    print(f"   Seeded {min(i + batch_size, len(data['symptoms']))}/{len(data['symptoms'])}")
                print(f"✅ Seeded {len(data['symptoms'])} symptoms")

            if "diagnoses" in data:
                print("\n🩺 Seeding diagnoses...")
                batch_size = 1000
                for i in range(0, len(data["diagnoses"]), batch_size):
                    batch = data["diagnoses"][i:i + batch_size]
                    for row in batch:
                        session.add(Diagnosis(**convert_timestamps(row)))
                    await session.commit()
                    print(f"   Seeded {min(i + batch_size, len(data['diagnoses']))}/{len(data['diagnoses'])}")
                print(f"✅ Seeded {len(data['diagnoses'])} diagnoses")

            if "prescriptions" in data:
                print("\n💊 Seeding prescriptions...")
                batch_size = 1000
                for i in range(0, len(data["prescriptions"]), batch_size):
                    batch = data["prescriptions"][i:i + batch_size]
                    for row in batch:
                        session.add(Prescription(**convert_timestamps(row)))
                    await session.commit()
                    print(f"   Seeded {min(i + batch_size, len(data['prescriptions']))}/{len(data['prescriptions'])}")
                print(f"✅ Seeded {len(data['prescriptions'])} prescriptions")

            if "lab_reports" in data:
                print("\n📊 Seeding lab reports...")
                batch_size = 1000
                for i in range(0, len(data["lab_reports"]), batch_size):
                    batch = data["lab_reports"][i:i + batch_size]
                    for row in batch:
                        session.add(LabReport(**convert_timestamps(row)))
                    await session.commit()
                    print(f"   Seeded {min(i + batch_size, len(data['lab_reports']))}/{len(data['lab_reports'])}")
                print(f"✅ Seeded {len(data['lab_reports'])} reports")

            if "lab_test_results" in data:
                print("\n🧪 Seeding lab test results...")
                batch_size = 5000
                for i in range(0, len(data["lab_test_results"]), batch_size):
                    batch = data["lab_test_results"][i:i + batch_size]
                    for row in batch:
                        session.add(LabTestResult(**convert_timestamps(row)))
                    await session.commit()
                    print(f"   Seeded {min(i + batch_size, len(data['lab_test_results']))}/{len(data['lab_test_results'])}")
                print(f"✅ Seeded {len(data['lab_test_results'])} test results")

            if "disease_progressions" in data:
                print("\n📈 Seeding disease progressions...")
                for row in data["disease_progressions"]:
                    session.add(DiseaseProgression(**convert_timestamps(row)))
                await session.commit()
                print(f"✅ Seeded {len(data['disease_progressions'])} progressions")

            print("\n✅ PARATHYROID DATABASE SEEDING COMPLETED")

    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed database with Parathyroid synthetic data")
    parser.add_argument("--seed", action="store_true", help="Seed database")
    args = parser.parse_args()
    if args.seed:
        asyncio.run(seed_parathyroid_database())
    else:
        print("Use --seed")
