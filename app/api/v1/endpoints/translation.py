from typing import Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.v1.dependencies import get_translation_language
from app.services.translation import translate_texts_batch

router = APIRouter()


class TranslationBatchRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class TranslationBatchResponse(BaseModel):
    translations: Dict[str, str]


@router.post("/texts", response_model=TranslationBatchResponse)
async def translate_texts(
    payload: TranslationBatchRequest,
    lang: str = Depends(get_translation_language),
):
    cleaned = [t for t in payload.texts if isinstance(t, str) and t.strip()]
    if not cleaned or lang == "en":
        return TranslationBatchResponse(translations={t: t for t in cleaned})

    translations = await translate_texts_batch(cleaned, lang, "medical")

    return TranslationBatchResponse(translations=translations)
