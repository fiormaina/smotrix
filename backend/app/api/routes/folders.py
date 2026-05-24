from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_optional_current_user
from app.models.user import User
from app.schemas.frontend_api import FolderCreatePayload, FolderItemPayload, FolderUpdatePayload, ViewerPayload
from app.services.frontend_api import (
    add_item_to_folder,
    create_folder_for_viewer,
    delete_folder_for_viewer,
    get_folder_view_response,
    get_user_by_id,
    list_library_folders_view,
    list_own_folders_view,
    list_public_folders_by_owner_view,
    save_folder_for_viewer,
    unsave_folder_for_viewer,
    update_folder_for_viewer,
    remove_item_from_folder,
)

router = APIRouter()


@router.get("/library")
def get_library_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return {"items": list_library_folders_view(db, current_user)}


@router.get("/own")
def get_own_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return {"items": list_own_folders_view(db, current_user)}


@router.get("/public")
def get_public_folders(
    ownerId: int | None = Query(default=None),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    owner = get_user_by_id(db, ownerId)
    if owner is None:
        return {"items": []}
    return {"items": list_public_folders_by_owner_view(db, owner, current_user)}


@router.get("/view")
def get_folder_view(
    folderId: int | None = Query(default=None),
    publicSlug: str | None = Query(default=None),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return get_folder_view_response(
        db,
        current_user,
        folder_id=folderId,
        public_slug=publicSlug,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_folder(
    payload: FolderCreatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = create_folder_for_viewer(
        db,
        current_user,
        payload.title,
        payload.description,
        payload.visibility,
    )
    return {"folder": folder}


@router.patch("/{folder_id}")
def update_folder(
    folder_id: int,
    payload: FolderUpdatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = update_folder_for_viewer(
        db,
        current_user,
        folder_id,
        payload.title,
        payload.description,
        payload.visibility,
    )
    return {"folder": folder}


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    delete_folder_for_viewer(db, current_user, folder_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{folder_id}/save")
def save_folder(
    folder_id: int,
    payload: ViewerPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return save_folder_for_viewer(db, current_user, folder_id)


@router.delete("/{folder_id}/save")
def unsave_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return unsave_folder_for_viewer(db, current_user, folder_id)


@router.post("/{folder_id}/items")
def add_folder_item(
    folder_id: int,
    payload: FolderItemPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return add_item_to_folder(db, current_user, folder_id, payload.media_id)


@router.delete("/{folder_id}/items/{media_id}")
def delete_folder_item(
    folder_id: int,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return {"folder": remove_item_from_folder(db, current_user, folder_id, media_id)}
