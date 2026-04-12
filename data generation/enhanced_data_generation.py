"""
Enhanced Data Generation for LifeChain AI Healthcare System
Preserves existing diabetes functionality while adding system-specific variables
"""

import json
import random
import uuid
import time
from datetime import datetime, timedelta, date
from typing import List, Dict, Any
import pandas as pd
import numpy as np
from faker import Faker

# Gemini AI integration
import os
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

# Read Google API key from environment (do not hardcode secrets in source)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY is not set. Export it in your shell or .env before running this script.")

# Initialize Gemini model
llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro", google_api_key=GOOGLE_API_KEY)

# Initialize Faker for realistic data
fake = Faker()

# Load names from JSON file
def load_names_from_json(file_path: str) -> List[Dict[str, str]]:
    """Load names from names.json file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

# Gemini-powered text generation
def generate_doctor_notes(patient_name: str, diagnosis: str, symptoms: List[str]) -> str:
    """Generate realistic doctor notes using Gemini"""
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a medical professional writing clinical notes. Write concise, professional medical notes."),
        ("human", f"Patient: {patient_name}\nDiagnosis: {diagnosis}\nSymptoms: {', '.join(symptoms)}\n\nWrite a brief clinical note (2-3 sentences):")
    ])
    chain = prompt | llm
    response = chain.invoke({"context": "", "message": ""})
    return response.content

def generate_prescription_instructions(medication: str, condition: str) -> str:
    """Generate prescription instructions using Gemini"""
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a pharmacist providing medication instructions. Be clear and concise."),
        ("human", f"Medication: {medication}\nCondition: {condition}\n\nProvide brief instructions (1-2 sentences):")
    ])
    chain = prompt | llm
    response = chain.invoke({"context": "", "message": ""})
    return response.content

def generate_chief_complaint(has_diabetes: bool, age: int) -> str:
    """Generate realistic chief complaints based on condition and age"""
    if has_diabetes:
        complaints = [
            "Increased thirst and frequent urination",
            "Fatigue and blurred vision",
            "Slow healing of cuts and wounds",
            "Unexplained weight loss",
            "Numbness in hands and feet"
        ]
    else:
        if age < 30:
            complaints = [
                "Routine checkup",
                "General fatigue",
                "Minor headache",
                "Seasonal allergies"
            ]
        elif age < 50:
            complaints = [
                "Routine checkup",
                "Stress and anxiety",
                "Back pain",
                "Sleep issues"
            ]
        else:
            complaints = [
                "Routine checkup",
                "Joint pain",
                "Blood pressure concerns",
                "Memory issues"
            ]
    return random.choice(complaints)

# CNIC generation (Pakistani format)
def generate_cnic() -> str:
    """Generate valid Pakistani CNIC format: 42101-5819341-7"""
    area_code = random.choice(["42101", "42102", "42103", "42104", "42105"])
    middle_part = f"{random.randint(1000000, 9999999)}"
    last_digit = str(random.randint(0, 9))
    return f"{area_code}-{middle_part}-{last_digit}"

# Blood group generation
def generate_blood_group() -> str:
    """Generate blood group with realistic distribution"""
    blood_groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
    weights = [0.25, 0.05, 0.20, 0.04, 0.08, 0.02, 0.30, 0.06]  # Realistic distribution
    return random.choices(blood_groups, weights=weights)[0]

# Pakistani phone number generation
def generate_phone() -> str:
    """Generate Pakistani phone number"""
    prefixes = ["0300", "0301", "0302", "0303", "0304", "0305", "0306", "0307", "0308", "0309",
                "0310", "0311", "0312", "0313", "0314", "0315", "0316", "0317", "0318", "0319",
                "0320", "0321", "0322", "0323", "0324", "0325", "0326", "0327", "0328", "0329",
                "0330", "0331", "0332", "0333", "0334", "0335", "0336", "0337", "0338", "0339",
                "0340", "0341", "0342", "0343", "0344", "0345", "0346", "0347", "0348", "0349",
                "0350", "0351", "0352", "0353", "0354", "0355", "0356", "0357", "0358", "0359"]
    prefix = random.choice(prefixes)
    number = f"{random.randint(1000000, 9999999)}"
    return f"{prefix}{number}"

# Lab names (Pakistani labs)
LAB_NAMES = [
    "Chughtai Lab", "Shaukat Khanum Lab", "Agha Khan Lab", "Dow Lab", "Jinnah Lab",
    "Services Lab", "Al-Shifa Lab", "Medicare Lab", "Pathology Lab", "Diagnostic Lab"
]

# Doctor specializations
DOCTOR_SPECIALIZATIONS = [
    "Endocrinologist", "General Physician", "Internal Medicine", "Cardiologist",
    "Nephrologist", "Ophthalmologist", "Neurologist", "Family Medicine"
]

# Medication names for diabetes
DIABETES_MEDICATIONS = [
    "Metformin", "Glipizide", "Glibenclamide", "Insulin Glargine", "Insulin Lispro",
    "Sitagliptin", "Empagliflozin", "Dapagliflozin", "Pioglitazone", "Repaglinide"
]

# Common symptoms
DIABETES_SYMPTOMS = [
    "Increased thirst", "Frequent urination", "Fatigue", "Blurred vision",
    "Slow healing", "Unexplained weight loss", "Numbness in extremities"
]

def generate_enhanced_data(names_list: List[Dict[str, str]], num_patients: int = None) -> Dict[str, Any]:
    """
    Generate comprehensive healthcare data including all system variables
    while preserving existing diabetes functionality
    """
    if num_patients is None:
        num_patients = len(names_list)  # Use ALL names from JSON file
    
    print(f"Generating enhanced data for {num_patients} patients...")
    
    # Original diabetes ranges (preserved exactly)
    diabetes_ranges = {
        "fasting_glucose": (60, 200), "random_glucose": (80, 300), "postprandial_glucose": (90, 350),
        "hba1c": (4.0, 14.0), "hdl": (20, 80), "ldl": (50, 220), "triglycerides": (50, 400),
        "total_cholesterol": (100, 320), "creatinine": (0.4, 2.0), "urea": (10, 70),
        "microalbumin": (0, 350), "alt": (7, 80), "ast": (7, 80), "insulin": (1, 30),
        "bmi": (16, 45), "systolic_bp": (90, 200), "diastolic_bp": (50, 120)
    }

    def generate_trend_v2(base_value, visits, feature_name, direction, rate):
        """Original trend generation function (preserved)"""
        values = [base_value]
        for _ in range(1, visits):
            noise = random.gauss(0, 0.05 * base_value)
            change = (base_value * 0.05 * rate) + noise
            if direction == 'improving': base_value -= change
            elif direction == 'worsening': base_value += change
            else: base_value += random.choice([-1, 1]) * noise
            min_val, max_val = diabetes_ranges[feature_name]
            base_value = max(min_val, min(max_val, base_value))
            values.append(round(base_value, 2))
        return values
        
    def determine_diagnosis_realistic(hba1c, f_glucose, bmi):
        """Original diagnosis function (preserved)"""
        hba1c_pre, hba1c_dia = random.gauss(5.7, 0.2), random.gauss(6.5, 0.3)
        fg_pre, fg_dia = random.gauss(100, 5), random.gauss(126, 10)
        score = 0
        if hba1c > hba1c_dia or f_glucose > fg_dia: score += 2
        elif hba1c > hba1c_pre or f_glucose > fg_pre: score += 1
        if bmi > 30: score += 0.5
        if bmi > 35: score += 0.5
        if score >= 2.0: return "Diabetes"
        elif score >= 1.0: return "Prediabetes"
        else: return "Normal"

    # Initialize data containers
    patients_data = []
    doctors_data = []
    labs_data = []
    family_relationships_data = []
    family_disease_history_data = []
    doctor_visits_data = []
    symptoms_data = []
    diagnoses_data = []
    prescriptions_data = []
    lab_reports_data = []
    lab_test_results_data = []
    disease_progressions_data = []
    
    # Generate doctors as patients (5-10 doctors)
    # Doctors must be created as patients first with all patient fields
    num_doctors = random.randint(5, 10)
    doctor_patient_ids = []
    for i in range(num_doctors):
        doctor_patient_id = str(uuid.uuid4())
        doctor_patient_ids.append(doctor_patient_id)
        
        # Calculate age and birth date for doctor
        age = random.randint(30, 65)  # Doctors are typically 30-65 years old
        birth_date = fake.date_of_birth(minimum_age=age, maximum_age=age)
        
        # Split fake name into first and last name
        full_name = fake.name().split()
        first_name = full_name[0] if len(full_name) > 0 else "Dr."
        last_name = " ".join(full_name[1:]) if len(full_name) > 1 else fake.last_name()
        
        # Create doctor as a patient with doctor-specific fields
        doctor_patient = {
            "patient_id": doctor_patient_id,
            "cnic": generate_cnic(),
            "first_name": first_name,
            "last_name": last_name,
            "date_of_birth": birth_date,
            "gender": random.choice(["male", "female"]),
            "blood_group": generate_blood_group(),
            "phone": generate_phone(),
            "email": fake.email(),
            "address": fake.address(),
            "created_at": fake.date_time_between(start_date='-2y', end_date='now'),
            "updated_at": fake.date_time_between(start_date='-1y', end_date='now'),
            # Doctor-specific fields
            "is_doctor": True,
            "specialization": random.choice(DOCTOR_SPECIALIZATIONS),
            "license_number": f"PMDC-{random.randint(10000, 99999)}",
            "hospital_affiliation": fake.company()
        }
        # Add to patients_data (doctors are patients)
        patients_data.append(doctor_patient)
        
        # Also keep in doctors_data for backward compatibility in visit generation
        doctors_data.append({
            "doctor_id": doctor_patient_id,  # Use patient_id as doctor_id
            "patient_id": doctor_patient_id,
            "name": f"{first_name} {last_name}",
            "specialization": doctor_patient["specialization"],
            "license_number": doctor_patient["license_number"],
            "phone": doctor_patient["phone"],
            "email": doctor_patient["email"],
            "hospital_affiliation": doctor_patient["hospital_affiliation"],
            "created_at": doctor_patient["created_at"],
            "updated_at": doctor_patient["updated_at"]
        })
    
    # Generate labs (3-5 labs)
    num_labs = random.randint(3, 5)
    for i in range(num_labs):
        lab = {
            "lab_id": str(uuid.uuid4()),
            "lab_name": random.choice(LAB_NAMES),
            "lab_location": fake.city() + ", Pakistan",
            "accreditation_number": f"PAL-{random.randint(1000, 9999)}",
            "phone": generate_phone(),
            "email": fake.email(),
            "created_at": fake.date_time_between(start_date='-2y', end_date='now')
        }
        labs_data.append(lab)
    
    # Original progression outcomes (preserved)
    progression_outcomes = ['Complicated', 'Controlled', 'Cured', 'Diabetes', 'Normal']
    
    # Generate patients and all related data
    for i in range(num_patients):
        person = names_list[i % len(names_list)]
        
        print(f"Processing patient {i+1}/{num_patients} - {person['first_name']} {person['last_name']}")
        
        patient_id = str(uuid.uuid4())
        
        # Calculate age and birth date
        age = random.randint(18, 80)
        birth_date = fake.date_of_birth(minimum_age=age, maximum_age=age)
        
        # Generate patient data
        patient = {
            "patient_id": patient_id,
            "cnic": generate_cnic(),
            "first_name": person['first_name'],
            "last_name": person['last_name'],
            "date_of_birth": birth_date,
            "gender": person['gender'].lower(),
            "blood_group": generate_blood_group(),
            "phone": generate_phone(),
            "email": fake.email(),
            "address": fake.address(),
            "created_at": fake.date_time_between(start_date='-2y', end_date='now'),
            "updated_at": fake.date_time_between(start_date='-1y', end_date='now')
        }
        patients_data.append(patient)
        
        # Generate family relationships (20% chance per patient)
        if random.random() < 0.2 and i > 0:  # Only if we have at least one other patient
            # Find a random relative from already created patients
            relative_idx = random.randint(0, i - 1)
            relationship_type = random.choice(["parent", "child", "sibling", "spouse"])
            
            # Correctly determine if blood relative based on relationship type
            blood_relatives = ["parent", "child", "sibling", "grandparent", "grandchild", 
                              "aunt_uncle", "niece_nephew", "cousin"]
            is_blood_relative = relationship_type in blood_relatives
            
            relationship = {
                "id": str(uuid.uuid4()),
                "patient_id": patient_id,
                "relative_patient_id": patients_data[relative_idx]["patient_id"],
                "relationship_type": relationship_type,
                "is_blood_relative": is_blood_relative,
                "created_at": fake.date_time_between(start_date='-1y', end_date='now')
            }
            family_relationships_data.append(relationship)
        
        # Generate family disease history (30% chance)
        if random.random() < 0.3:
            diseases = ["Diabetes", "Hypertension", "Heart Disease", "Cancer", "Kidney Disease"]
            disease = {
                "id": str(uuid.uuid4()),
                "patient_id": patient_id,
                "disease_name": random.choice(diseases),
                "diagnosed_at": fake.date_between(start_date='-10y', end_date='now'),
                "severity": random.choice(["mild", "moderate", "severe"]),
                "notes": fake.text(max_nb_chars=200),
                "created_at": fake.date_time_between(start_date='-1y', end_date='now')
            }
            family_disease_history_data.append(disease)
        
        # Original diabetes data generation (preserved exactly)
        final_outcome = random.choice(progression_outcomes)
        visit_count = random.randint(10, 25)
        base_values = {k: random.uniform(*v) for k, v in diabetes_ranges.items()}
        
        if final_outcome in ['Cured', 'Controlled', 'Diabetes', 'Complicated']:
            base_values['hba1c'] = random.uniform(7.5, 12.0)
            base_values['fasting_glucose'] = random.uniform(140, 190)
        else:
            base_values['hba1c'] = random.uniform(4.5, 5.5)
            base_values['fasting_glucose'] = random.uniform(70, 95)
        
        # Generate visits and all related data
        for visit_num in range(1, visit_count + 1):
            visit_id = str(uuid.uuid4())
            visit_date = fake.date_time_between(start_date='-2y', end_date='now')
            
            # Generate diabetes lab values (original logic preserved)
            lab_values = {}
            for k, v in base_values.items():
                direction, rate = 'stable', 1.0
                if final_outcome == 'Cured':
                    if k in ['hba1c', 'fasting_glucose']: direction, rate = 'improving', 2.0
                elif final_outcome == 'Controlled':
                    if k in ['hba1c', 'fasting_glucose']: direction, rate = 'improving', 0.5
                elif final_outcome == 'Complicated':
                    if k in ['creatinine', 'microalbumin']: direction, rate = 'worsening', 1.5
                elif final_outcome == 'Diabetes':
                    if k in ['hba1c', 'fasting_glucose']: direction, rate = 'worsening', 0.2
                trend_values = generate_trend_v2(v, visit_count, feature_name=k, direction=direction, rate=rate)
                lab_values[k] = trend_values[visit_num - 1]
            
            # Determine diagnosis (original logic preserved)
            diagnosis = determine_diagnosis_realistic(lab_values['hba1c'], lab_values['fasting_glucose'], lab_values['bmi'])
            has_diabetes = diagnosis in ["Diabetes", "Prediabetes"]
            
            # Generate doctor visit
            doctor = random.choice(doctors_data)
            
            visit = {
                "visit_id": visit_id,
                "patient_id": patient_id,
                "doctor_patient_id": doctor["doctor_id"],  # Use doctor_patient_id instead of doctor_id
                "visit_date": visit_date,
                "chief_complaint": "",  # Empty - will be filled by AI generation
                "visit_type": random.choice(["consultation", "follow_up", "routine_checkup", "lab_review"]),
                "doctor_notes": "",  # Empty - will be filled by AI generation
                "created_at": visit_date,
                "updated_at": visit_date
            }
            doctor_visits_data.append(visit)
            
            # Generate symptoms (0-3 symptoms per visit)
            num_symptoms = random.randint(0, 3)
            if has_diabetes and num_symptoms > 0:
                symptom_list = random.sample(DIABETES_SYMPTOMS, min(num_symptoms, len(DIABETES_SYMPTOMS)))
            else:
                symptom_list = random.sample(["Headache", "Fatigue", "Nausea", "Dizziness"], num_symptoms)
            
            for symptom_name in symptom_list:
                symptom = {
                    "id": str(uuid.uuid4()),
                    "visit_id": visit_id,
                    "symptom_name": symptom_name,
                    "severity": random.randint(1, 10),
                    "duration_days": random.randint(1, 30),
                    "notes": fake.text(max_nb_chars=100)
                }
                symptoms_data.append(symptom)
            
            # Generate diagnosis
            diagnosis_record = {
                "diagnosis_id": str(uuid.uuid4()),
                "visit_id": visit_id,
                "disease_name": diagnosis,
                "diagnosis_date": visit_date,
                "confidence_score": random.uniform(0.7, 1.0) if has_diabetes else random.uniform(0.5, 0.9),
                "ml_model_used": "xgb_diabetes_v1" if has_diabetes else None,
                "status": "confirmed" if has_diabetes else "suspected",
                "notes": None,
                "created_at": visit_date
            }
            diagnoses_data.append(diagnosis_record)
            
            # Generate prescription (if diabetes)
            if has_diabetes and random.random() < 0.7:
                medication = random.choice(DIABETES_MEDICATIONS)
                prescription = {
                    "prescription_id": str(uuid.uuid4()),
                    "visit_id": visit_id,
                    "medication_name": medication,
                    "dosage": f"{random.randint(1, 3)}mg",
                    "frequency": random.choice(["Once daily", "Twice daily", "Three times daily"]),
                    "duration_days": random.randint(30, 90),
                    "instructions": "",  # Empty - will be filled by AI generation
                    "created_at": visit_date
                }
                prescriptions_data.append(prescription)
            
            # Generate lab report
            lab = random.choice(labs_data)
            lab_report = {
                "report_id": str(uuid.uuid4()),
                "patient_id": patient_id,
                "lab_id": lab["lab_id"],
                "visit_id": visit_id,
                "report_date": visit_date + timedelta(days=random.randint(1, 3)),
                "report_type": "blood_test",
                "status": "completed",
                "pdf_url": f"https://lab-reports.com/report_{visit_id}.pdf",
                "created_at": visit_date,
                "updated_at": visit_date
            }
            lab_reports_data.append(lab_report)
            
            # Generate lab test results
            for test_name, test_value in lab_values.items():
                # Define reference ranges
                ref_ranges = {
                    "fasting_glucose": (70, 100), "hba1c": (4.0, 5.6), "hdl": (40, 60),
                    "ldl": (0, 100), "triglycerides": (0, 150), "total_cholesterol": (0, 200),
                    "creatinine": (0.6, 1.2), "urea": (7, 20), "microalbumin": (0, 30),
                    "alt": (7, 56), "ast": (10, 40), "insulin": (2, 25),
                    "bmi": (18.5, 24.9), "systolic_bp": (90, 120), "diastolic_bp": (60, 80)
                }
                
                ref_min, ref_max = ref_ranges.get(test_name, (0, 100))
                is_abnormal = test_value < ref_min or test_value > ref_max
                
                test_result = {
                    "result_id": str(uuid.uuid4()),
                    "report_id": lab_report["report_id"],
                    "test_name": test_name,
                    "test_value": test_value,
                    "unit": "mg/dL" if "glucose" in test_name or "cholesterol" in test_name else 
                           "%" if "hba1c" in test_name else 
                           "mg/dL" if "creatinine" in test_name or "urea" in test_name else
                           "U/L" if "alt" in test_name or "ast" in test_name else
                           "mU/L" if "insulin" in test_name else
                           "mmHg" if "bp" in test_name else "kg/m²",
                    "reference_range_min": ref_min,
                    "reference_range_max": ref_max,
                    "is_abnormal": is_abnormal,
                    "created_at": visit_date
                }
                lab_test_results_data.append(test_result)
            
            # Generate disease progression (once per patient, at the end)
            if visit_num == visit_count:
                progression = {
                    "progression_id": str(uuid.uuid4()),
                    "patient_id": patient_id,
                    "disease_name": "diabetes",
                    "progression_stage": final_outcome,
                    "assessed_date": visit_date,
                    "ml_model_used": "lstm_progression_v1",
                    "confidence_score": random.uniform(0.8, 1.0),
                    "notes": f"Final assessment: {final_outcome}",
                    "created_at": visit_date
                }
                disease_progressions_data.append(progression)
    
    # Keep doctor_notes and instructions empty for AI generation
    print("Leaving doctor_notes and instructions empty for AI generation...")
    
    print("Data generation complete!")
    
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
        # Preserve original diabetes data for ML training
        "diabetes_training_data": {
            "features": list(diabetes_ranges.keys()),
            "ranges": diabetes_ranges,
            "progression_outcomes": progression_outcomes
        }
    }

if __name__ == "__main__":
    # Load names from JSON
    names_list = load_names_from_json("names.json")
    
    # Generate enhanced data - use ALL names from JSON file
    data = generate_enhanced_data(names_list)  # Uses all names from names.json
    
    # Save to JSON files for inspection
    for table_name, table_data in data.items():
        if table_name != "diabetes_training_data":
            with open(f"generated_{table_name}.json", "w") as f:
                json.dump(table_data, f, indent=2, default=str)
    
    print(f"Generated data for {len(data['patients'])} patients")
    print(f"Generated {len(data['doctor_visits'])} doctor visits")
    print(f"Generated {len(data['lab_reports'])} lab reports")
    print(f"Generated {len(data['symptoms'])} symptoms")
    print(f"Generated {len(data['prescriptions'])} prescriptions")
