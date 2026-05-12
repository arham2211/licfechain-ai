"""
Medical Test Reference Ranges
Real-world reference ranges used by doctors for lab test interpretation
Based on standard medical guidelines (Mayo Clinic, LabCorp, Quest Diagnostics)
"""

from typing import Dict, Optional, Tuple

# Standard reference ranges for common lab tests
# Format: {
#   "test_name": {
#     "unit": "unit_string",
#     "reference_range_min": float,
#     "reference_range_max": float,
#     "gender_specific": bool,  # If True, ranges differ by gender
#     "male_min": float,  # Optional: male-specific range
#     "male_max": float,
#     "female_min": float,  # Optional: female-specific range
#     "female_max": float,
#     "description": "What this test measures"
#   }
# }

TEST_REFERENCE_RANGES: Dict[str, Dict] = {
    # ========== DIABETES TESTS ==========
    "fasting_glucose": {
        "unit": "mg/dL",
        "reference_range_min": 70.0,
        "reference_range_max": 100.0,
        "gender_specific": False,
        "description": "Fasting blood glucose level"
    },
    "hba1c": {
        "unit": "%",
        "reference_range_min": 4.0,
        "reference_range_max": 5.6,
        "gender_specific": False,
        "description": "Hemoglobin A1c - average blood sugar over 2-3 months"
    },
    "hdl": {
        "unit": "mg/dL",
        "reference_range_min": 40.0,  # Male: 40+, Female: 50+
        "reference_range_max": 200.0,
        "gender_specific": True,
        "male_min": 40.0,
        "male_max": 200.0,
        "female_min": 50.0,
        "female_max": 200.0,
        "description": "High-density lipoprotein (good cholesterol)"
    },
    "ldl": {
        "unit": "mg/dL",
        "reference_range_min": 0.0,
        "reference_range_max": 100.0,  # Optimal: <100, Borderline: 100-159, High: 160+
        "gender_specific": False,
        "description": "Low-density lipoprotein (bad cholesterol)"
    },
    "triglycerides": {
        "unit": "mg/dL",
        "reference_range_min": 0.0,
        "reference_range_max": 150.0,  # Normal: <150, Borderline: 150-199, High: 200+
        "gender_specific": False,
        "description": "Triglycerides level"
    },
    "total_cholesterol": {
        "unit": "mg/dL",
        "reference_range_min": 0.0,
        "reference_range_max": 200.0,  # Desirable: <200, Borderline: 200-239, High: 240+
        "gender_specific": False,
        "description": "Total cholesterol level"
    },
    "egfr": {
        "unit": "mL/min/1.73m²",
        "reference_range_min": 90.0,
        "reference_range_max": 120.0,
        "gender_specific": False,
        "description": "Estimated glomerular filtration rate - overall kidney filtration function"
    },
    "creatinine": {
        "unit": "mg/dL",
        "reference_range_min": 0.6,  # Male: 0.7-1.3, Female: 0.6-1.1
        "reference_range_max": 1.3,
        "gender_specific": True,
        "male_min": 0.7,
        "male_max": 1.3,
        "female_min": 0.6,
        "female_max": 1.1,
        "description": "Creatinine - kidney function marker"
    },
    "bmi": {
        "unit": "kg/m²",
        "reference_range_min": 18.5,
        "reference_range_max": 24.9,  # Normal: 18.5-24.9, Overweight: 25-29.9, Obese: 30+
        "gender_specific": False,
        "description": "Body Mass Index"
    },
    "uacr": {
        "unit": "mg/g",
        "reference_range_min": 0.0,
        "reference_range_max": 30.0,
        "gender_specific": False,
        "description": "Urine albumin-to-creatinine ratio - marker of kidney damage"
    },
    "bun": {
        "unit": "mg/dL",
        "reference_range_min": 7.0,
        "reference_range_max": 20.0,
        "gender_specific": False,
        "description": "Blood urea nitrogen - kidney function and hydration marker"
    },
    "potassium": {
        "unit": "mmol/L",
        "reference_range_min": 3.5,
        "reference_range_max": 5.1,
        "gender_specific": False,
        "description": "Potassium - important electrolyte affected in kidney disease"
    },
    "phosphorus": {
        "unit": "mg/dL",
        "reference_range_min": 2.5,
        "reference_range_max": 4.5,
        "gender_specific": False,
        "description": "Phosphorus - mineral balance marker relevant in CKD and parathyroid disease"
    },
    "calcium": {
        "unit": "mg/dL",
        "reference_range_min": 8.5,
        "reference_range_max": 10.2,
        "gender_specific": False,
        "description": "Calcium - key marker in parathyroid and bone-mineral disorders"
    },
    "pth": {
        "unit": "pg/mL",
        "reference_range_min": 15.0,
        "reference_range_max": 65.0,
        "gender_specific": False,
        "description": "Parathyroid hormone - primary hormone marker for parathyroid disorders"
    },
    "vitamin_d": {
        "unit": "ng/mL",
        "reference_range_min": 30.0,
        "reference_range_max": 100.0,
        "gender_specific": False,
        "description": "Vitamin D - bone and mineral metabolism marker often paired with PTH"
    },
    "systolic_bp": {
        "unit": "mmHg",
        "reference_range_min": 90.0,
        "reference_range_max": 120.0,  # Normal: <120, Elevated: 120-129, High: 130+
        "gender_specific": False,
        "description": "Systolic blood pressure"
    },
    "diastolic_bp": {
        "unit": "mmHg",
        "reference_range_min": 60.0,
        "reference_range_max": 80.0,  # Normal: <80, Elevated: 80-89, High: 90+
        "gender_specific": False,
        "description": "Diastolic blood pressure"
    },
    
    # ========== ANEMIA/IRON DEFICIENCY TESTS ==========
    "hemoglobin": {
        "unit": "g/dL",
        "reference_range_min": 12.0,  # Female: 12.0-15.5, Male: 13.5-17.5
        "reference_range_max": 17.5,
        "gender_specific": True,
        "male_min": 13.5,
        "male_max": 17.5,
        "female_min": 12.0,
        "female_max": 15.5,
        "description": "Hemoglobin - oxygen-carrying protein in red blood cells"
    },
    "hematocrit": {
        "unit": "%",
        "reference_range_min": 36.0,  # Female: 36-46%, Male: 40-50%
        "reference_range_max": 50.0,
        "gender_specific": True,
        "male_min": 40.0,
        "male_max": 50.0,
        "female_min": 36.0,
        "female_max": 46.0,
        "description": "Hematocrit - percentage of red blood cells in blood"
    },
    "mcv": {
        "unit": "fL",
        "reference_range_min": 80.0,
        "reference_range_max": 100.0,
        "gender_specific": False,
        "description": "Mean Corpuscular Volume - average size of red blood cells"
    },
    "mch": {
        "unit": "pg",
        "reference_range_min": 27.0,
        "reference_range_max": 31.0,
        "gender_specific": False,
        "description": "Mean Corpuscular Hemoglobin - average hemoglobin per red blood cell"
    },
    "mchc": {
        "unit": "g/dL",
        "reference_range_min": 32.0,
        "reference_range_max": 36.0,
        "gender_specific": False,
        "description": "Mean Corpuscular Hemoglobin Concentration - hemoglobin concentration in red blood cells"
    },
    "rdw": {
        "unit": "%",
        "reference_range_min": 11.5,
        "reference_range_max": 14.5,
        "gender_specific": False,
        "description": "Red Cell Distribution Width - variation in red blood cell size"
    },
    "serum_iron": {
        "unit": "μg/dL",
        "reference_range_min": 60.0,  # Male: 65-175, Female: 50-170
        "reference_range_max": 175.0,
        "gender_specific": True,
        "male_min": 65.0,
        "male_max": 175.0,
        "female_min": 50.0,
        "female_max": 170.0,
        "description": "Serum iron - amount of iron in blood"
    },
    "ferritin": {
        "unit": "ng/mL",
        "reference_range_min": 15.0,  # Male: 20-250, Female: 10-120
        "reference_range_max": 250.0,
        "gender_specific": True,
        "male_min": 20.0,
        "male_max": 250.0,
        "female_min": 10.0,
        "female_max": 120.0,
        "description": "Ferritin - iron storage protein"
    },
    "tibc": {
        "unit": "μg/dL",
        "reference_range_min": 250.0,
        "reference_range_max": 450.0,
        "gender_specific": False,
        "description": "Total Iron Binding Capacity - capacity of transferrin to bind iron"
    },
    "transferrin_saturation": {
        "unit": "%",
        "reference_range_min": 20.0,
        "reference_range_max": 50.0,
        "gender_specific": False,
        "description": "Transferrin saturation - percentage of transferrin bound with iron"
    },
    "reticulocyte_count": {
        "unit": "%",
        "reference_range_min": 0.5,
        "reference_range_max": 2.5,
        "gender_specific": False,
        "description": "Reticulocyte count - percentage of young red blood cells"
    },
    "wbc": {
        "unit": "cells/μL",
        "reference_range_min": 4000.0,
        "reference_range_max": 11000.0,
        "gender_specific": False,
        "description": "White Blood Cell count"
    },
    "platelet_count": {
        "unit": "cells/μL",
        "reference_range_min": 150000.0,
        "reference_range_max": 450000.0,
        "gender_specific": False,
        "description": "Platelet count"
    },
    "esr": {
        "unit": "mm/hr",
        "reference_range_min": 0.0,  # Male: 0-15, Female: 0-20
        "reference_range_max": 20.0,
        "gender_specific": True,
        "male_min": 0.0,
        "male_max": 15.0,
        "female_min": 0.0,
        "female_max": 20.0,
        "description": "Erythrocyte Sedimentation Rate - inflammation marker"
    }
}

PROGRESSION_TEST_MAPPINGS: Dict[str, Tuple[str, ...]] = {
    "diabetes": (
        "fasting_glucose",
        "hba1c",
        "hdl",
        "ldl",
        "triglycerides",
        "bmi",
    ),
    "anemia": (
        "hemoglobin",
        "hematocrit",
        "mcv",
        "mch",
        "mchc",
        "rdw",
        "serum_iron",
        "ferritin",
        "tibc",
        "transferrin_saturation",
        "reticulocyte_count",
    ),
    "ckd": (
        "creatinine",
        "egfr",
        "uacr",
        "bun",
        "potassium",
        "phosphorus",
        "pth",
        "calcium",
        "vitamin_d",
    ),
    "parathyroid": (
        "pth",
        "calcium",
        "phosphorus",
        "vitamin_d",
        "creatinine",
        "egfr",
    ),
    "oral_cancer": (),
}


def normalize_disease_key(disease_name: str) -> str:
    """Normalize free-text disease names to a stable lookup key."""
    normalized = (disease_name or "").strip().lower().replace("-", "_").replace(" ", "_")

    if "kidney" in normalized or "ckd" in normalized or "renal" in normalized:
        return "ckd"
    if "diabet" in normalized or "glycem" in normalized:
        return "diabetes"
    if "anemia" in normalized or "iron_deficiency" in normalized or normalized == "ida":
        return "anemia"
    if "parathyroid" in normalized or "hyperparathy" in normalized or "hypoparathy" in normalized:
        return "parathyroid"
    if "oral" in normalized or "cancer" in normalized:
        return "oral_cancer"

    return normalized


def get_progression_tests_for_disease(disease_name: str, supported_only: bool = True) -> Tuple[str, ...]:
    """
    Get the supported lab-test names that should be used for a disease's progression logic.
    """
    disease_key = normalize_disease_key(disease_name)
    mapped_tests = PROGRESSION_TEST_MAPPINGS.get(disease_key, ())

    if not supported_only:
        return mapped_tests

    return tuple(test_name for test_name in mapped_tests if test_name in TEST_REFERENCE_RANGES)


def get_reference_range(test_name: str, gender: Optional[str] = None) -> Tuple[float, float, str]:
    """
    Get reference range for a test
    
    Args:
        test_name: Name of the test
        gender: Optional gender ('male' or 'female') for gender-specific tests
        
    Returns:
        Tuple of (min_value, max_value, unit)
    """
    test_info = TEST_REFERENCE_RANGES.get(test_name.lower())
    
    if not test_info:
        # Return default range if test not found
        return (0.0, 1000.0, "unknown")
    
    unit = test_info.get("unit", "unknown")
    
    # Check if gender-specific
    if test_info.get("gender_specific") and gender:
        gender_lower = gender.lower()
        if gender_lower == "male" and "male_min" in test_info:
            return (test_info["male_min"], test_info["male_max"], unit)
        elif gender_lower == "female" and "female_min" in test_info:
            return (test_info["female_min"], test_info["female_max"], unit)
    
    # Return general range
    return (
        test_info.get("reference_range_min", 0.0),
        test_info.get("reference_range_max", 1000.0),
        unit
    )


def calculate_is_abnormal(test_value: float, test_name: str, gender: Optional[str] = None,
                          custom_min: Optional[float] = None, custom_max: Optional[float] = None) -> bool:
    """
    Calculate if a test value is abnormal
    
    Args:
        test_value: The test result value
        test_name: Name of the test
        gender: Optional gender for gender-specific ranges
        custom_min: Optional custom minimum (overrides default)
        custom_max: Optional custom maximum (overrides default)
        
    Returns:
        True if abnormal, False if normal
    """
    if custom_min is not None and custom_max is not None:
        min_val, max_val = custom_min, custom_max
    else:
        min_val, max_val, _ = get_reference_range(test_name, gender)
    
    return test_value < min_val or test_value > max_val


def get_all_supported_tests() -> Dict[str, Dict]:
    """
    Get all supported test types with their reference ranges
    
    Returns:
        Dictionary of all supported tests with their information
    """
    return TEST_REFERENCE_RANGES.copy()
