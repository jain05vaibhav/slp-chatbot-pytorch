"""
VoxAI Admin Moderation Routes
==============================
Administrative endpoints for managing automated profanity filters,
curse word blacklists, strike limits, and moderation incident logs.
"""

from typing import List, Optional
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from model.admin_security import get_admin_manager
from model.moderation import get_moderation_manager

moderation_router = APIRouter(prefix="/api/admin/moderation", tags=["Admin Moderation"])


def _verify_admin(authorization: Optional[str], x_admin_token: Optional[str]):
    token = authorization or x_admin_token
    if not token:
        raise HTTPException(status_code=401, detail="Authentication token required.")
    if token.startswith("Bearer "):
        token = token[7:].strip()
    admin_mgr = get_admin_manager()
    if not admin_mgr.verify_token(token):
        raise HTTPException(status_code=403, detail="Invalid or expired admin session token.")


class ModerationSettingsRequest(BaseModel):
    enabled: Optional[bool] = None
    warning_threshold: Optional[int] = Field(None, ge=0, le=10)


class AddWordsRequest(BaseModel):
    words: List[str]


class ClearStrikesRequest(BaseModel):
    ident_key: Optional[str] = None


@moderation_router.get("")
async def get_moderation_data_endpoint(
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    """Retrieves full moderation configuration, prohibited words, and incident audit log."""
    _verify_admin(authorization, x_admin_token)
    mod_mgr = get_moderation_manager()
    return mod_mgr.get_moderation_data()


@moderation_router.post("/settings")
async def update_moderation_settings_endpoint(
    body: ModerationSettingsRequest,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    """Updates global moderation enabled state and warning strike limit."""
    _verify_admin(authorization, x_admin_token)
    mod_mgr = get_moderation_manager()
    mod_mgr.update_settings(enabled=body.enabled, warning_threshold=body.warning_threshold)
    return {"status": "success", "message": "Moderation settings updated."}


@moderation_router.post("/words")
async def add_prohibited_words_endpoint(
    body: AddWordsRequest,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    """Adds one or more prohibited words to the automated filter."""
    _verify_admin(authorization, x_admin_token)
    mod_mgr = get_moderation_manager()
    added = mod_mgr.add_words(body.words)
    return {
        "status": "success",
        "added_count": len(added),
        "added_words": added,
        "total_words": len(mod_mgr.get_moderation_data()["prohibited_words"])
    }


@moderation_router.delete("/words/{word}")
async def remove_prohibited_word_endpoint(
    word: str,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    """Removes a word from the prohibited filter."""
    _verify_admin(authorization, x_admin_token)
    mod_mgr = get_moderation_manager()
    removed = mod_mgr.remove_word(word)
    if not removed:
        raise HTTPException(status_code=404, detail="Word not found in prohibited list.")
    return {"status": "success", "removed_word": word}


@moderation_router.post("/words/reset")
async def reset_prohibited_words_endpoint(
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    """Resets the prohibited word list back to factory defaults."""
    _verify_admin(authorization, x_admin_token)
    mod_mgr = get_moderation_manager()
    mod_mgr.reset_words_to_default()
    return {"status": "success", "message": "Prohibited words reset to defaults."}


@moderation_router.post("/strikes/clear")
async def clear_strikes_endpoint(
    body: ClearStrikesRequest,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    """Resets strikes/warnings for a specific identity or all users."""
    _verify_admin(authorization, x_admin_token)
    mod_mgr = get_moderation_manager()
    cleared = mod_mgr.clear_strikes(body.ident_key)
    return {"status": "success", "cleared_records": cleared}
