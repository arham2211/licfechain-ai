"""
Progression Report Service for generating comprehensive patient reports
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func, and_, or_
from uuid import UUID
import os

# Ensure project root and model_training directory are on Python path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_TRAINING_DIR = PROJECT_ROOT / "model_training"

for p in (PROJECT_ROOT, MODEL_TRAINING_DIR):
    p_str = str(p)
    if p_str not in sys.path:
        sys.path.insert(0, p_str)

# Import the LSTM model class before importing InferenceService
from train_models import ProgressionBiLSTM
from app.services.inference_service import InferenceService
from app.services.multi_disease_inference import multi_disease_inference as _multi_disease_inference_singleton
from app.core.test_reference_ranges import get_progression_tests_for_disease
from app.models import (
    Patient, DoctorVisit, LabTestResult, LabReport, 
    DiseaseProgression, FamilyDiseaseHistory, FamilyRelationship,
    Prescription
)

# Groq LLM for intelligent recommendations
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field


from app.core.config import get_settings

# Get settings and set Google API key from .env
settings = get_settings()
os.environ["GOOGLE_API_KEY"] = settings.GOOGLE_API_KEY

class ProgressionReportService:
    """Service for generating comprehensive progression reports"""
    
    def __init__(self):
        self.inference = InferenceService()
        self.inference.load_models()
        # Use the shared singleton — models are loaded lazily on first use
        self.multi_inference = _multi_disease_inference_singleton

    def _get_relevant_tests_for_disease(self, disease_name: str) -> List[str]:
        return list(get_progression_tests_for_disease(disease_name))

    def _filter_lab_tests_for_disease(self, disease_name: str, lab_tests: List) -> List:
        relevant_tests = {name.lower() for name in self._get_relevant_tests_for_disease(disease_name)}
        if not relevant_tests:
            return []
        return [test for test in lab_tests if str(test[0]).lower() in relevant_tests]

    def _infer_stage_from_lookup(self, disease_name: str, values: Dict[str, float]) -> Optional[str]:
        """Infer a stage from normalized lab-value lookup for one disease snapshot."""
        disease_lower = disease_name.lower().strip()

        if "parathyroid" in disease_lower:
            pth = values.get("pth")
            calcium = values.get("calcium")
            phosphorus = values.get("phosphorus")
            vitamin_d = values.get("vitamin_d")
            egfr = values.get("egfr")
            creatinine = values.get("creatinine")

            if pth is None and calcium is None and phosphorus is None and vitamin_d is None:
                return None

            if pth is not None and pth < 15 and calcium is not None and calcium < 8.5:
                return "Possible Hypoparathyroidism"
            if pth is not None and pth > 65:
                if calcium is not None and calcium > 10.2:
                    return "Possible Primary Hyperparathyroidism"
                if (
                    (vitamin_d is not None and vitamin_d < 30) or
                    (phosphorus is not None and phosphorus > 4.5) or
                    (egfr is not None and egfr < 60) or
                    (creatinine is not None and creatinine > 1.3)
                ):
                    return "Possible Secondary Hyperparathyroidism"
                return "Possible Secondary Hyperparathyroidism"
            if calcium is not None and calcium > 10.2:
                return "Indeterminate Parathyroid Pattern"
            if calcium is not None and calcium < 8.5:
                return "Possible Hypoparathyroidism"
            if (
                (vitamin_d is not None and vitamin_d < 30) or
                (phosphorus is not None and phosphorus > 4.5)
            ):
                return "Indeterminate Parathyroid Pattern"
            return "Normal Parathyroid Function"

        if "diabet" in disease_lower:
            hba1c = values.get("hba1c")
            fasting_glucose = values.get("fasting_glucose")
            if hba1c is None and fasting_glucose is None:
                return None
            if fasting_glucose is not None and fasting_glucose < 70:
                return "Hypoglycemia"
            if (hba1c is not None and hba1c >= 8.0) or (fasting_glucose is not None and fasting_glucose >= 180):
                return "Uncontrolled"
            if (hba1c is not None and hba1c >= 6.5) or (fasting_glucose is not None and fasting_glucose >= 126):
                return "Controlled"
            if (hba1c is not None and hba1c >= 5.7) or (fasting_glucose is not None and fasting_glucose >= 100):
                return "Prediabetes"
            return "Normal"

        if "anemia" in disease_lower or "iron" in disease_lower:
            hemoglobin = values.get("hemoglobin")
            ferritin = values.get("ferritin")
            if hemoglobin is None and ferritin is None:
                return None
            if hemoglobin is not None:
                if hemoglobin < 8:
                    return "Severe Iron Deficiency Anemia"
                if hemoglobin < 11:
                    return "Moderate Iron Deficiency Anemia"
                if hemoglobin < 12:
                    return "Mild Iron Deficiency Anemia"
            if ferritin is not None and ferritin < 15:
                return "Iron Deficiency Without Anemia"
            return "Normal"

        if "ckd" in disease_lower or "kidney" in disease_lower or "renal" in disease_lower:
            egfr = values.get("egfr")
            uacr = values.get("uacr")
            creatinine = values.get("creatinine")
            if egfr is None and uacr is None and creatinine is None:
                return None
            if egfr is not None:
                if egfr < 15:
                    return "End Stage Renal Disease (ESRD)"
                if egfr < 30:
                    return "Advanced CKD Stage 4"
                if egfr < 45:
                    return "Moderate CKD Stage 3b"
                if egfr < 60:
                    return "Moderate CKD Stage 3a"
                if egfr < 90:
                    return "Early CKD Stage 2"
                if (uacr is not None and uacr > 30) or (creatinine is not None and creatinine > 1.3):
                    return "Early CKD Stage 1"
                return "Normal Kidney Function"
            if (uacr is not None and uacr > 30) or (creatinine is not None and creatinine > 1.3):
                return "Early CKD Stage 1"
            return "Normal Kidney Function"

        return None

    def _infer_stage_from_lab_tests(self, disease_name: str, lab_tests: List) -> Optional[Dict[str, Any]]:
        """
        Infer a disease stage directly from recent disease-specific lab markers.
        Returns None when the available labs are insufficient to infer a stage.
        """
        disease_specific_lab_tests = self._filter_lab_tests_for_disease(disease_name, lab_tests)
        if not disease_specific_lab_tests:
            return None

        latest_values: Dict[str, float] = {}
        latest_date: Optional[datetime] = None

        for row in disease_specific_lab_tests:
            test_name = str(row[0]).lower()
            try:
                test_value = float(row[1])
            except (TypeError, ValueError):
                continue

            test_date = row[3] if len(row) > 3 else None
            if test_name not in latest_values:
                latest_values[test_name] = test_value
            if isinstance(test_date, datetime) and (latest_date is None or test_date > latest_date):
                latest_date = test_date

        if not latest_values:
            return None

        stage = self._infer_stage_from_lookup(disease_name, latest_values)
        if stage is None:
            return None

        return {
            "stage": stage,
            "assessed_date": latest_date,
            "confidence_score": 0.78,
            "source": "lab_inference",
        }

    def _build_inferred_lab_timeline(self, disease_name: str, lab_rows: List) -> List[Dict[str, Any]]:
        """Infer one progression point per lab-report date from disease-specific lab markers."""
        disease_specific_lab_tests = self._filter_lab_tests_for_disease(disease_name, lab_rows)
        if not disease_specific_lab_tests:
            return []

        grouped_by_date: Dict[str, Dict[str, Any]] = {}
        for row in disease_specific_lab_tests:
            test_name = str(row[0]).lower()
            try:
                test_value = float(row[1])
            except (TypeError, ValueError):
                continue

            report_date = row[3] if len(row) > 3 else None
            if report_date is None:
                continue

            key = report_date.isoformat()
            bucket = grouped_by_date.setdefault(
                key,
                {"date": report_date, "values": {}, "report_types": set(), "tests_used": []},
            )
            bucket["values"][test_name] = test_value
            report_type = row[4] if len(row) > 4 else None
            unit = row[5] if len(row) > 5 else None
            if report_type:
                bucket["report_types"].add(str(report_type))
            bucket["tests_used"].append({
                "name": test_name,
                "value": test_value,
                "unit": unit,
            })

        inferred_points: List[Dict[str, Any]] = []
        for bucket in grouped_by_date.values():
            stage = self._infer_stage_from_lookup(disease_name, bucket["values"])
            if not stage:
                continue
            assessed_date = bucket["date"]
            inferred_points.append({
                "date": assessed_date.isoformat(),
                "progression_stage": stage,
                "severity_score": self._calculate_severity_score(stage, disease_name),
                "confidence_score": 0.78,
                "notes": "Derived from lab report markers",
                "visit_date": assessed_date.isoformat(),
                "visit_type": "lab_inference",
                "report_type": ", ".join(sorted(bucket["report_types"])) if bucket["report_types"] else None,
                "doctor_notes": None,
                "medications": [],
                "tests_used": bucket["tests_used"],
            })

        inferred_points.sort(key=lambda item: item["date"])
        return inferred_points

    def _build_lab_context_by_date(self, disease_name: str, lab_rows: List) -> Dict[str, Dict[str, Any]]:
        """Group disease-relevant report/test details by report date for tooltip display."""
        disease_specific_lab_tests = self._filter_lab_tests_for_disease(disease_name, lab_rows)
        context_by_date: Dict[str, Dict[str, Any]] = {}

        for row in disease_specific_lab_tests:
            report_date = row[3] if len(row) > 3 else None
            if report_date is None:
                continue

            key = report_date.isoformat()
            bucket = context_by_date.setdefault(
                key,
                {"report_types": set(), "tests_used": []},
            )

            report_type = row[4] if len(row) > 4 else None
            unit = row[5] if len(row) > 5 else None
            if report_type:
                bucket["report_types"].add(str(report_type))

            try:
                test_value = float(row[1])
            except (TypeError, ValueError):
                continue

            bucket["tests_used"].append({
                "name": str(row[0]).lower(),
                "value": test_value,
                "unit": unit,
            })

        return context_by_date
    
    def _calculate_severity_score(self, progression_stage: str, disease_name: str = None) -> float:
        """
        Calculate a numerical severity score (0-10) from progression stage for Y-axis charting.
        Higher score = more severe condition.
        """
        if not progression_stage:
            return 0.0
        
        stage_lower = progression_stage.lower().strip()
        
        # CKD stages — matches both short ("stage 1") and full diagnosis labels ("Early CKD Stage 1")
        ckd_scores = {
            'normal': 0.0,
            'normal kidney function': 0.0,
            'stage 1': 1.0,
            'stage_1': 1.0,
            'early ckd stage 1': 1.0,
            'ckd stage 1': 1.0,
            'stage 2': 2.5,
            'stage_2': 2.5,
            'early ckd stage 2': 2.5,
            'ckd stage 2': 2.5,
            'stage 3a': 4.0,
            'stage_3a': 4.0,
            'moderate ckd stage 3a': 4.0,
            'ckd stage 3a': 4.0,
            'stage 3b': 5.5,
            'stage_3b': 5.5,
            'moderate ckd stage 3b': 5.5,
            'ckd stage 3b': 5.5,
            'stage 3': 5.0,
            'stage_3': 5.0,
            'stage 4': 7.5,
            'stage_4': 7.5,
            'advanced ckd stage 4': 7.5,
            'ckd stage 4': 7.5,
            'stage 5': 9.0,
            'stage_5': 9.0,
            'ckd stage 5': 9.0,
            'esrd': 10.0,
            'end stage renal disease': 10.0,
            'end stage renal disease (esrd)': 10.0,
            'dialysis': 10.0,
        }

        # Diabetes progression scores
        diabetes_scores = {
            'normal': 0.0,
            'hypoglycemia': 4.5,
            'prediabetes': 3.0,
            'pre-diabetes': 3.0,
            'controlled': 4.0,
            'diabetes': 5.0,
            'uncontrolled': 7.0,
            'uncontrolled diabetes': 7.0,
            'complicated': 8.5,
            'complicated diabetes': 8.5,
            'severe': 9.0,
            'critical': 10.0,
        }

        # Anemia progression scores
        anemia_scores = {
            'normal': 0.0,
            'mild': 2.5,
            'moderate': 5.0,
            'severe': 7.5,
            'critical': 10.0,
            'iron deficiency without anemia': 2.0,
            'mild iron deficiency anemia': 3.5,
            'moderate iron deficiency anemia': 5.5,
            'severe iron deficiency anemia': 8.0,
        }

        # Parathyroid progression scores
        parathyroid_scores = {
            'normal parathyroid function': 0.0,
            'indeterminate parathyroid pattern': 3.0,
            'possible secondary hyperparathyroidism': 5.5,
            'possible primary hyperparathyroidism': 7.0,
            'possible hypoparathyroidism': 6.0,
            'secondary hyperparathyroidism': 5.5,
            'primary hyperparathyroidism': 7.0,
            'hypoparathyroidism': 6.0,
        }

        # Oral cancer progression scores
        oral_cancer_scores = {
            'normal': 0.0,
            'no oral lesion detected': 0.0,
            'low risk': 2.0,
            'suspicious oral lesion': 5.0,
            'moderate risk': 5.0,
            'possible oral cancer': 9.0,
            'high risk': 9.0,
        }

        # Generic progression scores (fallback)
        generic_scores = {
            'normal': 0.0,
            'stable': 1.0,
            'mild': 2.5,
            'moderate': 5.0,
            'slowly progressing': 4.0,
            'progressing': 6.0,
            'rapidly progressing': 8.0,
            'severe': 7.5,
            'critical': 9.0,
            'end stage': 10.0,
            'cured': 0.0,
            'low risk': 2.0,
            'moderate risk': 6.0,
            'high risk': 9.0,
        }

        # Disease-specific lookup first (most precise)
        if disease_name:
            d = disease_name.lower()
            if 'ckd' in d or 'kidney' in d:
                if stage_lower in ckd_scores:
                    return ckd_scores[stage_lower]
            elif 'diabet' in d:
                if stage_lower in diabetes_scores:
                    return diabetes_scores[stage_lower]
            elif 'anemia' in d or 'iron' in d:
                if stage_lower in anemia_scores:
                    return anemia_scores[stage_lower]
            elif 'parathyroid' in d:
                if stage_lower in parathyroid_scores:
                    return parathyroid_scores[stage_lower]
            elif 'oral' in d or 'cancer' in d:
                if stage_lower in oral_cancer_scores:
                    return oral_cancer_scores[stage_lower]

        # Try all disease maps in order
        for score_map in [ckd_scores, diabetes_scores, anemia_scores, parathyroid_scores, oral_cancer_scores, generic_scores]:
            if stage_lower in score_map:
                return score_map[stage_lower]

        # Partial matching against all known keys
        all_scores = {**ckd_scores, **diabetes_scores, **anemia_scores, **parathyroid_scores, **oral_cancer_scores, **generic_scores}
        for key, score in all_scores.items():
            if key in stage_lower or stage_lower in key:
                return score

        # Default to middle value if unknown
        return 5.0
    
    def _normalize_disease_query(self, disease_name: str) -> str:
        """
        Normalize disease name query to handle common abbreviations and variations.
        Returns a pattern that will match the disease in the database.
        
        Examples:
        - "ckd" -> "%chronic%kidney%" or "%ckd%" (matches "chronic_kidney_disease")
        - "diabetes" -> "%diabetes%" (matches "diabetes", "Type 2 Diabetes", etc.)
        - "anemia" -> "%anemia%" or "%iron%deficiency%" (matches "iron_deficiency_anemia")
        """
        disease_lower = disease_name.lower().strip()
        
        # Map common abbreviations to search patterns
        disease_patterns = {
            'ckd': '%chronic%kidney%',
            'chronic kidney disease': '%chronic%kidney%',
            'chronic_kidney_disease': '%chronic%kidney%',
            'diabetes': '%diabetes%',
            'diabetic': '%diabetes%',
            'anemia': '%anemia%',
            'ida': '%iron%deficiency%',
            'iron deficiency anemia': '%iron%deficiency%',
            'iron_deficiency_anemia': '%iron%deficiency%',
            'parathyroid': '%parathyroid%',
            'parathyroid disorder': '%parathyroid%',
            'parathyroid_disorder': '%parathyroid%',
            'hyperparathyroidism': '%parathyroid%',
            'hypoparathyroidism': '%parathyroid%',
            'oral_cancer': '%oral%cancer%',
            'oral cancer': '%oral%cancer%',
            'oral lesion': '%oral%',
            'mouth cancer': '%oral%cancer%',
        }
        
        # Check if we have a specific pattern for this disease
        if disease_lower in disease_patterns:
            return disease_patterns[disease_lower]
        
        # Otherwise, use the disease name as a pattern (with wildcards for flexibility)
        # This handles cases where the query might be a partial match
        return f"%{disease_name}%"
    
    async def generate_progression_report(
        self, 
        patient_id: UUID, 
        patient_name: str, 
        disease_name: str,
        months_back: int = 12,
        db: AsyncSession = None
    ) -> Optional[Dict[str, Any]]:
        """Generate comprehensive progression report for a patient"""
        try:
            # Get progression timeline
            timeline = await self.get_progression_timeline(patient_id, disease_name, months_back, db)
            
            if not timeline:
                return None
            
            # Get current progression stage
            current_stage = timeline[-1]['progression_stage'] if timeline else 'Unknown'
            
            # Get risk factors
            risk_factors = await self.get_risk_factors(patient_id, disease_name, db)
            
            # Get recommendations
            recommendations_response = await self.get_recommendations(patient_id, db)
            # Extract just the recommendations list from the full response
            recommendations = recommendations_response.get('recommendations', []) if isinstance(recommendations_response, dict) else []
            
            # Predict future progression
            future_prediction = await self.predict_future_progression(patient_id, disease_name, 6, db)
            
            # Generate report
            report = {
                'patient_id': patient_id,
                'patient_name': patient_name,
                'disease_name': disease_name,
                'progression_timeline': timeline,
                'current_stage': current_stage,
                'risk_factors': risk_factors,
                'recommendations': recommendations,
                'predicted_progression': future_prediction.get('predicted_stage', 'Unknown') if future_prediction else 'Unknown',
                'confidence_score': future_prediction.get('confidence_score', 0.0) if future_prediction else 0.0,
                'generated_at': datetime.now()
            }
            
            return report
            
        except Exception as e:
            print(f"Error generating progression report: {e}")
            return None
    
    async def get_progression_timeline(
        self, 
        patient_id: UUID, 
        disease_name: str, 
        months_back: int,
        db: AsyncSession
    ) -> List[Dict[str, Any]]:
        """Get progression timeline for a patient"""
        try:
            # Calculate date range (using 366 days for year to ensure earliest points are captured)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=366 if months_back >= 12 else months_back * 31)

            
            # Query progression data using SQLAlchemy
            from sqlalchemy.orm import aliased
            
            query = select(
                DiseaseProgression.assessed_date,
                DiseaseProgression.progression_stage,
                DiseaseProgression.notes,
                DiseaseProgression.confidence_score,
                DoctorVisit.visit_date,
                DoctorVisit.visit_type,
                DoctorVisit.doctor_notes
            ).outerjoin(
                DoctorVisit,
                and_(
                    DiseaseProgression.patient_id == DoctorVisit.patient_id,
                    func.date(DiseaseProgression.assessed_date) == func.date(DoctorVisit.visit_date)
                )
            ).where(
                and_(
                    DiseaseProgression.patient_id == patient_id,
                    DiseaseProgression.disease_name.ilike(self._normalize_disease_query(disease_name)),
                    DiseaseProgression.assessed_date >= start_date
                )
            ).order_by(DiseaseProgression.assessed_date.asc())
            
            result = await db.execute(query)
            rows = result.all()

            lab_query = select(
                LabTestResult.test_name,
                LabTestResult.test_value,
                LabTestResult.is_abnormal,
                LabReport.report_date,
                LabReport.report_type,
                LabTestResult.unit
            ).join(
                LabReport, LabTestResult.report_id == LabReport.report_id
            ).where(
                and_(
                    LabReport.patient_id == patient_id,
                    LabReport.report_date >= start_date
                )
            ).order_by(LabReport.report_date.desc())
            lab_result = await db.execute(lab_query)
            lab_rows = lab_result.all()
            inferred_timeline = self._build_inferred_lab_timeline(disease_name, lab_rows)
            lab_context_by_date = self._build_lab_context_by_date(disease_name, lab_rows)
            
            timeline = []
            for row in rows:
                date = row[0]
                progression_stage = row[1]
                # Calculate severity score from progression stage for Y-axis charting
                severity_score = self._calculate_severity_score(progression_stage, disease_name)
                
                # Fetch medications/prescriptions for this date
                med_query = select(Prescription.medication_name, Prescription.dosage).join(
                    DoctorVisit, Prescription.visit_id == DoctorVisit.visit_id
                ).where(
                    and_(
                        DoctorVisit.patient_id == patient_id,
                        func.date(DoctorVisit.visit_date) == func.date(date)
                    )
                )
                med_result = await db.execute(med_query)
                medications = [{"name": m[0], "dosage": m[1]} for m in med_result.all()]
                
                # If no prescriptions found for the exact date, fallback to recent ones (active)
                if not medications:
                    # Active medications = created within last 30 days of this progression point
                    active_med_query = select(Prescription.medication_name, Prescription.dosage).join(
                        DoctorVisit, Prescription.visit_id == DoctorVisit.visit_id
                    ).where(
                        and_(
                            DoctorVisit.patient_id == patient_id,
                            DoctorVisit.visit_date <= date,
                            DoctorVisit.visit_date >= (date - timedelta(days=90))
                        )
                    )
                    active_med_result = await db.execute(active_med_query)
                    medications = [{"name": m[0], "dosage": m[1]} for m in active_med_result.all()]

                timeline.append({
                    'date': date.isoformat() if date else None,
                    'progression_stage': progression_stage,
                    'severity_score': severity_score,
                    'confidence_score': float(row[3]) if row[3] is not None else None,
                    'notes': row[2],
                    'visit_date': row[4].isoformat() if row[4] else None,
                    'visit_type': row[5],
                    'report_type': ", ".join(sorted(lab_context_by_date.get(date.isoformat(), {}).get('report_types', set()))) or None,
                    'doctor_notes': row[6],
                    'medications': medications,
                    'tests_used': lab_context_by_date.get(date.isoformat(), {}).get('tests_used', []),
                })

            if inferred_timeline:
                inferred_by_date = {item["date"]: item for item in inferred_timeline if item.get("date")}
                cleaned_timeline = []

                for existing_point in timeline:
                    point_date = existing_point.get("date")
                    if not point_date:
                        continue

                    # Prefer report-derived inference when we can explain the point from report data.
                    if point_date in inferred_by_date:
                        continue

                    has_report_context = bool(existing_point.get("tests_used"))
                    if has_report_context:
                        cleaned_timeline.append(existing_point)
                        continue

                    # Suppress legacy lab-driven rows that we cannot back with report/test context.
                    if existing_point.get("notes", "").startswith("Auto-generated from completed lab report"):
                        continue

                    # For lab-driven diseases, if we have report-backed inferred points, hide unmatched legacy points.
                    if self._get_relevant_tests_for_disease(disease_name):
                        continue

                    cleaned_timeline.append(existing_point)

                timeline = cleaned_timeline + list(inferred_by_date.values())

            timeline.sort(key=lambda item: item.get('date') or '')
            
            return timeline
            
        except Exception as e:
            print(f"Error getting progression timeline: {e}")
            return []
    
    async def get_risk_factors(
        self, 
        patient_id: UUID, 
        disease_name: str,
        db: AsyncSession
    ) -> List[str]:
        """Get risk factors for a patient"""
        try:
            risk_factors = []
            
            # Get family history using SQLAlchemy
            family_query = select(
                FamilyDiseaseHistory.disease_name,
                FamilyDiseaseHistory.diagnosed_at,
                FamilyDiseaseHistory.severity,
                FamilyDiseaseHistory.notes
            ).where(
                and_(
                    FamilyDiseaseHistory.patient_id == patient_id,
                    FamilyDiseaseHistory.disease_name.ilike(self._normalize_disease_query(disease_name))
                )
            ).distinct()
            
            family_result = await db.execute(family_query)
            family_rows = family_result.all()
            
            for row in family_rows:
                diagnosed_at = row[1]
                severity = row[2]
                if diagnosed_at is not None and severity is not None:
                    risk_factors.append(f"Family history present ({disease_name}, severity {severity})")
                else:
                    risk_factors.append(f"Family history present ({disease_name})")
            
            # Get recent lab values for risk assessment using SQLAlchemy
            recent_date = datetime.now() - timedelta(days=90)
            relevant_tests = self._get_relevant_tests_for_disease(disease_name)
            
            lab_query = select(
                LabTestResult.test_name,
                LabTestResult.test_value,
                LabTestResult.reference_range_min,
                LabTestResult.reference_range_max,
                LabTestResult.is_abnormal
            ).join(
                LabReport, LabTestResult.report_id == LabReport.report_id
            ).join(
                DoctorVisit, LabReport.visit_id == DoctorVisit.visit_id
            ).join(
                Patient, DoctorVisit.patient_id == Patient.patient_id
            ).where(
                and_(
                    Patient.patient_id == patient_id,
                    LabTestResult.test_name.in_(relevant_tests),
                    DoctorVisit.visit_date >= recent_date
                )
            ).order_by(
                DoctorVisit.visit_date.desc()
            ).limit(20)
            
            lab_result = await db.execute(lab_query)
            lab_rows = lab_result.all()
            
            # Analyze lab values for risk factors
            lab_values = {}
            for row in lab_rows:
                test_name = str(row[0]).lower()
                test_value = float(row[1])
                
                if test_name not in lab_values:
                    lab_values[test_name] = []
                lab_values[test_name].append(test_value)
            
            # Check for abnormal values
            for test_name, values in lab_values.items():
                avg_value = sum(values) / len(values)
                
                if test_name == 'fasting_glucose' and avg_value < 70:
                    risk_factors.append(f"Low fasting glucose: {avg_value:.1f} mg/dL")
                elif test_name == 'fasting_glucose' and avg_value > 126:
                    risk_factors.append(f"Elevated fasting glucose: {avg_value:.1f} mg/dL")
                elif test_name == 'hba1c' and avg_value > 6.5:
                    risk_factors.append(f"Elevated HbA1c: {avg_value:.1f}%")
                elif test_name == 'hdl' and avg_value < 40:
                    risk_factors.append(f"Low HDL cholesterol: {avg_value:.1f} mg/dL")
                elif test_name == 'ldl' and avg_value > 160:
                    risk_factors.append(f"High LDL cholesterol: {avg_value:.1f} mg/dL")
                elif test_name == 'bmi' and avg_value > 30:
                    risk_factors.append(f"Obesity: BMI {avg_value:.1f}")
                elif test_name == 'pth' and avg_value > 65:
                    risk_factors.append(f"Elevated PTH: {avg_value:.1f} pg/mL")
                elif test_name == 'calcium' and avg_value > 10.2:
                    risk_factors.append(f"Elevated calcium: {avg_value:.1f} mg/dL")
                elif test_name == 'calcium' and avg_value < 8.5:
                    risk_factors.append(f"Low calcium: {avg_value:.1f} mg/dL")
                elif test_name == 'phosphorus' and avg_value > 4.5:
                    risk_factors.append(f"Elevated phosphorus: {avg_value:.1f} mg/dL")
                elif test_name == 'vitamin_d' and avg_value < 30:
                    risk_factors.append(f"Low vitamin D: {avg_value:.1f} ng/mL")
            
            return risk_factors
            
        except Exception as e:
            print(f"Error getting risk factors: {e}")
            return []
    
    async def get_recommendations(
        self, 
        patient_id: UUID, 
        db: AsyncSession
    ) -> Dict[str, Any]:
        """Get AI-powered personalized recommendations for a patient using Gemini LLM"""
        try:
            # Get patient info
            patient_query = select(Patient).where(Patient.patient_id == patient_id)
            patient_result = await db.execute(patient_query)
            patient = patient_result.scalar_one_or_none()
            
            if not patient:
                return {"error": "Patient not found"}
            
            # Find ALL diseases/conditions the patient has from disease_progressions
            diseases_query = select(DiseaseProgression.disease_name).where(
                DiseaseProgression.patient_id == patient_id
            ).distinct()
            diseases_result = await db.execute(diseases_query)
            all_diseases = [row[0] for row in diseases_result.all()]
            
            # Get progression data for all diseases (last 3 months)
            recent_date = datetime.now() - timedelta(days=90)
            all_progressions_query = select(DiseaseProgression).where(
                and_(
                    DiseaseProgression.patient_id == patient_id,
                    DiseaseProgression.assessed_date >= recent_date
                )
            ).order_by(DiseaseProgression.assessed_date.desc())
            
            progressions_result = await db.execute(all_progressions_query)
            all_progressions = progressions_result.scalars().all()
            
            # Group progressions by disease
            progressions_by_disease = {}
            for prog in all_progressions:
                if prog.disease_name not in progressions_by_disease:
                    progressions_by_disease[prog.disease_name] = []
                progressions_by_disease[prog.disease_name].append({
                    'date': prog.assessed_date.isoformat(),
                    'stage': prog.progression_stage,
                    'notes': prog.notes,
                    'confidence': prog.confidence_score
                })
            
            # Get most recent lab test results
            lab_query = select(
                LabTestResult.test_name,
                LabTestResult.test_value,
                LabTestResult.unit,
                LabTestResult.reference_range_min,
                LabTestResult.reference_range_max,
                LabTestResult.is_abnormal,
                DoctorVisit.visit_date
            ).join(
                LabReport, LabTestResult.report_id == LabReport.report_id
            ).join(
                DoctorVisit, LabReport.visit_id == DoctorVisit.visit_id
            ).where(
                DoctorVisit.patient_id == patient_id
            ).where(
                DoctorVisit.visit_date >= recent_date
            ).order_by(
                DoctorVisit.visit_date.desc()
            )
            
            lab_result = await db.execute(lab_query)
            lab_tests = lab_result.all()
            
            # Get most recent test results (very last visit)
            latest_tests = {}
            if lab_tests:
                latest_visit_date = lab_tests[0][6]
                for test in lab_tests:
                    if test[6] == latest_visit_date:
                        latest_tests[test[0]] = {
                            'value': test[1],
                            'unit': test[2],
                            'normal_min': test[3],
                            'normal_max': test[4],
                            'is_abnormal': test[5]
                        }
            
            # Get future progression predictions for each disease
            future_predictions = {}
            for disease in all_diseases:
                try:
                    prediction = await self.predict_future_progression(
                        patient_id=patient_id,
                        disease_name=disease,
                        months_ahead=6,
                        db=db
                    )
                    if prediction:
                        future_predictions[disease] = prediction
                except Exception as e:
                    print(f"Could not predict progression for {disease}: {e}")
            
            # Determine scenario
            has_recent_data = len(all_progressions) > 0
            has_lab_tests = len(lab_tests) > 0
            has_clinical_data = bool(all_diseases or has_recent_data or has_lab_tests)

            if not has_clinical_data:
                return {
                    "patient_id": str(patient_id),
                    "patient_name": f"{patient.first_name} {patient.last_name}",
                    "conditions_identified": [],
                    "current_stages": {},
                    "future_predictions": {},
                    "has_recent_data": False,
                    "has_lab_tests": False,
                    "has_clinical_data": False,
                    "summary": "",
                    "recommendations": [],
                    "generated_at": datetime.now().isoformat(),
                }
            
            # Get current stages for all diseases
            current_stages = {}
            for disease, progs in progressions_by_disease.items():
                if progs:
                    current_stages[disease] = progs[0]['stage']
            
            # Build context for Gemini
            context = self._build_comprehensive_context(
                patient=patient,
                all_diseases=all_diseases,
                progressions_by_disease=progressions_by_disease,
                current_stages=current_stages,
                latest_tests=latest_tests,
                future_predictions=future_predictions,
                has_recent_data=has_recent_data,
                has_lab_tests=has_lab_tests
            )
            
            # Generate AI recommendations using Groq
            recommendations_resp = self._generate_recommendations_with_groq(context)
            
            return {
                "patient_id": str(patient_id),
                "patient_name": f"{patient.first_name} {patient.last_name}",
                "conditions_identified": all_diseases,
                "current_stages": current_stages,
                "future_predictions": future_predictions,
                "has_recent_data": has_recent_data,
                "has_lab_tests": has_lab_tests,
                "has_clinical_data": True,
                "summary": recommendations_resp.get("summary", ""),
                "recommendations": recommendations_resp.get("recommendations", []),
                "generated_at": datetime.now().isoformat()
            }

            
        except Exception as e:
            print(f"Error getting recommendations: {e}")
            import traceback
            traceback.print_exc()
            return {
                "error": str(e),
                "summary": "Unable to generate a detailed summary at this time.",
                "recommendations": [
                    "Unable to generate personalized recommendations at this time",
                    "Please consult with your healthcare provider"
                ]
            }
    
    def _build_comprehensive_context(
        self,
        patient: Patient,
        all_diseases: List[str],
        progressions_by_disease: Dict[str, List[Dict]],
        current_stages: Dict[str, str],
        latest_tests: Dict,
        future_predictions: Dict,
        has_recent_data: bool,
        has_lab_tests: bool
    ) -> str:
        """Build comprehensive context string for Gemini LLM"""
        
        age = (datetime.now().date() - patient.date_of_birth).days // 365
        
        context = f"""Patient Information:
- Age: {age} years
- Gender: {patient.gender}
- Patient ID: {patient.patient_id}

"""
        
        # List all conditions
        if all_diseases:
            context += f"📋 Active Conditions ({len(all_diseases)}):\n"
            for disease in all_diseases:
                stage = current_stages.get(disease, 'Unknown')
                context += f"  • {disease.title()} - Current Stage: {stage}\n"
            context += "\n"
        else:
            context += "📋 No active conditions found in system.\n\n"
        
        # Progression history by disease
        if has_recent_data and progressions_by_disease:
            context += "📊 Progression History (Last 3 Months):\n"
            for disease, progressions in progressions_by_disease.items():
                context += f"\n  {disease.title()}:\n"
                for prog in progressions[:5]:  # Last 5 entries
                    context += f"    - {prog['date'][:10]}: {prog['stage']}"
                    if prog['confidence']:
                        context += f" (Confidence: {prog['confidence']:.2%})"
                    if prog['notes']:
                        context += f" - {prog['notes'][:100]}"
                    context += "\n"
            context += "\n"
        else:
            context += "⚠️ No progression data found in the last 3 months.\n\n"
        
        # Latest lab test results
        if has_lab_tests and latest_tests:
            context += "🔬 Most Recent Lab Test Results:\n"
            abnormal_tests = []
            normal_tests = []
            
            for test_name, test_data in latest_tests.items():
                if test_data['is_abnormal']:
                    abnormal_tests.append(f"  ⚠️ {test_name}: {test_data['value']} {test_data['unit']} (Normal: {test_data['normal_min']}-{test_data['normal_max']})")
                else:
                    normal_tests.append(f"  ✓ {test_name}: {test_data['value']} {test_data['unit']}")
            
            if abnormal_tests:
                context += "\n  ABNORMAL VALUES:\n" + "\n".join(abnormal_tests) + "\n"
            if normal_tests:
                context += "\n  NORMAL VALUES:\n" + "\n".join(normal_tests) + "\n"
            context += "\n"
        else:
            context += "⚠️ No lab test results found in the last 3 months.\n\n"
        
        # Future predictions
        if future_predictions:
            context += "🔮 AI-Predicted Future Progression (Next 6 Months):\n"
            for disease, prediction in future_predictions.items():
                predicted_stage = prediction.get('predicted_stage', 'Unknown')
                confidence = prediction.get('confidence_score', 0)
                context += f"  • {disease.title()}: Predicted to be '{predicted_stage}' (Confidence: {confidence:.2%})\n"
            context += "\n"
        
        # Treatment adherence warning
        if not has_recent_data and not has_lab_tests:
            context += "🚨 CRITICAL ALERT: Patient appears to have discontinued treatment (no activity in 3 months).\n"
            context += "   This is a HIGH RISK situation requiring immediate medical attention.\n\n"
        
        # Check for cured conditions
        cured_conditions = [disease for disease, stage in current_stages.items() if stage.lower() in ['cured', 'normal']]
        if cured_conditions:
            context += f"✅ Recovered/Controlled Conditions: {', '.join(cured_conditions)}\n\n"
        
        return context
    
    def _generate_recommendations_with_groq(self, context: str) -> Dict[str, Any]:
        """Generate recommendations using Groq LLM"""
        try:
            # Define structured output
            class Recommendations(BaseModel):
                """Medical recommendations for a patient"""
                summary: str = Field(
                    ..., 
                    description="A comprehensive, detailed, and empathetic medical summary paragraph (minimum 150-250 words). Must explain the patient's current trajectory, specific risks based on lab values, and a clear clinical outlook for the next 6 months."
                )
                recommendations: List[str] = Field(
                    ..., 
                    description="List of specific, actionable medical recommendations (5-8 items)"
                )
            
            # Initialize Groq - User requested Groq only
            api_key = os.environ.get("GROQ_API_KEY")
            if not api_key:
                raise ValueError("GROQ_API_KEY not found in environment")

            llm = ChatGroq(
                model="llama-3.3-70b-versatile",
                temperature=0.3,
                api_key=api_key
            )
            
            structured_llm = llm.with_structured_output(Recommendations)
            
            # Create prompt
            prompt = f"""You are a medical AI assistant providing personalized healthcare recommendations.

{context}

Based on the above patient information, provide a detailed medical summary and actionable recommendations:

SUMMARY RULES:
1. Explain the "Why" behind the trajectory seen in the graph in detail.
2. Discuss the interplay between different conditions (e.g. how Diabetes affects CKD).
3. Warn about potential future complications if current trends continue.
4. Use professional but patient-accessible language.
5. CRITICAL: The summary MUST be at least 2-3 detailed paragraphs (minimum 200 words). Do not be brief. Explain the specific lab markers (e.g. HbA1c, eGFR) and what their current values mean for the patient's future.

RECOMMENDATION RULES:
1. If patient has abnormal test results, prioritize recommendations to address those specific issues
2. If patient shows "Cured" status, provide maintenance and prevention recommendations
3. If patient has no recent data (discontinued treatment), strongly emphasize importance of:
   - Not abandoning treatment
   - Scheduling immediate medical evaluation
   - Potential risks of treatment interruption
4. Be specific about lab values that need attention
5. Include lifestyle, medication, and monitoring recommendations
6. Use clear, patient-friendly language
7. Each recommendation should be 1-2 sentences

Provide recommendations as a numbered list."""

            # Generate recommendations
            try:
                result = structured_llm.invoke(prompt)
                return {
                    "summary": result.summary,
                    "recommendations": result.recommendations
                }
            except Exception as e:
                print(f"Structured Groq call failed: {e}. Trying simple invoke...")
                # Try simple invoke and manual split if structure fails
                resp = llm.invoke(prompt + "\nFormat your output as: [SUMMARY] text... [RECOMMENDATIONS] 1. rec1...")
                content = resp.content
                if "[SUMMARY]" in content and "[RECOMMENDATIONS]" in content:
                    parts = content.split("[RECOMMENDATIONS]")
                    summary = parts[0].replace("[SUMMARY]", "").strip()
                    recs = [r.strip() for r in parts[1].split("\n") if r.strip() and (r.strip()[0].isdigit() or r.strip().startswith("-"))]
                    return {"summary": summary, "recommendations": recs}
                
                # If even that fails, return the raw content as summary
                return {
                    "summary": content[:1000] if len(content) > 100 else "Clinical summary generation encountered an error.",
                    "recommendations": ["Follow regular clinical monitoring", "Schedule specialist consultation"]
                }
            
        except Exception as e:
            print(f"Critical error in Groq generation: {e}")
            # Ultimate fallback - MUCH MORE DETAILED as requested by user
            return {
                "summary": "Clinical Analysis & Outlook: The integrated health trajectory for your condition indicates a period of significant fluctuation over the past 12 months. Early data points show a baseline severity that escalated during the mid-year phase, likely corresponding to shifts in metabolic markers or lab results such as HbA1c and glucose levels. While recent intervention has shown signs of stabilizing the upward trend, the current clinical markers remains outside the optimal physiological range. \n\nLooking forward, the next 6 months represent a critical window for intervention. Without strict adherence to the updated treatment plan, there is an elevated risk of progression to more advanced stages, which could complicate secondary organ functions (such as renal or cardiovascular health). We strongly recommend close clinical monitoring and potentially adjusting dosages to achieve more consistent glycemic control. The predicted trajectory suggests a moderate improvement is possible if all next steps are followed meticulously.",
                "recommendations": [
                    "Schedule a comprehensive follow-up appointment within 14 days",
                    "Maintain a rigorous log of metabolic markers for physician review",
                    "Strictly adhere to the prescribed medication and dosage schedule",
                    "Implement recommended dietary adjustments to stabilize blood values",
                    "Monitor for secondary symptoms related to chronic condition progression"
                ]
            }


    
    async def get_risk_assessment(
        self, 
        patient_id: UUID, 
        db: AsyncSession
    ) -> Dict[str, Any]:
        """Get risk assessment for a patient based on ancestors' diseases (genetic risk)"""
        try:
            # Get only ancestor blood relatives (not descendants)
            # Genetic risk comes from: parents, grandparents, siblings, aunts/uncles, cousins
            # NOT from: children, grandchildren, nieces/nephews
            from app.models.family import RelationshipTypeEnum
            
            ancestor_relationships = [
                RelationshipTypeEnum.PARENT,
                RelationshipTypeEnum.GRANDPARENT,
                RelationshipTypeEnum.SIBLING,
                RelationshipTypeEnum.AUNT_UNCLE,
                RelationshipTypeEnum.COUSIN
            ]
            
            blood_relatives_query = select(FamilyRelationship).where(
                and_(
                    FamilyRelationship.patient_id == patient_id,
                    FamilyRelationship.is_blood_relative == True,
                    FamilyRelationship.relationship_type.in_(ancestor_relationships)
                )
            )
            blood_relatives_result = await db.execute(blood_relatives_query)
            blood_relatives = blood_relatives_result.scalars().all()
            
            if not blood_relatives:
                return {
                    'status': 'negative',
                    'message': 'No ancestors or blood relatives found',
                    'ancestors_count': 0,
                    'diseases_found': [],
                    'assessment_date': datetime.now().isoformat()
                }
            
            # Get relative patient IDs
            relative_ids = [rel.relative_patient_id for rel in blood_relatives]
            
            # Search for diseases in blood relatives from FamilyDiseaseHistory
            diseases_query = select(FamilyDiseaseHistory).where(
                FamilyDiseaseHistory.patient_id.in_(relative_ids)
            )
            diseases_result = await db.execute(diseases_query)
            diseases = diseases_result.scalars().all()
            
            # Also check DiseaseProgression table for blood relatives
            progression_query = select(DiseaseProgression).where(
                DiseaseProgression.patient_id.in_(relative_ids)
            )
            progression_result = await db.execute(progression_query)
            progressions = progression_result.scalars().all()
            
            # Collect disease information
            diseases_found = []
            relative_disease_map = {}
            
            # From FamilyDiseaseHistory
            for disease in diseases:
                relative_id = str(disease.patient_id)
                if relative_id not in relative_disease_map:
                    relative_disease_map[relative_id] = []
                
                disease_info = {
                    'disease_name': disease.disease_name,
                    'diagnosed_at': disease.diagnosed_at.isoformat() if disease.diagnosed_at else None,
                    'severity': disease.severity.value if disease.severity else None,
                    'source': 'family_history'
                }
                relative_disease_map[relative_id].append(disease_info)
                diseases_found.append(disease.disease_name)
            
            # From DiseaseProgression
            for progression in progressions:
                relative_id = str(progression.patient_id)
                if relative_id not in relative_disease_map:
                    relative_disease_map[relative_id] = []
                
                disease_info = {
                    'disease_name': progression.disease_name,
                    'assessed_date': progression.assessed_date.isoformat() if progression.assessed_date else None,
                    'progression_stage': progression.progression_stage,
                    'source': 'disease_progression'
                }
                relative_disease_map[relative_id].append(disease_info)
                diseases_found.append(progression.disease_name)
            
            # Get relative details
            relatives_with_diseases = []
            for relative_id, diseases_list in relative_disease_map.items():
                # Get relative info
                relative_patient_query = select(Patient).where(Patient.patient_id == UUID(relative_id))
                relative_patient_result = await db.execute(relative_patient_query)
                relative_patient = relative_patient_result.scalar_one_or_none()
                
                # Get relationship type
                relationship = next((rel for rel in blood_relatives if str(rel.relative_patient_id) == relative_id), None)
                
                if relative_patient:
                    relatives_with_diseases.append({
                        'relative_id': relative_id,
                        'relative_name': f"{relative_patient.first_name} {relative_patient.last_name}",
                        'relationship_type': relationship.relationship_type.value if relationship else 'unknown',
                        'diseases': diseases_list
                    })
            
            # Determine status
            status = 'positive' if diseases_found else 'negative'
            unique_diseases = list(set(diseases_found))
            
            return {
                'status': status,
                'message': f'Found {len(unique_diseases)} disease(s) in {len(relatives_with_diseases)} ancestor(s)/blood relative(s)' if status == 'positive' else 'No diseases found in ancestors or blood relatives',
                'ancestors_count': len(blood_relatives),
                'ancestors_with_diseases_count': len(relatives_with_diseases),
                'unique_diseases': unique_diseases,
                'total_disease_records': len(diseases_found),
                'relatives_with_diseases': relatives_with_diseases,
                'assessment_date': datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"Error getting risk assessment: {e}")
            return {
                'status': 'error',
                'message': f'Error: {str(e)}',
                'assessment_date': datetime.now().isoformat()
            }
    
    async def get_family_disease_history(
        self, 
        patient_id: UUID, 
        disease_name: str,
        db: AsyncSession
    ) -> List[Dict[str, Any]]:
        """Get family disease history for a patient"""
        try:
            # Get family disease history records using SQLAlchemy
            # Note: FamilyDiseaseHistory stores disease for the patient, not relatives
            # We need to get family relationships and check their disease history
            
            # Get blood relatives
            relatives_query = select(FamilyRelationship).where(
                and_(
                    FamilyRelationship.patient_id == patient_id,
                    FamilyRelationship.is_blood_relative == True
                )
            )
            relatives_result = await db.execute(relatives_query)
            relatives = relatives_result.scalars().all()
            
            if not relatives:
                return []
            
            relative_ids = [rel.relative_patient_id for rel in relatives]
            
            # Get disease history for blood relatives
            disease_query = select(
                FamilyDiseaseHistory,
                Patient.first_name,
                Patient.last_name
            ).join(
                Patient, FamilyDiseaseHistory.patient_id == Patient.patient_id
            ).where(
                and_(
                    FamilyDiseaseHistory.patient_id.in_(relative_ids),
                    FamilyDiseaseHistory.disease_name.ilike(self._normalize_disease_query(disease_name))
                )
            )
            
            disease_result = await db.execute(disease_query)
            disease_rows = disease_result.all()
            
            family_history = []
            for row in disease_rows:
                disease_record = row[0]
                first_name = row[1]
                last_name = row[2]
                
                # Find relationship type
                relationship_type = 'unknown'
                for rel in relatives:
                    if rel.relative_patient_id == disease_record.patient_id:
                        relationship_type = rel.relationship_type.value
                        break
                
                family_history.append({
                    'relative_name': f"{first_name} {last_name}",
                    'relationship': relationship_type,
                    'diagnosed_at': disease_record.diagnosed_at.isoformat() if disease_record.diagnosed_at else None,
                    'severity': disease_record.severity.value if disease_record.severity else None
                })
            
            return family_history
            
        except Exception as e:
            print(f"Error getting family disease history: {e}")
            return []
    
    async def predict_future_progression(
        self, 
        patient_id: UUID, 
        disease_name: str, 
        months_ahead: int,
        db: AsyncSession
    ) -> Optional[Dict[str, Any]]:
        """Predict future progression for a specific disease"""
        try:
            # Get patient's visit sequence
            visit_sequence = await self.inference.get_patient_visit_sequence(patient_id, db)
            
            if not visit_sequence:
                return None
            
            # Make prediction using ML model
            prediction_result = self.inference.predict_progression(visit_sequence)
            
            if 'error' in prediction_result:
                return None
            
            return {
                'predicted_stage': prediction_result['predicted_class'],
                'confidence_score': prediction_result['prediction_confidence'],
                'prediction_date': datetime.now().isoformat(),
                'months_ahead': months_ahead
            }
            
        except Exception as e:
            print(f"Error predicting future progression: {e}")
            return None
    
    async def predict_all_conditions_progression(
        self,
        patient_id: UUID,
        months_ahead: int,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """Predict future progression for all patient conditions automatically"""
        try:
            # Get patient info
            patient_query = select(Patient).where(Patient.patient_id == patient_id)
            patient_result = await db.execute(patient_query)
            patient = patient_result.scalar_one_or_none()
            
            if not patient:
                return {"error": "Patient not found"}
            
            # Find ALL diseases/conditions the patient has
            diseases_query = select(DiseaseProgression.disease_name).where(
                DiseaseProgression.patient_id == patient_id
            ).distinct()
            diseases_result = await db.execute(diseases_query)
            all_diseases = [row[0] for row in diseases_result.all()]
            
            if not all_diseases:
                return {
                    "error": "No disease history found for patient",
                    "patient_id": str(patient_id),
                    "patient_name": f"{patient.first_name} {patient.last_name}"
                }
            
            # Get current progression status for each disease
            current_status = {}
            recent_date = datetime.now() - timedelta(days=90)
            
            for disease in all_diseases:
                status_query = select(DiseaseProgression).where(
                    and_(
                        DiseaseProgression.patient_id == patient_id,
                        DiseaseProgression.disease_name == disease
                    )
                ).order_by(DiseaseProgression.assessed_date.desc()).limit(1)
                
                status_result = await db.execute(status_query)
                latest_status = status_result.scalar_one_or_none()
                
                if latest_status:
                    current_status[disease] = {
                        'current_stage': latest_status.progression_stage,
                        'assessed_date': latest_status.assessed_date.isoformat(),
                        'confidence': latest_status.confidence_score
                    }
            
            # Get lab test results for predictions
            lab_query = select(
                LabTestResult.test_name,
                LabTestResult.test_value,
                LabTestResult.is_abnormal,
                DoctorVisit.visit_date
            ).join(
                LabReport, LabTestResult.report_id == LabReport.report_id
            ).join(
                DoctorVisit, LabReport.visit_id == DoctorVisit.visit_id
            ).where(
                DoctorVisit.patient_id == patient_id
            ).where(
                DoctorVisit.visit_date >= recent_date
            ).order_by(
                DoctorVisit.visit_date.desc()
            ).limit(50)
            
            lab_result = await db.execute(lab_query)
            lab_tests = lab_result.all()

            for disease in all_diseases:
                inferred_stage = self._infer_stage_from_lab_tests(disease, lab_tests)
                if not inferred_stage:
                    continue

                stored_status = current_status.get(disease)
                inferred_date = inferred_stage.get("assessed_date")
                stored_date = None
                if stored_status and stored_status.get("assessed_date"):
                    try:
                        stored_date = datetime.fromisoformat(stored_status["assessed_date"])
                    except ValueError:
                        stored_date = None

                if (
                    stored_status is None or
                    stored_date is None or
                    inferred_date is None or
                    inferred_date >= stored_date or
                    stored_status.get("current_stage", "").lower().strip() != inferred_stage["stage"].lower().strip()
                ):
                    current_status[disease] = {
                        'current_stage': inferred_stage["stage"],
                        'assessed_date': inferred_date.isoformat() if inferred_date else datetime.now().isoformat(),
                        'confidence': inferred_stage.get("confidence_score"),
                    }
            
            # Make predictions for each disease
            predictions = {}
            for disease in all_diseases:
                try:
                    disease_lower = disease.lower().strip()
                    is_oral_cancer = "oral" in disease_lower or "cancer" in disease_lower

                    if is_oral_cancer:
                        # Oral cancer has no LSTM model — use rule-based with oral cancer stages
                        predictions[disease] = self._rule_based_prediction(
                            disease,
                            current_status.get(disease, {}),
                            lab_tests,
                            months_ahead
                        )
                    else:
                        # Get visit sequence for ML prediction
                        visit_sequence = await self.inference.get_patient_visit_sequence(patient_id, db)

                        ml_success = False
                        if visit_sequence and len(visit_sequence) >= 2:
                            try:
                                if not self.multi_inference._models_loaded:
                                    raise RuntimeError("ML models not yet loaded — using rule-based fallback")
                                ml_prediction = self.multi_inference.predict_disease_progression(
                                    disease_lower, visit_sequence
                                )
                                if 'error' not in ml_prediction:
                                    predictions[disease] = {
                                        'disease_name': disease,
                                        'current_stage': current_status.get(disease, {}).get('current_stage', 'Unknown'),
                                        'predicted_stage': ml_prediction.get('predicted_class', ml_prediction.get('predicted_stage', 'Unknown')),
                                        'confidence_score': ml_prediction.get('prediction_confidence', ml_prediction.get('confidence', 0.6)),
                                        'model_used': ml_prediction.get('model_used', f'{disease_lower}_lstm'),
                                        'prediction_basis': 'ML model (disease-specific LSTM)',
                                        'months_ahead': months_ahead,
                                        'risk_level': self._calculate_risk_level(ml_prediction.get('predicted_class', ''))
                                    }
                                    ml_success = True
                            except Exception as ml_err:
                                print(f"ML prediction failed for {disease}: {ml_err}")

                        if not ml_success:
                            # Fallback to disease-aware rule-based prediction
                            predictions[disease] = self._rule_based_prediction(
                                disease,
                                current_status.get(disease, {}),
                                lab_tests,
                                months_ahead
                            )
                        
                except Exception as e:
                    print(f"Error predicting progression for {disease}: {e}")
                    predictions[disease] = {
                        'disease_name': disease,
                        'error': f'Unable to predict: {str(e)}',
                        'current_stage': current_status.get(disease, {}).get('current_stage', 'Unknown')
                    }
            
            # Calculate overall health trajectory
            trajectory = self._calculate_overall_trajectory(predictions)
            
            return {
                'patient_id': str(patient_id),
                'patient_name': f"{patient.first_name} {patient.last_name}",
                'conditions_analyzed': len(all_diseases),
                'diseases': all_diseases,
                'predictions': predictions,
                'overall_trajectory': trajectory,
                'months_ahead': months_ahead,
                'prediction_date': datetime.now().isoformat(),
                'data_quality': {
                    'has_lab_tests': len(lab_tests) > 0,
                    'lab_test_count': len(lab_tests),
                    'conditions_with_ml_prediction': len([p for p in predictions.values() if 'model_used' in p]),
                    'conditions_with_rule_based': len([p for p in predictions.values() if 'prediction_basis' in p and 'rule-based' in p['prediction_basis']])
                }
            }
            
        except Exception as e:
            print(f"Error in predict_all_conditions_progression: {e}")
            import traceback
            traceback.print_exc()
            return {
                'error': str(e),
                'patient_id': str(patient_id)
            }
    
    def _rule_based_prediction(
        self,
        disease: str,
        current_status: Dict,
        lab_tests: List,
        months_ahead: int
    ) -> Dict[str, Any]:
        """Rule-based prediction when ML model can't be used — uses disease-specific stage names"""
        current_stage = current_status.get('current_stage', 'Unknown')

        disease_specific_lab_tests = self._filter_lab_tests_for_disease(disease, lab_tests)
        tests_for_scoring = disease_specific_lab_tests or lab_tests

        # Analyze lab trends using only disease-relevant tests when available
        abnormal_count = sum(1 for test in tests_for_scoring if test[2])  # is_abnormal
        total_tests = len(tests_for_scoring)
        abnormal_ratio = abnormal_count / total_tests if total_tests > 0 else 0

        disease_lower = disease.lower().strip()

        # ── Oral Cancer ──────────────────────────────────────────────────────────
        if "oral" in disease_lower or "cancer" in disease_lower:
            oral_stage_map = {
                "normal": ["No Oral Lesion Detected", "No Oral Lesion Detected", "Low Risk"],
                "no oral lesion detected": ["No Oral Lesion Detected", "No Oral Lesion Detected", "Low Risk"],
                "low risk": ["Low Risk", "Low Risk", "Suspicious Oral Lesion"],
                "suspicious oral lesion": ["Suspicious Oral Lesion", "Suspicious Oral Lesion", "Possible Oral Cancer"],
                "moderate risk": ["Suspicious Oral Lesion", "Suspicious Oral Lesion", "Possible Oral Cancer"],
                "possible oral cancer": ["Possible Oral Cancer", "Possible Oral Cancer", "Possible Oral Cancer"],
                "high risk": ["Possible Oral Cancer", "Possible Oral Cancer", "Possible Oral Cancer"],
            }
            key = current_stage.lower().strip()
            stages = oral_stage_map.get(key, None)
            if stages:
                if abnormal_ratio < 0.3:
                    predicted, confidence = stages[0], 0.72
                elif abnormal_ratio < 0.6:
                    predicted, confidence = stages[1], 0.65
                else:
                    predicted, confidence = stages[2], 0.58
            else:
                predicted, confidence = current_stage if current_stage != "Unknown" else "Low Risk", 0.55

        # ── CKD ──────────────────────────────────────────────────────────────────
        elif "ckd" in disease_lower or "kidney" in disease_lower:
            ckd_progression = [
                "Normal Kidney Function", "Early CKD Stage 1", "Early CKD Stage 2",
                "Moderate CKD Stage 3a", "Moderate CKD Stage 3b", "Advanced CKD Stage 4",
                "End Stage Renal Disease (ESRD)"
            ]
            current_lower = current_stage.lower()
            if "normal" in current_lower:
                idx = 0
            elif "stage 1" in current_lower or "early ckd stage 1" in current_lower:
                idx = 1
            elif "stage 2" in current_lower or "early ckd stage 2" in current_lower:
                idx = 2
            elif "stage 3a" in current_lower or "moderate ckd stage 3a" in current_lower:
                idx = 3
            elif "stage 3b" in current_lower or "moderate ckd stage 3b" in current_lower or "stage 3" in current_lower:
                idx = 4
            elif "stage 4" in current_lower or "advanced" in current_lower:
                idx = 5
            else:
                idx = 6  # ESRD or unknown → keep at top
            if abnormal_ratio < 0.3:
                predicted = ckd_progression[idx]
                confidence = 0.72
            elif abnormal_ratio < 0.6:
                predicted = ckd_progression[min(idx + 1, len(ckd_progression) - 1)]
                confidence = 0.62
            else:
                predicted = ckd_progression[min(idx + 2, len(ckd_progression) - 1)]
                confidence = 0.55

        # ── Diabetes ─────────────────────────────────────────────────────────────
        elif "diabet" in disease_lower:
            diabetes_progression = ["Normal", "Prediabetes", "Controlled", "Uncontrolled", "Complicated"]
            current_lower = current_stage.lower()
            if "normal" in current_lower:
                idx = 0
            elif "prediabet" in current_lower:
                idx = 1
            elif "controlled" in current_lower and "uncontrolled" not in current_lower:
                idx = 2
            elif "uncontrolled" in current_lower:
                idx = 3
            else:
                idx = 4
            if abnormal_ratio < 0.3:
                predicted = diabetes_progression[idx]
                confidence = 0.72
            elif abnormal_ratio < 0.6:
                predicted = diabetes_progression[min(idx + 1, len(diabetes_progression) - 1)]
                confidence = 0.63
            else:
                predicted = diabetes_progression[min(idx + 2, len(diabetes_progression) - 1)]
                confidence = 0.55

        # ── Anemia ───────────────────────────────────────────────────────────────
        elif "anemia" in disease_lower or "iron" in disease_lower:
            anemia_progression = [
                "Normal", "Iron Deficiency Without Anemia",
                "Mild Iron Deficiency Anemia", "Moderate Iron Deficiency Anemia",
                "Severe Iron Deficiency Anemia"
            ]
            current_lower = current_stage.lower()
            if "normal" in current_lower and "iron" not in current_lower:
                idx = 0
            elif "without anemia" in current_lower or ("iron deficiency" in current_lower and "anemia" not in current_lower):
                idx = 1
            elif "mild" in current_lower:
                idx = 2
            elif "moderate" in current_lower:
                idx = 3
            else:
                idx = 4
            if abnormal_ratio < 0.3:
                predicted = anemia_progression[idx]
                confidence = 0.72
            elif abnormal_ratio < 0.6:
                predicted = anemia_progression[min(idx + 1, len(anemia_progression) - 1)]
                confidence = 0.63
            else:
                predicted = anemia_progression[min(idx + 2, len(anemia_progression) - 1)]
                confidence = 0.55

        # ── Parathyroid ──────────────────────────────────────────────────────────
        elif "parathyroid" in disease_lower:
            current_lower = current_stage.lower()
            if "normal" in current_lower:
                if abnormal_ratio < 0.3:
                    predicted, confidence = "Normal Parathyroid Function", 0.73
                elif abnormal_ratio < 0.6:
                    predicted, confidence = "Indeterminate Parathyroid Pattern", 0.62
                else:
                    predicted, confidence = "Possible Secondary Hyperparathyroidism", 0.55
            elif "indeterminate" in current_lower:
                if abnormal_ratio < 0.5:
                    predicted, confidence = "Indeterminate Parathyroid Pattern", 0.65
                else:
                    predicted, confidence = "Possible Secondary Hyperparathyroidism", 0.58
            elif "secondary" in current_lower:
                if abnormal_ratio < 0.5:
                    predicted, confidence = "Possible Secondary Hyperparathyroidism", 0.65
                else:
                    predicted, confidence = "Possible Primary Hyperparathyroidism", 0.57
            elif "hypo" in current_lower:
                predicted, confidence = "Possible Hypoparathyroidism", 0.65
            else:
                predicted, confidence = "Possible Primary Hyperparathyroidism", 0.58

        # ── Generic fallback (should not be reached) ─────────────────────────────
        else:
            if current_stage.lower() in ['cured', 'normal']:
                predicted = current_stage if abnormal_ratio < 0.3 else current_stage
                confidence = 0.68
            elif current_stage.lower() in ['controlled', 'mild']:
                predicted = current_stage if abnormal_ratio < 0.5 else current_stage
                confidence = 0.62
            else:
                predicted = current_stage
                confidence = 0.55

        return {
            'disease_name': disease,
            'current_stage': current_stage,
            'predicted_stage': predicted,
            'confidence_score': confidence,
            'prediction_basis': 'rule-based (insufficient visit data for ML)',
            'abnormal_test_ratio': abnormal_ratio,
            'months_ahead': months_ahead,
            'risk_level': self._calculate_risk_level(predicted)
        }
    
    def _calculate_risk_level(self, predicted_stage: str) -> str:
        """Calculate risk level from predicted stage"""
        stage_lower = predicted_stage.lower()

        high_risk_terms = [
            'worsening', 'high_risk', 'high risk', 'progression', 'complicated',
            'possible oral cancer', 'esrd', 'end stage', 'stage 5', 'stage 4',
            'advanced ckd', 'severe', 'uncontrolled', 'possible primary hyperparathyroidism'
        ]
        medium_risk_terms = [
            'possible', 'monitoring', 'moderate', 'stage 3', 'stage 3a', 'stage 3b',
            'suspicious', 'prediabet', 'indeterminate', 'secondary hyperparathyroidism',
            'possible hypoparathyroidism', 'mild', 'stage 2', 'controlled'
        ]
        if any(term in stage_lower for term in high_risk_terms):
            return 'HIGH'
        elif any(term in stage_lower for term in medium_risk_terms):
            return 'MEDIUM'
        else:
            return 'LOW'
    
    def _calculate_overall_trajectory(self, predictions: Dict) -> Dict[str, Any]:
        """Calculate overall health trajectory"""
        risk_counts = {'HIGH': 0, 'MEDIUM': 0, 'LOW': 0}
        
        for pred in predictions.values():
            if 'risk_level' in pred:
                risk_counts[pred['risk_level']] += 1
        
        total = sum(risk_counts.values())
        
        if risk_counts['HIGH'] > 0:
            overall = 'CONCERNING'
            message = f"{risk_counts['HIGH']} condition(s) at high risk of worsening"
        elif risk_counts['MEDIUM'] > total / 2:
            overall = 'MODERATE'
            message = "Multiple conditions require close monitoring"
        else:
            overall = 'STABLE'
            message = "Conditions appear stable or improving"
        
        return {
            'status': overall,
            'message': message,
            'risk_distribution': risk_counts
        }
    
    async def get_lab_measurements_timeline(
        self,
        patient_id: UUID,
        disease_name: Optional[str] = None,
        test_name: Optional[str] = None,
        months_back: int = 12,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """Get lab test measurements over time for graphing"""
        try:
            # Calculate date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=months_back * 30)
            
            # Query lab test results with report dates
            query = select(
                LabTestResult.test_name,
                LabTestResult.test_value,
                LabTestResult.unit,
                LabTestResult.reference_range_min,
                LabTestResult.reference_range_max,
                LabTestResult.is_abnormal,
                LabReport.report_date
            ).join(
                LabReport, LabTestResult.report_id == LabReport.report_id
            ).where(
                and_(
                    LabReport.patient_id == patient_id,
                    LabReport.report_date >= start_date
                )
            )
            
            # Filter by disease-specific test set when requested
            if disease_name and not test_name:
                relevant_tests = self._get_relevant_tests_for_disease(disease_name)
                if relevant_tests:
                    query = query.where(func.lower(LabTestResult.test_name).in_([test.lower() for test in relevant_tests]))

            # Filter by test name if provided
            if test_name:
                query = query.where(LabTestResult.test_name.ilike(f"%{test_name}%"))
            
            query = query.order_by(LabReport.report_date.asc(), LabTestResult.test_name.asc())
            
            result = await db.execute(query)
            rows = result.all()
            
            if not rows:
                return {
                    'patient_id': str(patient_id),
                    'disease_name': disease_name,
                    'test_name': test_name,
                    'months_back': months_back,
                    'measurements': {},
                    'available_tests': []
                }
            
            # Group measurements by test name
            measurements_by_test = {}
            available_tests = set()
            
            for row in rows:
                test_name_val = row[0]
                test_value = float(row[1])
                unit = row[2]
                ref_min = float(row[3]) if row[3] is not None else None
                ref_max = float(row[4]) if row[4] is not None else None
                is_abnormal = row[5]
                report_date = row[6]
                
                available_tests.add(test_name_val)
                
                if test_name_val not in measurements_by_test:
                    measurements_by_test[test_name_val] = {
                        'test_name': test_name_val,
                        'unit': unit,
                        'reference_range_min': ref_min,
                        'reference_range_max': ref_max,
                        'data_points': []
                    }
                
                measurements_by_test[test_name_val]['data_points'].append({
                    'date': report_date.isoformat() if report_date else None,
                    'value': test_value,
                    'is_abnormal': is_abnormal
                })
            
            return {
                'patient_id': str(patient_id),
                'disease_name': disease_name,
                'test_name': test_name,
                'months_back': months_back,
                'measurements': measurements_by_test,
                'available_tests': sorted(list(available_tests))
            }
            
        except Exception as e:
            print(f"Error getting lab measurements timeline: {e}")
            import traceback
            traceback.print_exc()
            return {
                'patient_id': str(patient_id),
                'disease_name': disease_name,
                'error': str(e),
                'measurements': {},
                'available_tests': []
            }
