from __future__ import annotations

import hashlib
import hmac
import secrets
import base64
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.auth import User, Role, UserRole, RefreshToken


class AuthService:
    def __init__(self):
        self.settings = get_settings()

    @staticmethod
    def hash_password(password: str) -> str:
        iterations = 310000
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii")
        digest_b64 = base64.urlsafe_b64encode(digest).decode("ascii")
        return f"pbkdf2_sha256${iterations}${salt_b64}${digest_b64}"

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        if password_hash.startswith("$2"):
            try:
                import bcrypt  # lazy import for compatibility with legacy hashes

                return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
            except Exception:
                return False
        if not password_hash.startswith("pbkdf2_sha256$"):
            return False
        try:
            _, iter_s, salt_b64, digest_b64 = password_hash.split("$", 3)
            iterations = int(iter_s)
            salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
            expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    async def ensure_default_roles(self, db: AsyncSession) -> None:
        defaults = [
            ("admin", "System administrator"),
            ("doctor", "Clinical doctor access"),
            ("patient", "Patient self access"),
            ("lab", "Laboratory operator"),
        ]
        for name, desc in defaults:
            q = await db.execute(select(Role).where(Role.name == name))
            role = q.scalar_one_or_none()
            if role is None:
                db.add(Role(name=name, description=desc))
        await db.commit()

    async def get_or_create_role(self, db: AsyncSession, role_name: str) -> Role:
        q = await db.execute(select(Role).where(Role.name == role_name))
        role = q.scalar_one_or_none()
        if role:
            return role
        role = Role(name=role_name, description=f"{role_name} role")
        db.add(role)
        await db.commit()
        await db.refresh(role)
        return role

    async def get_user_roles(self, db: AsyncSession, user_id: UUID) -> List[str]:
        q = await db.execute(
            select(Role.name)
            .join(UserRole, Role.role_id == UserRole.role_id)
            .where(UserRole.user_id == user_id)
        )
        return [row[0] for row in q.all()]

    def create_access_token(self, user_id: UUID, roles: List[str]) -> tuple[str, datetime]:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=self.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        payload = {
            "sub": str(user_id),
            "roles": roles,
            "type": "access",
            "iss": self.settings.JWT_ISSUER,
            "aud": self.settings.JWT_AUDIENCE,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        token = jwt.encode(payload, self.settings.SECRET_KEY, algorithm=self.settings.JWT_ALGORITHM)
        return token, expires_at

    def create_refresh_token(self, user_id: UUID) -> tuple[str, datetime]:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=self.settings.REFRESH_TOKEN_EXPIRE_DAYS)
        jti = secrets.token_urlsafe(24)
        payload = {
            "sub": str(user_id),
            "type": "refresh",
            "jti": jti,
            "iss": self.settings.JWT_ISSUER,
            "aud": self.settings.JWT_AUDIENCE,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        token = jwt.encode(payload, self.settings.SECRET_KEY, algorithm=self.settings.JWT_ALGORITHM)
        return token, expires_at

    def decode_token(self, token: str, expected_type: str) -> dict:
        try:
            payload = jwt.decode(
                token,
                self.settings.SECRET_KEY,
                algorithms=[self.settings.JWT_ALGORITHM],
                issuer=self.settings.JWT_ISSUER,
                audience=self.settings.JWT_AUDIENCE,
            )
            if payload.get("type") != expected_type:
                raise JWTError("Invalid token type")
            return payload
        except JWTError as e:
            raise ValueError(f"Invalid token: {str(e)}") from e

    async def persist_refresh_token(self, db: AsyncSession, user_id: UUID, refresh_token: str, expires_at: datetime) -> None:
        db.add(
            RefreshToken(
                user_id=user_id,
                token_hash=self.hash_token(refresh_token),
                expires_at=expires_at.replace(tzinfo=None),
                revoked=False,
            )
        )
        await db.commit()

    async def revoke_refresh_token(self, db: AsyncSession, refresh_token: str) -> None:
        token_hash = self.hash_token(refresh_token)
        q = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        row = q.scalar_one_or_none()
        if row:
            row.revoked = True
            await db.commit()

    async def validate_refresh_token(self, db: AsyncSession, user_id: UUID, refresh_token: str) -> bool:
        token_hash = self.hash_token(refresh_token)
        q = await db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,  # noqa: E712
            )
        )
        row = q.scalar_one_or_none()
        if not row:
            return False
        return row.expires_at >= datetime.utcnow()

    async def authenticate_user(self, db: AsyncSession, username_or_email: str, password: str) -> Optional[User]:
        q = await db.execute(
            select(User).where(
                (User.username == username_or_email) | (User.email == username_or_email)
            )
        )
        user = q.scalar_one_or_none()
        if not user or not user.is_active:
            return None
        if not self.verify_password(password, user.password_hash):
            return None
        return user


auth_service = AuthService()
