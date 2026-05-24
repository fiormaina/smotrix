from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.frontend_api import WatchHistoryCreatePayload, WatchHistoryUpdatePayload
from app.services.frontend_api import (
    create_watch_history_item,
    list_watch_history_view,
    update_watch_history_item,
)

router = APIRouter()


@router.get("")
def get_watch_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return {"items": list_watch_history_view(db, current_user)}


@router.post("")
def create_watch_history(
    payload: WatchHistoryCreatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = create_watch_history_item(
        db,
        current_user,
        content_type=payload.type,
        title=payload.title,
        source_url=payload.url,
        year=payload.year,
        status_value=payload.status,
        season=payload.season,
        episode=payload.episode,
        rating=payload.rating,
        comment=payload.comment,
        folder_id=payload.folder_id,
    )
    return {"item": item}


@router.patch("/{item_id}")
def patch_watch_history(
    item_id: str,
    payload: WatchHistoryUpdatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = update_watch_history_item(
        db,
        current_user,
        item_id,
        content_type=payload.type,
        status_value=payload.status,
        progress=payload.progress,
        source_url=payload.url,
        season=payload.season,
        episode=payload.episode,
        rating=payload.rating,
        comment=payload.comment,
        watched_at=payload.watched_at,
        folder_id=payload.folder_id,
    )
    return {"item": item}
