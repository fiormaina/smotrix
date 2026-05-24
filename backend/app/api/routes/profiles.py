from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_optional_current_user
from app.models.user import User
from app.schemas.frontend_api import FollowPayload
from app.services.frontend_api import (
    follow_user_response,
    get_profile_connections_response,
    get_profile_view_response,
    unfollow_user_response,
)

router = APIRouter()


@router.get("/view")
def get_profile_view(
    userId: int | None = Query(default=None),
    username: str | None = Query(default=None),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return get_profile_view_response(db, current_user, user_id=userId, username=username)


@router.post("/{target_user_id}/follow")
def follow_profile(
    target_user_id: int,
    payload: FollowPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return follow_user_response(db, current_user, target_user_id)


@router.delete("/{target_user_id}/follow")
def unfollow_profile(
    target_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return unfollow_user_response(db, current_user, target_user_id)


@router.get("/{target_user_id}/followers")
def get_profile_followers(
    target_user_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return get_profile_connections_response(db, current_user, target_user_id, "followers")


@router.get("/{target_user_id}/following")
def get_profile_following(
    target_user_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return get_profile_connections_response(db, current_user, target_user_id, "following")
