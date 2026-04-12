import base64
from typing import Any, Dict

import httpx

from app.core.config import get_settings


class OralCancerService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def detect_from_image(self, image_bytes: bytes) -> Dict[str, Any]:
        if not self.settings.ROBOFLOW_API_KEY:
            raise ValueError("ROBOFLOW_API_KEY is not configured")

        endpoint = (
            f"https://serverless.roboflow.com/"
            f"{self.settings.ROBOFLOW_ORAL_MODEL_ID}/{self.settings.ROBOFLOW_ORAL_MODEL_VERSION}"
        )
        payload = base64.b64encode(image_bytes).decode("utf-8")

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                endpoint,
                params={"api_key": self.settings.ROBOFLOW_API_KEY},
                content=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    def map_prediction_to_clinical_outcome(raw_prediction: Dict[str, Any]) -> Dict[str, Any]:
        predictions = raw_prediction.get("predictions") or []
        if not predictions:
            return {
                "diagnosis_label": "No Oral Lesion Detected",
                "progression_stage": "Normal",
                "confidence_score": 1.0,
                "top_class": "normal",
            }

        top_prediction = max(predictions, key=lambda p: float(p.get("confidence", 0.0)))
        top_class = str(top_prediction.get("class") or top_prediction.get("label") or "unknown")
        confidence = float(top_prediction.get("confidence", 0.0))
        cls = top_class.lower()

        if any(k in cls for k in ["cancer", "carcinoma", "malignant", "tumor"]):
            return {
                "diagnosis_label": "Possible Oral Cancer",
                "progression_stage": "High Risk",
                "confidence_score": confidence,
                "top_class": top_class,
            }

        if any(k in cls for k in ["precancer", "dysplasia", "leukoplakia", "erythroplakia", "lesion", "suspicious"]):
            return {
                "diagnosis_label": "Suspicious Oral Lesion",
                "progression_stage": "Moderate Risk",
                "confidence_score": confidence,
                "top_class": top_class,
            }

        return {
            "diagnosis_label": "No Oral Lesion Detected",
            "progression_stage": "Low Risk",
            "confidence_score": confidence,
            "top_class": top_class,
        }


oral_cancer_service = OralCancerService()

