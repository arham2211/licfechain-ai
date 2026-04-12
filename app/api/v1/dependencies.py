"""
FastAPI Dependencies for Translation
"""

from typing import Optional, Any, List
from uuid import UUID
from fastapi import Query, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.auth import User, Role, UserRole
from app.services.auth_service import auth_service
from app.services.translation import translate_response

async def get_translation_language(
    lang: Optional[str] = Query(
        "en",
        description="Language code for translation (en=English, ur=Urdu, fr=French, de=German)"
    )
) -> str:
    """
    Get translation language from query parameter
    
    Args:
        lang: Language code (default: "en" for no translation)
    
    Returns:
        Language code
    """
    valid_languages = ["en", "ur", "fr", "de"]
    if lang not in valid_languages:
        return "en"  # Default to English if invalid
    return lang

async def apply_translation(
    data: Any,
    model_type: str,
    language: str
) -> Any:
    """
    Apply translation to response data if language is not English
    
    Args:
        data: Response data
        model_type: Type of model (e.g., "visit", "symptom", "diagnosis")
        language: Target language code
    
    Returns:
        Translated data if language is not "en", otherwise original data
    """
    if language == "en" or not data:
        return data
    
    return await translate_response(data, model_type, language)


auth_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    try:
        payload = auth_service.decode_token(credentials.credentials, expected_type="access")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    result = await db.execute(select(User).where(User.user_id == UUID(user_id), User.is_active == True))  # noqa: E712
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_user_roles(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    result = await db.execute(
        select(Role.name)
        .join(UserRole, Role.role_id == UserRole.role_id)
        .where(UserRole.user_id == user.user_id)
    )
    return [row[0] for row in result.all()]


def require_roles(*required_roles: str):
    async def _checker(
        user: User = Depends(get_current_user),
        roles: List[str] = Depends(get_current_user_roles),
    ) -> User:
        if not set(required_roles).intersection(set(roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient role. Required one of: {', '.join(required_roles)}",
            )
        return user

    return _checker
