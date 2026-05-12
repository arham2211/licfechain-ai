from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

from app.api.v1.dependencies import get_current_user, get_current_user_roles, require_roles
from app.db.session import get_db
from app.models.auth import User, UserRole
from app.schemas.auth import LoginRequest, PatientLoginRequest, RegisterRequest, TokenResponse, UserProfileResponse
from app.services.auth_service import auth_service
from app.services.email_service import send_credentials_email


router = APIRouter()


@router.post("/register", response_model=UserProfileResponse)
async def register_user(
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    # bootstrap behavior: if no users exist, allow first user as admin regardless of requested role
    total_users = (await db.execute(select(User.user_id))).first()
    requested_role = payload.role
    if total_users is None:
        requested_role = "admin"
    elif requested_role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin registration is restricted after bootstrap",
        )

    # uniqueness checks
    existing = await db.execute(
        select(User).where((User.username == payload.username) | (User.email == payload.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists")

    await auth_service.ensure_default_roles(db)
    role = await auth_service.get_or_create_role(db, requested_role)

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=auth_service.hash_password(payload.password),
        patient_id=payload.patient_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.user_id, role_id=role.role_id))
    await db.commit()
    await db.refresh(user)

    return UserProfileResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        patient_id=user.patient_id,
        roles=[role.name],
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await auth_service.authenticate_user(db, payload.username_or_email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    roles = await auth_service.get_user_roles(db, user.user_id)
    access_token, access_exp = auth_service.create_access_token(user.user_id, roles)
    refresh_token, refresh_exp = auth_service.create_refresh_token(user.user_id)
    await auth_service.persist_refresh_token(db, user.user_id, refresh_token, refresh_exp)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=int((access_exp - datetime.now(timezone.utc)).total_seconds()),
        refresh_expires_in=int((refresh_exp - datetime.now(timezone.utc)).total_seconds()),
    )


@router.post("/login/patient", response_model=TokenResponse)
async def patient_login(
    payload: PatientLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await auth_service.authenticate_patient_by_cnic(db, payload.cnic)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid CNIC")

    roles = await auth_service.get_user_roles(db, user.user_id)
    access_token, access_exp = auth_service.create_access_token(user.user_id, roles)
    refresh_token, refresh_exp = auth_service.create_refresh_token(user.user_id)
    await auth_service.persist_refresh_token(db, user.user_id, refresh_token, refresh_exp)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=int((access_exp - datetime.now(timezone.utc)).total_seconds()),
        refresh_expires_in=int((refresh_exp - datetime.now(timezone.utc)).total_seconds()),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    refresh_token = payload.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="refresh_token is required")

    try:
        decoded = auth_service.decode_token(refresh_token, expected_type="refresh")
        user_id = UUID(decoded["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    valid = await auth_service.validate_refresh_token(db, user_id, refresh_token)
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked or expired")

    await auth_service.revoke_refresh_token(db, refresh_token)
    roles = await auth_service.get_user_roles(db, user_id)
    access_token, access_exp = auth_service.create_access_token(user_id, roles)
    new_refresh_token, refresh_exp = auth_service.create_refresh_token(user_id)
    await auth_service.persist_refresh_token(db, user_id, new_refresh_token, refresh_exp)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=int((access_exp - datetime.now(timezone.utc)).total_seconds()),
        refresh_expires_in=int((refresh_exp - datetime.now(timezone.utc)).total_seconds()),
    )


@router.post("/logout")
async def logout(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = payload.get("refresh_token")
    if token:
        await auth_service.revoke_refresh_token(db, token)
    return {"message": f"User {user.username} logged out successfully"}


@router.get("/me", response_model=UserProfileResponse)
async def me(
    user: User = Depends(get_current_user),
    roles: list[str] = Depends(get_current_user_roles),
):
    return UserProfileResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        patient_id=user.patient_id,
        roles=roles,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.get("/users", dependencies=[Depends(require_roles("admin"))])
async def list_users(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return {"count": len(users), "users": [{"user_id": str(u.user_id), "username": u.username, "email": u.email} for u in users]}


class SendCredentialsRequest(BaseModel):
    name: str
    email: str
    username: str
    password: str
    role: str


@router.post("/send-credentials", dependencies=[Depends(require_roles("admin"))])
async def send_credentials_endpoint(payload: SendCredentialsRequest):
    """Send login credentials for a newly created doctor or lab user to the admin notification email."""
    sent = await send_credentials_email(
        name=payload.name,
        email=payload.email,
        username=payload.username,
        password=payload.password,
        role=payload.role,
    )
    return {"sent": sent}
