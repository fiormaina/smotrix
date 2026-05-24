from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.library import (
    CreateWatchItemRequest,
    FolderListResponse,
    UpdateWatchItemRequest,
    WatchItemDetailResponse,
    WatchItemsListResponse,
)
from app.services.library import (
    create_watch_item,
    delete_folder,
    get_watch_item_detail,
    list_folders,
    list_watch_items,
    update_watch_item,
)

router = APIRouter()


@router.get(
    "/folders",
    response_model=FolderListResponse,
    summary="Get user folders including system folders",
)
def get_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FolderListResponse:
    return FolderListResponse(items=list_folders(db=db, user=current_user))


@router.delete(
    "/folders/{folder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete custom folder",
)
def remove_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    delete_folder(db=db, user=current_user, folder_id=folder_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/watch-items",
    response_model=WatchItemsListResponse,
    summary="List watch items for current user",
)
def get_watch_items(
    content_type: Literal["movie", "series"] | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchItemsListResponse:
    return list_watch_items(db=db, user=current_user, content_type=content_type)


@router.post(
    "/watch-items",
    response_model=WatchItemDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create movie or series entry for current user",
)
def add_watch_item(
    payload: CreateWatchItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchItemDetailResponse:
    return create_watch_item(db=db, user=current_user, payload=payload)


@router.get(
    "/watch-items/{item_id}",
    response_model=WatchItemDetailResponse,
    summary="Get watch item detail",
)
def get_watch_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchItemDetailResponse:
    return get_watch_item_detail(db=db, user=current_user, item_id=item_id)


@router.patch(
    "/watch-items/{item_id}",
    response_model=WatchItemDetailResponse,
    summary="Update watch item progress, status, rating, comment, or folder",
)
def patch_watch_item(
    item_id: int,
    payload: UpdateWatchItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchItemDetailResponse:
    return update_watch_item(db=db, user=current_user, item_id=item_id, payload=payload)
