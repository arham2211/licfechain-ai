"""
Parathyroid Disorder synthetic data generation for LifeChain AI.
Creates realistic sample records for diagnosis and progression training.
"""

import argparse
import json
import random
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, List

from faker import Faker

fake = Faker()


def load_names_from_json(file_path: str) -> List[Dict[str, str]]:
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def generate_cnic() -> str:
    area_code = random.choice(["42101", "42102", "42103", "42104", "42105"])
    return f"{area_code}-{random.randint(1000000, 9999999)}-{random.randint(0, 9)}"


def generate_phone() -> str:
    return f"03{random.randint(0, 9)}{random.randint(10000000, 99999999)}"


def determine_parathyroid_diagnosis(pth: float, calcium: float, phosphorus: float, vitamin_d: float, egfr: float) -> str:
    if pth > 65 and calcium > 10.2:
        return "Primary Hyperparathyroidism"
    if pth > 65 and calcium <= 10.2 and (vitamin_d < 30 or egfr < 60):
        return "Secondary Hyperparathyroidism"
    if pth < 15 and calcium < 8.5:
        return "Hypoparathyroidism"
    if 15 <= pth <= 65 and 8.5 <= calcium <= 10.2 and 2.5 <= phosphorus <= 4.5:
        return "Normal Parathyroid Function"
    return "Indeterminate Parathyroid Pattern"


def generate_patient_lab_snapshot(outcome: str) -> Dict[str, float]:
    # Baseline ranges
    pth = random.uniform(10, 65)
    calcium = random.uniform(8.6, 10.1)
    phosphorus = random.uniform(2.6, 4.4)
    vitamin_d = random.uniform(30, 70)
    creatinine = random.uniform(0.6, 1.3)
    egfr = random.uniform(70, 120)
    alp = random.uniform(44, 147)
    albumin = random.uniform(3.5, 5.0)

    if outcome == "Primary Hyperparathyroidism":
        pth = random.uniform(75, 200)
        calcium = random.uniform(10.3, 12.1)
        phosphorus = random.uniform(2.0, 3.2)
    elif outcome == "Secondary Hyperparathyroidism":
        pth = random.uniform(80, 450)
        calcium = random.uniform(7.8, 10.1)
        phosphorus = random.uniform(3.5, 6.5)
        vitamin_d = random.uniform(8, 29)
        if random.random() < 0.6:
            egfr = random.uniform(10, 59)
            creatinine = random.uniform(1.1, 4.2)
    elif outcome == "Hypoparathyroidism":
        pth = random.uniform(2, 14.5)
        calcium = random.uniform(6.8, 8.4)
        phosphorus = random.uniform(4.6, 7.2)
    elif outcome == "Indeterminate Parathyroid Pattern":
        pth = random.uniform(12, 110)
        calcium = random.uniform(7.2, 11.4)
        phosphorus = random.uniform(2.1, 6.0)
        vitamin_d = random.uniform(12, 45)

    return {
        "pth": round(pth, 2),
        "calcium": round(calcium, 2),
        "phosphorus": round(phosphorus, 2),
        "vitamin_d": round(vitamin_d, 2),
        "creatinine": round(creatinine, 2),
        "egfr": round(egfr, 2),
        "alkaline_phosphatase": round(alp, 2),
        "albumin": round(albumin, 2),
    }


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def apply_progression_step(prev: Dict[str, float], progression: str) -> Dict[str, float]:
    """
    Advance labs one visit forward with a strong progression signal.
    Strong signal makes progression labels learnable by sequence models.
    """
    cur = dict(prev)

    # deterministic drift + small random variation
    if progression == "Improving":
        cur["pth"] *= random.uniform(0.92, 0.97)
        cur["calcium"] += (9.25 - cur["calcium"]) * random.uniform(0.10, 0.22)
        cur["phosphorus"] += (3.4 - cur["phosphorus"]) * random.uniform(0.10, 0.20)
        cur["vitamin_d"] += random.uniform(1.0, 3.0)
        cur["egfr"] *= random.uniform(1.01, 1.04)
        cur["creatinine"] *= random.uniform(0.97, 0.995)
    elif progression == "Worsening":
        cur["pth"] *= random.uniform(1.04, 1.10)
        cur["calcium"] += random.uniform(0.03, 0.12)
        cur["phosphorus"] += random.uniform(0.05, 0.16)
        cur["vitamin_d"] *= random.uniform(0.96, 0.995)
        cur["egfr"] *= random.uniform(0.95, 0.99)
        cur["creatinine"] *= random.uniform(1.01, 1.06)
    else:  # Stable
        cur["pth"] *= random.uniform(0.985, 1.015)
        cur["calcium"] *= random.uniform(0.992, 1.008)
        cur["phosphorus"] *= random.uniform(0.99, 1.01)
        cur["vitamin_d"] *= random.uniform(0.99, 1.01)
        cur["egfr"] *= random.uniform(0.99, 1.01)
        cur["creatinine"] *= random.uniform(0.99, 1.01)

    # light noise for realism
    noise_scale = {
        "pth": 0.015,
        "calcium": 0.01,
        "phosphorus": 0.015,
        "vitamin_d": 0.02,
        "creatinine": 0.01,
        "egfr": 0.015,
        "alkaline_phosphatase": 0.02,
        "albumin": 0.01,
    }
    for k in cur:
        cur[k] += random.uniform(-1.0, 1.0) * noise_scale.get(k, 0.01) * max(cur[k], 1.0)

    # clamp to physiologic ranges
    cur["pth"] = _clamp(cur["pth"], 2.0, 700.0)
    cur["calcium"] = _clamp(cur["calcium"], 6.5, 12.8)
    cur["phosphorus"] = _clamp(cur["phosphorus"], 1.5, 8.5)
    cur["vitamin_d"] = _clamp(cur["vitamin_d"], 5.0, 120.0)
    cur["creatinine"] = _clamp(cur["creatinine"], 0.3, 8.0)
    cur["egfr"] = _clamp(cur["egfr"], 5.0, 130.0)
    cur["alkaline_phosphatase"] = _clamp(cur["alkaline_phosphatase"], 20.0, 450.0)
    cur["albumin"] = _clamp(cur["albumin"], 2.0, 5.5)

    for k in cur:
        cur[k] = round(float(cur[k]), 2)
    return cur


def generate_data(names_list: List[Dict[str, str]], num_patients: int = 1500) -> Dict[str, Any]:
    patients_data: List[Dict[str, Any]] = []
    doctors_data: List[Dict[str, Any]] = []
    labs_data: List[Dict[str, Any]] = []
    family_relationships_data: List[Dict[str, Any]] = []
    family_disease_history_data: List[Dict[str, Any]] = []
    doctor_visits_data: List[Dict[str, Any]] = []
    symptoms_data: List[Dict[str, Any]] = []
    diagnoses_data: List[Dict[str, Any]] = []
    prescriptions_data: List[Dict[str, Any]] = []
    lab_reports_data: List[Dict[str, Any]] = []
    lab_test_results_data: List[Dict[str, Any]] = []
    disease_progressions_data: List[Dict[str, Any]] = []

    # doctors as patient records
    for _ in range(8):
        doctor_id = str(uuid.uuid4())
        first_name = fake.first_name()
        last_name = fake.last_name()
        doctor = {
            "patient_id": doctor_id,
            "cnic": generate_cnic(),
            "first_name": first_name,
            "last_name": last_name,
            "date_of_birth": fake.date_of_birth(minimum_age=30, maximum_age=65),
            "gender": random.choice(["male", "female"]),
            "blood_group": random.choice(["A+", "B+", "AB+", "O+", "A-", "B-", "AB-", "O-"]),
            "phone": generate_phone(),
            "email": fake.email(),
            "address": fake.address(),
            "created_at": fake.date_time_between(start_date="-2y", end_date="now"),
            "updated_at": fake.date_time_between(start_date="-1y", end_date="now"),
            "is_doctor": True,
            "specialization": random.choice(["Endocrinologist", "Nephrologist", "Internal Medicine"]),
            "license_number": f"PMDC-{random.randint(10000, 99999)}",
            "hospital_affiliation": fake.company(),
        }
        patients_data.append(doctor)
        doctors_data.append(
            {
                "doctor_id": doctor_id,
                "patient_id": doctor_id,
                "name": f"{first_name} {last_name}",
                "specialization": doctor["specialization"],
                "license_number": doctor["license_number"],
                "phone": doctor["phone"],
                "email": doctor["email"],
                "hospital_affiliation": doctor["hospital_affiliation"],
                "created_at": doctor["created_at"],
                "updated_at": doctor["updated_at"],
            }
        )

    for _ in range(4):
        labs_data.append(
            {
                "lab_id": str(uuid.uuid4()),
                "lab_name": random.choice(["Chughtai Lab", "Agha Khan Lab", "Dow Lab", "Shaukat Khanum Lab"]),
                "lab_location": f"{fake.city()}, Pakistan",
                "accreditation_number": f"PAL-{random.randint(1000, 9999)}",
                "phone": generate_phone(),
                "email": fake.email(),
                "created_at": fake.date_time_between(start_date="-2y", end_date="now"),
            }
        )

    progression_outcomes = ["Improving", "Stable", "Worsening"]
    diagnosis_outcomes = [
        "Normal Parathyroid Function",
        "Primary Hyperparathyroidism",
        "Secondary Hyperparathyroidism",
        "Hypoparathyroidism",
        "Indeterminate Parathyroid Pattern",
    ]

    for i in range(min(num_patients, len(names_list))):
        person = names_list[i]
        patient_id = str(uuid.uuid4())
        created_at = fake.date_time_between(start_date="-2y", end_date="-6m")

        patient = {
            "patient_id": patient_id,
            "cnic": generate_cnic(),
            "first_name": person["first_name"],
            "last_name": person["last_name"],
            "date_of_birth": fake.date_of_birth(minimum_age=18, maximum_age=85),
            "gender": person["gender"].lower(),
            "blood_group": random.choice(["A+", "B+", "AB+", "O+", "A-", "B-", "AB-", "O-"]),
            "phone": generate_phone(),
            "email": fake.email(),
            "address": fake.address(),
            "created_at": created_at,
            "updated_at": created_at + timedelta(days=random.randint(1, 100)),
        }
        patients_data.append(patient)

        # optional family linkage
        if i > 0 and random.random() < 0.2:
            relative = random.choice(patients_data[:-1])
            family_relationships_data.append(
                {
                    "id": str(uuid.uuid4()),
                    "patient_id": patient_id,
                    "relative_patient_id": relative["patient_id"],
                    "relationship_type": random.choice(["parent", "sibling", "cousin", "spouse"]),
                    "is_blood_relative": random.random() < 0.8,
                    "created_at": created_at,
                }
            )

        if random.random() < 0.28:
            family_disease_history_data.append(
                {
                    "id": str(uuid.uuid4()),
                    "patient_id": patient_id,
                    "disease_name": random.choice(["Parathyroid Disorder", "Kidney Disease", "Thyroid Disorder"]),
                    "diagnosed_at": fake.date_between(start_date="-12y", end_date="-1y"),
                    "severity": random.choice(["mild", "moderate", "severe"]),
                    "notes": fake.sentence(nb_words=12),
                    "created_at": created_at,
                }
            )

        # Balanced labels help progression model avoid majority-class collapse
        final_progression = random.choice(progression_outcomes)
        visits_count = random.randint(6, 14)
        final_dx_target = random.choices(diagnosis_outcomes, weights=[0.28, 0.2, 0.28, 0.12, 0.12])[0]

        base = generate_patient_lab_snapshot(final_dx_target)
        visit_start = fake.date_time_between(start_date="-2y", end_date="-8m")
        visit_dates = [visit_start + timedelta(days=35 * v) for v in range(visits_count)]
        current = dict(base)

        for idx, visit_date in enumerate(visit_dates):
            visit_id = str(uuid.uuid4())
            doctor = random.choice(doctors_data)

            if idx > 0:
                current = apply_progression_step(current, final_progression)

            diagnosis_name = determine_parathyroid_diagnosis(
                current["pth"], current["calcium"], current["phosphorus"], current["vitamin_d"], current["egfr"]
            )

            doctor_visits_data.append(
                {
                    "visit_id": visit_id,
                    "patient_id": patient_id,
                    "doctor_patient_id": doctor["doctor_id"],
                    "visit_date": visit_date,
                    "chief_complaint": random.choice(
                        [
                            "Fatigue and bone pain",
                            "Muscle cramps and tingling",
                            "Routine endocrine follow-up",
                            "Kidney stone workup follow-up",
                            "Weakness and mood changes",
                        ]
                    ),
                    "visit_type": random.choice(["consultation", "follow_up", "routine_checkup", "lab_review"]),
                    "doctor_notes": "Parathyroid panel reviewed. Continue monitoring trend and correlate clinically.",
                    "created_at": visit_date,
                    "updated_at": visit_date,
                }
            )

            if random.random() < 0.75:
                symptoms_data.append(
                    {
                        "id": str(uuid.uuid4()),
                        "visit_id": visit_id,
                        "symptom_name": random.choice(
                            ["Fatigue", "Bone pain", "Muscle weakness", "Constipation", "Polyuria", "Depressed mood"]
                        ),
                        "severity": random.randint(2, 8),
                        "duration_days": random.randint(3, 90),
                        "notes": fake.sentence(nb_words=10),
                    }
                )

            diagnoses_data.append(
                {
                    "diagnosis_id": str(uuid.uuid4()),
                    "visit_id": visit_id,
                    "disease_name": diagnosis_name,
                    "diagnosis_date": visit_date,
                    "confidence_score": round(random.uniform(0.72, 0.99), 4),
                    "ml_model_used": "xgb_parathyroid_v1",
                    "status": "confirmed",
                    "notes": "Synthetic diagnosis generated for model training.",
                    "created_at": visit_date,
                }
            )

            if random.random() < 0.65:
                med = random.choice(
                    ["Cinacalcet", "Calcitriol", "Cholecalciferol", "Calcium Carbonate", "Sevelamer", "Hydration Plan"]
                )
                prescriptions_data.append(
                    {
                        "prescription_id": str(uuid.uuid4()),
                        "visit_id": visit_id,
                        "medication_name": med,
                        "dosage": random.choice(["25mg", "0.25mcg", "1000 IU", "500mg"]),
                        "frequency": random.choice(["Once daily", "Twice daily", "Three times daily"]),
                        "duration_days": random.randint(30, 120),
                        "instructions": "Follow endocrinology guidance and repeat labs in 4-8 weeks.",
                        "created_at": visit_date,
                    }
                )

            report_id = str(uuid.uuid4())
            lab = random.choice(labs_data)
            report_date = visit_date + timedelta(days=random.randint(0, 3))
            lab_reports_data.append(
                {
                    "report_id": report_id,
                    "patient_id": patient_id,
                    "lab_id": lab["lab_id"],
                    "visit_id": visit_id,
                    "report_date": report_date,
                    "report_type": "parathyroid_panel",
                    "status": "completed",
                    "pdf_url": f"https://lab-reports.example/parathyroid/{report_id}.pdf",
                    "created_at": report_date,
                    "updated_at": report_date,
                }
            )

            ref = {
                "pth": (15, 65, "pg/mL"),
                "calcium": (8.5, 10.2, "mg/dL"),
                "phosphorus": (2.5, 4.5, "mg/dL"),
                "vitamin_d": (30, 100, "ng/mL"),
                "creatinine": (0.6, 1.3, "mg/dL"),
                "egfr": (60, 120, "mL/min/1.73m2"),
                "alkaline_phosphatase": (44, 147, "U/L"),
                "albumin": (3.5, 5.0, "g/dL"),
            }

            for test_name, value in current.items():
                low, high, unit = ref[test_name]
                lab_test_results_data.append(
                    {
                        "result_id": str(uuid.uuid4()),
                        "report_id": report_id,
                        "test_name": test_name,
                        "test_value": float(value),
                        "unit": unit,
                        "reference_range_min": float(low),
                        "reference_range_max": float(high),
                        "is_abnormal": bool(value < low or value > high),
                        "created_at": report_date,
                    }
                )

            if idx == visits_count - 1:
                disease_progressions_data.append(
                    {
                        "progression_id": str(uuid.uuid4()),
                        "patient_id": patient_id,
                        "disease_name": "parathyroid_disorder",
                        "progression_stage": final_progression,
                        "assessed_date": report_date,
                        "ml_model_used": "lstm_parathyroid_progression_v1",
                        "confidence_score": round(random.uniform(0.72, 0.98), 4),
                        "notes": f"Final synthetic progression label: {final_progression}",
                        "created_at": report_date,
                    }
                )

    return {
        "patients": patients_data,
        "doctors": doctors_data,
        "labs": labs_data,
        "family_relationships": family_relationships_data,
        "family_disease_history": family_disease_history_data,
        "doctor_visits": doctor_visits_data,
        "symptoms": symptoms_data,
        "diagnoses": diagnoses_data,
        "prescriptions": prescriptions_data,
        "lab_reports": lab_reports_data,
        "lab_test_results": lab_test_results_data,
        "disease_progressions": disease_progressions_data,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Parathyroid dataset")
    parser.add_argument("--num-patients", type=int, default=1500, help="Number of patient profiles to generate")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    names_file = script_dir / "names.json"
    names_list = load_names_from_json(str(names_file))
    data = generate_data(names_list, num_patients=args.num_patients)

    file_mappings = {
        "patients": "generated_parathyroid_patients.json",
        "doctors": "generated_parathyroid_doctors.json",
        "labs": "generated_parathyroid_labs.json",
        "family_relationships": "generated_parathyroid_family_relationships.json",
        "family_disease_history": "generated_parathyroid_family_disease_history.json",
        "doctor_visits": "generated_parathyroid_doctor_visits.json",
        "symptoms": "generated_parathyroid_symptoms.json",
        "diagnoses": "generated_parathyroid_diagnoses.json",
        "prescriptions": "generated_parathyroid_prescriptions.json",
        "lab_reports": "generated_parathyroid_lab_reports.json",
        "lab_test_results": "generated_parathyroid_lab_test_results.json",
        "disease_progressions": "generated_parathyroid_disease_progressions.json",
    }

    print(f"Saving generated Parathyroid files to {script_dir} ...")
    for key, filename in file_mappings.items():
        out_path = script_dir / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data[key], f, indent=2, default=str, ensure_ascii=False)
        print(f"  [OK] {filename}: {len(data[key])}")

    print("Parathyroid synthetic data generation complete.")


if __name__ == "__main__":
    main()
