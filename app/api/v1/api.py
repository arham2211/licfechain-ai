from fastapi import APIRouter, Depends

from app.api.v1.endpoints import (
    auth, health, patients, doctors, visits, labs,
    proposal_placeholders,
    unified_inference, progression_report
)
from app.api.v1.dependencies import get_current_user, require_roles

api_router = APIRouter()

# Auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Health check
api_router.include_router(health.router, tags=["health"])

# Patient management
api_router.include_router(
    patients.router,
    prefix="/patients",
    tags=["patients"],
    dependencies=[Depends(get_current_user), Depends(require_roles("admin", "doctor", "patient", "lab"))],
)

# Doctor management
api_router.include_router(
    doctors.router,
    prefix="/doctors",
    tags=["doctors"],
    dependencies=[Depends(get_current_user), Depends(require_roles("admin", "doctor"))],
)

# Visit management
api_router.include_router(
    visits.router,
    prefix="/visits",
    tags=["visits"],
    dependencies=[Depends(get_current_user), Depends(require_roles("admin", "doctor", "patient"))],
)

# Lab management
api_router.include_router(
    labs.router,
    prefix="/labs",
    tags=["labs"],
    dependencies=[Depends(get_current_user), Depends(require_roles("admin", "doctor", "lab", "patient"))],
)

# ML Inference - Unified (supports all diseases)
api_router.include_router(
    unified_inference.router,
    prefix="/ml",
    tags=["ml-inference"],
    dependencies=[Depends(get_current_user), Depends(require_roles("admin", "doctor", "patient"))],
)

# Progression Reports
api_router.include_router(
    progression_report.router,
    prefix="/reports",
    tags=["progression-reports"],
    dependencies=[Depends(get_current_user), Depends(require_roles("admin", "doctor", "patient"))],
)

# Proposal placeholder adapters (OCR + Dental)
api_router.include_router(
    proposal_placeholders.router,
    prefix="/proposal",
    tags=["proposal-placeholders"],
    dependencies=[Depends(get_current_user), Depends(require_roles("admin", "doctor", "lab"))],
)


