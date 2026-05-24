from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.frontend_api import MediaUpdatePayload
from app.services.frontend_api import (
    build_movie_detail,
    get_watch_item_for_user,
    list_recent_media_view,
    search_media_view,
    update_media_item,
)

router = APIRouter()


@router.get("/recent")
def get_recent_media(
    limit: int = Query(default=5),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return {"items": list_recent_media_view(db, current_user, limit=limit)}


@router.get("/search")
def search_media(
    q: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return {"items": search_media_view(db, current_user, q)}


@router.get("/{item_id}")
def get_media_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = get_watch_item_for_user(db, current_user, item_id)
    return {"item": build_movie_detail(item)}


@router.patch("/{item_id}")
def patch_media_item(
    item_id: str,
    payload: MediaUpdatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = update_media_item(
        db,
        current_user,
        item_id,
        user_rating=payload.user_rating,
        comment=payload.comment,
        watched=payload.watched,
        progress=payload.progress,
        folder_id=payload.folder_id,
    )
    return {"item": item}
