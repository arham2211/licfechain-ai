from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID


class LoginRequest(BaseModel):
    username_or_email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    patient_id: Optional[UUID] = None
    role: str = Field(default="patient", pattern="^(admin|doctor|patient|lab)$")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class UserProfileResponse(BaseModel):
    user_id: UUID
    username: str
    email: str
    patient_id: Optional[UUID]
    roles: List[str]
    is_active: bool
    created_at: datetime
