from datetime import datetime
import re
from urllib.parse import urlencode

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.folder import Folder
from app.models.folder_save import FolderSave
from app.models.user import User
from app.models.user_follow import UserFollow
from app.models.watch_item import WatchItem
from app.services.library import ensure_default_folders
from app.services.library_domain import (
    STATUS_COMPLETED,
    STATUS_LABELS,
    STATUS_PLANNED,
    STATUS_WATCHING,
    SYSTEM_FOLDER_ORDER,
    UNSET,
    apply_watch_item_state,
    build_history_badge,
    build_media_meta,
    default_progress_for_status,
    get_system_folder_for_status,
    get_type_label,
    normalize_content_type,
    normalize_watch_status,
)

DEFAULT_AVATAR_KEY = "violet"
TITLE_MAX_LENGTH = 80
DESCRIPTION_MAX_LENGTH = 320


def parse_int(value: str | int | None) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None



def serialize_dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None



def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None



def build_frontend_url(page_name: str, **params: str | int) -> str:
    base_url = settings.frontend_base_url.rstrip("/")
    query_string = urlencode({key: value for key, value in params.items() if value not in (None, "")})
    suffix = f"?{query_string}" if query_string else ""
    return f"{base_url}/pages/{page_name}{suffix}"



def get_avatar_state(user: User) -> dict[str, str]:
    return {
        "avatarKey": user.avatar_key or DEFAULT_AVATAR_KEY,
        "avatarImage": user.avatar_image or "",
    }



def set_avatar_state(
    db: Session,
    user: User,
    avatar_key: str | None,
    avatar_image: str | None,
) -> User:
    user.avatar_key = avatar_key or DEFAULT_AVATAR_KEY
    user.avatar_image = avatar_image or None
    db.commit()
    db.refresh(user)
    return user



def get_user_by_id(db: Session, user_id: int | None) -> User | None:
    if user_id is None:
        return None
    return db.scalar(select(User).where(User.id == user_id))



def find_user_for_profile(db: Session, user_id: int | None = None, username: str | None = None) -> User | None:
    if user_id is not None:
        return get_user_by_id(db, user_id)
    if username:
        return db.scalar(select(User).where(User.login == username.strip().lower()))
    return None



def get_saved_folder_ids(db: Session, viewer_user_id: int) -> set[int]:
    folder_ids = db.scalars(
        select(FolderSave.folder_id).where(FolderSave.viewer_user_id == viewer_user_id)
    ).all()
    return set(folder_ids)


def is_folder_saved(db: Session, viewer_user_id: int, folder_id: int) -> bool:
    return db.scalar(
        select(FolderSave.id).where(
            FolderSave.viewer_user_id == viewer_user_id,
            FolderSave.folder_id == folder_id,
        )
    ) is not None


def is_following_user(db: Session, follower_user_id: int, followed_user_id: int) -> bool:
    return db.scalar(
        select(UserFollow.id).where(
            UserFollow.follower_user_id == follower_user_id,
            UserFollow.followed_user_id == followed_user_id,
        )
    ) is not None


def get_followers_count(db: Session, user_id: int) -> int:
    return int(
        db.scalar(
            select(func.count(UserFollow.id)).where(UserFollow.followed_user_id == user_id)
        )
        or 0
    )


def get_following_count(db: Session, user_id: int) -> int:
    return int(
        db.scalar(
            select(func.count(UserFollow.id)).where(UserFollow.follower_user_id == user_id)
        )
        or 0
    )


def get_follower_ids(db: Session, user_id: int) -> list[int]:
    return list(
        db.scalars(
            select(UserFollow.follower_user_id)
            .where(UserFollow.followed_user_id == user_id)
            .order_by(UserFollow.follower_user_id.asc())
        )
    )


def get_following_list(db: Session, user_id: int) -> list[int]:
    return list(
        db.scalars(
            select(UserFollow.followed_user_id)
            .where(UserFollow.follower_user_id == user_id)
            .order_by(UserFollow.followed_user_id.asc())
        )
    )


def list_users_by_ids(db: Session, user_ids: list[int]) -> list[User]:
    if not user_ids:
        return []

    users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    user_by_id = {user.id: user for user in users}
    return [user_by_id[user_id] for user_id in user_ids if user_id in user_by_id]



def build_auth_user_payload(user: User) -> dict[str, object]:
    avatar_state = get_avatar_state(user)
    return {
        "id": user.id,
        "email": user.email,
        "login": user.login,
        "display_name": user.display_name,
        "extension_code": user.extension_code,
        "profile_url": user.profile_url,
        "created_at": user.created_at,
        "avatar_key": avatar_state["avatarKey"],
        "avatar_image": avatar_state["avatarImage"],
    }



def build_profile_payload(
    db: Session,
    user: User,
    viewer: User | None = None,
) -> dict[str, object]:
    avatar_state = get_avatar_state(user)
    viewer_id = viewer.id if viewer is not None else None
    is_following = bool(
        viewer_id
        and viewer_id != user.id
        and is_following_user(db, viewer_id, user.id)
    )
    return {
        "id": user.id,
        "username": user.login,
        "displayName": user.display_name,
        "extensionCode": user.extension_code,
        "avatarKey": avatar_state["avatarKey"],
        "avatarImage": avatar_state["avatarImage"],
        "profileUrl": user.profile_url,
        "followersCount": get_followers_count(db, user.id),
        "followingCount": get_following_count(db, user.id),
        "isFollowing": is_following,
        "isOwner": viewer_id == user.id if viewer_id is not None else False,
    }


def parse_duration_minutes(value: str | None) -> float:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*мин", value or "", flags=re.IGNORECASE)
    if match is None:
        return 0

    try:
        minutes = float(match.group(1).replace(",", "."))
    except ValueError:
        return 0

    return minutes if minutes > 0 else 0


def resolve_profile_episode_count(item: WatchItem) -> int:
    if normalize_content_type(item.content_type) != "series":
        return 0

    if item.episode is None or item.episode <= 0:
        return 0

    return item.episode


def resolve_profile_watched_seconds(item: WatchItem) -> int:
    if item.status == STATUS_PLANNED:
        return 0

    if item.progress_seconds is not None and item.progress_seconds > 0:
        return item.progress_seconds

    if item.duration_seconds is not None and item.duration_seconds > 0:
        episode_count = resolve_profile_episode_count(item)
        if episode_count > 0:
            return item.duration_seconds * episode_count
        return item.duration_seconds

    duration_minutes = parse_duration_minutes(item.duration_text)
    if duration_minutes <= 0:
        return 0

    episode_count = resolve_profile_episode_count(item)
    if episode_count > 0:
        return int(duration_minutes * 60 * episode_count)

    return int(duration_minutes * 60)


def build_profile_stats(db: Session, user: User) -> list[dict[str, object]]:
    items = db.scalars(select(WatchItem).where(WatchItem.user_id == user.id)).all()
    tracked_items = [item for item in items if item.status != STATUS_PLANNED]
    series_items = [item for item in tracked_items if normalize_content_type(item.content_type) == "series"]
    watched_seconds = sum(resolve_profile_watched_seconds(item) for item in tracked_items)
    watched_hours = max(1, round(watched_seconds / 3600)) if watched_seconds > 0 else 0

    return [
        {"id": "movies", "value": sum(1 for item in tracked_items if normalize_content_type(item.content_type) == "movie"), "label": "Фильмов", "icon": "movie"},
        {"id": "series", "value": len(series_items), "label": "Сериалов", "icon": "series"},
        {"id": "episodes", "value": sum(resolve_profile_episode_count(item) for item in series_items), "label": "Эпизодов", "icon": "episodes"},
        {"id": "hours", "value": watched_hours, "label": "Часов просмотра", "icon": "hours"},
    ]


def get_profile_connections_response(
    db: Session,
    viewer: User | None,
    target_user_id: int,
    kind: str,
) -> dict[str, object]:
    target_user = get_user_by_id(db, target_user_id)
    if target_user is None:
        return {"status": "missing"}

    related_ids = (
        get_follower_ids(db, target_user.id)
        if kind == "followers"
        else get_following_list(db, target_user.id)
    )
    items = [build_profile_payload(db, user, viewer) for user in list_users_by_ids(db, related_ids)]
    return {
        "status": "ok",
        "user": build_profile_payload(db, target_user, viewer),
        "items": items,
    }



def format_date_label(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%d.%m.%Y")



def get_status_label(status_value: str | None) -> str:
    return STATUS_LABELS.get(
        normalize_watch_status(status_value),
        STATUS_LABELS[STATUS_PLANNED],
    )


def normalize_lookup_value(value: str | None) -> str:
    return (value or "").strip().lower()



def get_custom_folder_for_owner(db: Session, folder_id: int | None, user: User) -> Folder | None:
    if folder_id is None:
        return None
    folder = db.scalar(
        select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == user.id,
            Folder.is_system.is_(False),
        )
    )
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Папка недоступна"},
        )
    return folder



def get_folder_by_id(db: Session, folder_id: int | None) -> Folder | None:
    if folder_id is None:
        return None
    return db.scalar(select(Folder).where(Folder.id == folder_id))



def find_folder_by_public_slug(db: Session, public_slug: str | None) -> Folder | None:
    if not public_slug:
        return None
    if public_slug.startswith("folder-"):
        folder_id = parse_int(public_slug.removeprefix("folder-"))
        if folder_id is not None:
            return get_folder_by_id(db, folder_id)
    return None



def get_folder_public_slug(folder: Folder) -> str:
    return f"folder-{folder.id}"



def get_folder_public_url(folder: Folder) -> str:
    if folder.is_system or folder.access != "public":
        return get_folder_page_url(folder)
    return build_frontend_url("folder-detail.html", share=get_folder_public_slug(folder))



def get_folder_page_url(folder: Folder) -> str:
    return build_frontend_url("folder-detail.html", id=folder.id)



def build_media_card(item: WatchItem) -> dict[str, object]:
    added_at = item.watched_at or item.updated_at or item.created_at
    return {
        "id": item.id,
        "title": item.title,
        "year": item.year,
        "type": item.content_type,
        "typeLabel": get_type_label(item.content_type),
        "watchStatus": item.status,
        "watchStatusLabel": get_status_label(item.status),
        "userRating": item.user_rating or 0,
        "meta": build_media_meta(
            item,
            genres_mode="first",
            include_year=False,
            empty_fallback=get_type_label(item.content_type),
        ),
        "addedAt": serialize_dt(added_at),
        "addedAtLabel": format_date_label(added_at),
    }



def build_folder_summary(
    db: Session,
    folder: Folder,
    viewer: User | None,
    saved_folder_ids: set[int] | None = None,
) -> dict[str, object]:
    owner = folder.user
    viewer_id = viewer.id if viewer is not None else None
    is_owner = viewer_id == owner.id if viewer_id is not None else False
    resolved_saved_ids = (
        saved_folder_ids
        if saved_folder_ids is not None
        else get_saved_folder_ids(db, viewer_id)
        if viewer_id is not None
        else set()
    )
    is_saved = not is_owner and folder.id in resolved_saved_ids
    folder_items = folder.system_watch_items if folder.is_system else folder.custom_watch_items
    items_count = len(folder_items)
    return {
        "id": folder.id,
        "title": folder.title,
        "description": folder.description or "",
        "access": "private" if is_owner else "shared",
        "visibility": folder.access,
        "owner": build_profile_payload(db, owner, viewer),
        "ownerId": owner.id,
        "ownerName": owner.display_name,
        "ownerUsername": owner.login,
        "ownerProfileUrl": owner.profile_url,
        "itemsCount": items_count,
        "isOwner": is_owner,
        "isSaved": is_saved,
        "isPublic": folder.access == "public",
        "isAccessible": True,
        "isSystem": folder.is_system,
        "systemKey": folder.system_key,
        "canDelete": not folder.is_system and is_owner,
        "publicSlug": None if folder.is_system else get_folder_public_slug(folder),
        "publicUrl": get_folder_public_url(folder),
        "pageUrl": get_folder_page_url(folder),
        "updatedAt": serialize_dt(folder.updated_at),
        "updatedAtLabel": format_date_label(folder.updated_at),
        "empty": items_count == 0,
    }



def build_folder_detail(
    db: Session,
    folder: Folder,
    viewer: User | None,
    saved_folder_ids: set[int] | None = None,
) -> dict[str, object]:
    summary = build_folder_summary(db, folder, viewer, saved_folder_ids=saved_folder_ids)
    role = "owner"
    viewer_id = viewer.id if viewer is not None else None
    if folder.user_id != viewer_id:
        role = "saved" if summary["isSaved"] else "public"

    folder_items = folder.system_watch_items if folder.is_system else folder.custom_watch_items
    items = [
        build_media_card(item)
        for item in sorted(folder_items, key=lambda value: value.updated_at or value.created_at, reverse=True)
    ]
    can_edit = role == "owner" and not folder.is_system
    return {
        **summary,
        "role": role,
        "canEdit": can_edit,
        "canSave": role == "public",
        "canRemoveSaved": role == "saved",
        "linkedNotice": "Сохранено из публичной папки" if role == "saved" else "",
        "items": items,
    }



def list_library_folders_view(db: Session, viewer: User) -> list[dict[str, object]]:
    ensure_default_folders(db=db, user=viewer)
    own_folders = db.scalars(
        select(Folder)
        .where(Folder.user_id == viewer.id)
        .order_by(Folder.updated_at.desc())
    ).all()
    saved_ids = get_saved_folder_ids(db, viewer.id)
    saved_folders = db.scalars(
        select(Folder)
        .where(
            Folder.id.in_(saved_ids) if saved_ids else False,
            Folder.user_id != viewer.id,
            Folder.is_system.is_(False),
        )
        .order_by(Folder.updated_at.desc())
    ).all() if saved_ids else []

    folders = [*own_folders, *saved_folders]
    folders.sort(
        key=lambda folder: (
            0 if folder.is_system else 1,
            SYSTEM_FOLDER_ORDER.get(folder.system_key or "", 999),
            -(folder.updated_at or folder.created_at).timestamp(),
        )
    )
    return [build_folder_summary(db, folder, viewer, saved_folder_ids=saved_ids) for folder in folders]



def list_own_folders_view(db: Session, viewer: User) -> list[dict[str, object]]:
    ensure_default_folders(db=db, user=viewer)
    folders = db.scalars(
        select(Folder)
        .where(Folder.user_id == viewer.id)
        .order_by(Folder.updated_at.desc())
    ).all()
    folders.sort(
        key=lambda folder: (
            0 if folder.is_system else 1,
            SYSTEM_FOLDER_ORDER.get(folder.system_key or "", 999),
            -(folder.updated_at or folder.created_at).timestamp(),
        )
    )
    return [build_folder_summary(db, folder, viewer) for folder in folders]



def list_public_folders_by_owner_view(
    db: Session,
    owner: User,
    viewer: User | None,
) -> list[dict[str, object]]:
    saved_folder_ids = (
        get_saved_folder_ids(db, viewer.id)
        if viewer is not None
        else set()
    )
    folders = db.scalars(
        select(Folder)
        .where(
            Folder.user_id == owner.id,
            Folder.is_system.is_(False),
            Folder.access == "public",
        )
        .order_by(Folder.updated_at.desc())
    ).all()
    return [
        build_folder_summary(db, folder, viewer, saved_folder_ids=saved_folder_ids)
        for folder in folders
    ]



def get_folder_view_response(
    db: Session,
    viewer: User | None,
    folder_id: int | None = None,
    public_slug: str | None = None,
) -> dict[str, object]:
    if folder_id is None and not public_slug:
        return {"status": "missing"}

    folder = get_folder_by_id(db, folder_id) if folder_id is not None else find_folder_by_public_slug(db, public_slug)
    if folder is None:
        return {"status": "unavailable" if public_slug else "missing"}

    viewer_id = viewer.id if viewer is not None else None
    is_owner = folder.user_id == viewer_id if viewer_id is not None else False
    saved_folder_ids = get_saved_folder_ids(db, viewer_id) if viewer_id is not None else set()
    is_saved = folder.id in saved_folder_ids if viewer_id is not None else False
    is_public = folder.access == "public"

    if not is_owner and not is_saved and not is_public:
        return {"status": "private-link" if public_slug else "forbidden"}

    return {
        "status": "ok",
        "folder": build_folder_detail(
            db,
            folder,
            viewer,
            saved_folder_ids=saved_folder_ids,
        ),
    }



def validate_folder_payload(title: str | None, description: str | None) -> None:
    if title is not None:
        normalized_title = title.strip()
        if not normalized_title:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Введите название папки"},
            )
        if len(normalized_title) > TITLE_MAX_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Название папки слишком длинное"},
            )
    if description is not None and len(description.strip()) > DESCRIPTION_MAX_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Описание папки слишком длинное"},
        )



def create_folder_for_viewer(
    db: Session,
    viewer: User,
    title: str,
    description: str,
    visibility: str,
) -> dict[str, object]:
    validate_folder_payload(title, description)
    folder = Folder(
        user_id=viewer.id,
        title=title.strip(),
        description=description.strip() or None,
        access="public" if visibility == "public" else "private",
        is_system=False,
        system_key=None,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return build_folder_detail(db, folder, viewer)



def update_folder_for_viewer(
    db: Session,
    viewer: User,
    folder_id: int,
    title: str | None,
    description: str | None,
    visibility: str | None,
) -> dict[str, object]:
    folder = db.scalar(
        select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == viewer.id,
            Folder.is_system.is_(False),
        )
    )
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Папка недоступна"},
        )

    validate_folder_payload(title, description)
    if title is not None:
        folder.title = title.strip()
    if description is not None:
        folder.description = description.strip() or None
    if visibility is not None:
        folder.access = "public" if visibility == "public" else "private"

    db.commit()
    db.refresh(folder)
    return build_folder_detail(db, folder, viewer)



def delete_folder_for_viewer(db: Session, viewer: User, folder_id: int) -> None:
    folder = db.scalar(
        select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == viewer.id,
            Folder.is_system.is_(False),
        )
    )
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Папка недоступна"},
        )

    db.execute(delete(FolderSave).where(FolderSave.folder_id == folder_id))
    db.delete(folder)
    db.commit()



def save_folder_for_viewer(db: Session, viewer: User, folder_id: int) -> dict[str, object]:
    folder = get_folder_by_id(db, folder_id)
    if folder is None or folder.access != "public":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Папка недоступна"},
        )
    if folder.user_id == viewer.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Нельзя сохранять свою папку"},
        )

    if is_folder_saved(db, viewer.id, folder_id):
        return {"status": "already-saved", "folder": build_folder_detail(db, folder, viewer)}

    db.add(
        FolderSave(
            viewer_user_id=viewer.id,
            folder_id=folder_id,
        )
    )
    db.commit()
    db.refresh(folder)
    saved_ids = get_saved_folder_ids(db, viewer.id)
    return {
        "status": "saved",
        "folder": build_folder_detail(db, folder, viewer, saved_folder_ids=saved_ids),
    }



def unsave_folder_for_viewer(db: Session, viewer: User, folder_id: int) -> dict[str, object]:
    db.execute(
        delete(FolderSave).where(
            FolderSave.viewer_user_id == viewer.id,
            FolderSave.folder_id == folder_id,
        )
    )
    db.commit()
    return {"status": "removed", "folderId": folder_id}



def get_watch_item_for_user(db: Session, viewer: User, item_id: str | int) -> WatchItem:
    normalized_id = parse_int(item_id)
    if normalized_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Элемент не найден"},
        )

    item = db.scalar(select(WatchItem).where(WatchItem.id == normalized_id, WatchItem.user_id == viewer.id))
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Элемент не найден"},
        )
    return item



def build_watch_history_item(item: WatchItem) -> dict[str, object]:
    normalized_type = normalize_content_type(item.content_type)
    return {
        "id": item.id,
        "title": item.title,
        "url": item.source_url or "",
        "status": item.status,
        "progress": item.progress_percent,
        "rating": item.user_rating or 0,
        "comment": item.comment or "",
        "folderId": item.custom_folder_id,
        "type": normalized_type,
        "typeLabel": get_type_label(normalized_type),
        "season": item.season,
        "episode": item.episode,
        "badge": build_history_badge(item) or "",
        "meta": build_media_meta(
            item,
            genres_mode="first",
            include_year=True,
            empty_fallback=get_type_label(normalized_type),
        ),
        "updatedAt": serialize_dt(item.updated_at),
        "watchedAt": serialize_dt(item.watched_at),
        "createdAt": serialize_dt(item.created_at),
    }


def get_watch_history_dedupe_key(item: WatchItem) -> str:
    source_url = normalize_lookup_value(item.source_url)
    if source_url:
        return f"url:{source_url}"

    title = normalize_lookup_value(item.title)
    if item.year:
        return f"title:{title}:{item.year}"
    return f"title:{title}"


def find_existing_watch_history_item(
    db: Session,
    viewer: User,
    title: str,
    source_url: str | None,
    year: int | None,
) -> WatchItem | None:
    normalized_url = normalize_lookup_value(source_url)
    normalized_title = normalize_lookup_value(title)
    items = db.scalars(
        select(WatchItem)
        .where(WatchItem.user_id == viewer.id)
        .order_by(WatchItem.updated_at.desc(), WatchItem.id.desc())
    ).all()

    if normalized_url:
        for item in items:
            if normalize_lookup_value(item.source_url) == normalized_url:
                return item

    if normalized_title:
        if year is not None:
            for item in items:
                if normalize_lookup_value(item.title) == normalized_title and item.year == year:
                    return item

        for item in items:
            if normalize_lookup_value(item.title) == normalized_title:
                return item

    return None


def list_watch_history_view(db: Session, viewer: User) -> list[dict[str, object]]:
    items = db.scalars(
        select(WatchItem)
        .where(WatchItem.user_id == viewer.id)
        .order_by(WatchItem.updated_at.desc(), WatchItem.id.desc())
    ).all()

    unique_items: list[WatchItem] = []
    seen_keys: set[str] = set()
    for item in items:
        dedupe_key = get_watch_history_dedupe_key(item)
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        unique_items.append(item)

    return [build_watch_history_item(item) for item in unique_items]



def create_watch_history_item(
    db: Session,
    viewer: User,
    content_type: str,
    title: str,
    source_url: str | None,
    year: int | None,
    status_value: str,
    season: int | None,
    episode: int | None,
    rating: int | None,
    comment: str | None,
    folder_id: int | None,
) -> dict[str, object]:
    normalized_type = normalize_content_type(content_type)
    normalized_title = title.strip()
    normalized_source_url = (source_url or "").strip() or None
    existing_item = find_existing_watch_history_item(db, viewer, normalized_title, normalized_source_url, year)
    if existing_item is not None:
        return update_watch_history_item(
            db,
            viewer,
            existing_item.id,
            content_type=normalized_type,
            status_value=status_value,
            progress=default_progress_for_status(status_value),
            source_url=normalized_source_url,
            season=season,
            episode=episode,
            rating=rating,
            comment=comment,
            folder_id=folder_id,
        )

    system_folder = get_system_folder_for_status(db, viewer, status_value)
    custom_folder = get_custom_folder_for_owner(db, folder_id, viewer)
    normalized_status = normalize_watch_status(status_value)
    progress_percent = default_progress_for_status(normalized_status)

    item = WatchItem(
        user_id=viewer.id,
        system_folder_id=system_folder.id,
        custom_folder_id=custom_folder.id if custom_folder else None,
        source="manual",
        content_type=normalized_type,
        title=normalized_title,
        source_url=normalized_source_url,
        year=year,
        genres=[],
        duration_text=None,
        description=None,
        imdb_rating=None,
        user_rating=rating if rating and rating > 0 else None,
        comment=(comment or "").strip() or None,
        status=normalized_status,
        progress_percent=0,
        season=None,
        episode=None,
        watched_at=None,
    )
    apply_watch_item_state(
        item,
        content_type=normalized_type,
        status_value=normalized_status,
        progress_percent=progress_percent,
        season=season,
        episode=episode,
        progress_mode="direct",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return build_watch_history_item(item)



def update_watch_history_item(
    db: Session,
    viewer: User,
    item_id: str | int,
    content_type: str | None = None,
    status_value: str | None = None,
    progress: int | None = None,
    source_url: str | None = None,
    season: int | None = None,
    episode: int | None = None,
    rating: int | None = None,
    comment: str | None = None,
    watched_at: str | None = None,
    folder_id: int | None = None,
) -> dict[str, object]:
    item = get_watch_item_for_user(db, viewer, item_id)

    if progress is not None:
        progress = max(0, min(100, int(progress)))
    if source_url is not None:
        item.source_url = source_url.strip() or None
    if rating is not None:
        item.user_rating = rating if rating > 0 else None
    if comment is not None:
        item.comment = comment.strip() or None
    if folder_id is not None:
        custom_folder = get_custom_folder_for_owner(db, folder_id, viewer) if folder_id else None
        item.custom_folder_id = custom_folder.id if custom_folder else None

    next_status = apply_watch_item_state(
        item,
        content_type=content_type if content_type is not None else UNSET,
        status_value=status_value if status_value is not None else UNSET,
        progress_percent=progress if progress is not None else UNSET,
        season=season if season is not None else UNSET,
        episode=episode if episode is not None else UNSET,
        watched_at=parse_datetime(watched_at) if watched_at is not None else UNSET,
        progress_mode="direct",
        clear_watched_at_on_incomplete_status=True,
    )
    item.system_folder_id = get_system_folder_for_status(db, viewer, next_status).id

    db.commit()
    db.refresh(item)
    return build_watch_history_item(item)



def build_movie_detail(item: WatchItem) -> dict[str, object]:
    watched = item.status == STATUS_COMPLETED or item.progress_percent >= 100
    normalized_type = normalize_content_type(item.content_type)
    return {
        "id": item.id,
        "title": item.title,
        "genres": item.genres or [],
        "year": str(item.year) if item.year else "",
        "duration": item.duration_text or "",
        "type": get_type_label(normalized_type),
        "contentType": normalized_type,
        "url": item.source_url or "",
        "imdbRating": item.imdb_rating or 0,
        "userRating": item.user_rating or 0,
        "progress": item.progress_percent,
        "folderId": item.custom_folder_id,
        "season": item.season,
        "episode": item.episode,
        "watched": watched,
        "comment": item.comment or "",
        "description": item.description or "Описание пока не добавлено.",
    }



def list_recent_media_view(db: Session, viewer: User, limit: int = 5) -> list[dict[str, object]]:
    safe_limit = max(1, min(50, int(limit or 5)))
    items = db.scalars(
        select(WatchItem)
        .where(WatchItem.user_id == viewer.id)
        .order_by(WatchItem.updated_at.desc(), WatchItem.id.desc())
        .limit(safe_limit)
    ).all()
    return [build_media_card(item) for item in items]



def search_media_view(db: Session, viewer: User, query: str | None) -> list[dict[str, object]]:
    statement = select(WatchItem).where(WatchItem.user_id == viewer.id)
    normalized_query = (query or "").strip().lower()
    items = db.scalars(statement.order_by(WatchItem.updated_at.desc(), WatchItem.id.desc())).all()
    if normalized_query:
        items = [
            item
            for item in items
            if normalized_query
            in (
                f"{item.title} "
                f"{build_media_meta(item, genres_mode='first', include_year=False, empty_fallback=get_type_label(item.content_type)) or ''} "
                f"{get_type_label(item.content_type)}"
            ).lower()
        ]
    return [build_media_card(item) for item in items[:30]]



def update_media_item(
    db: Session,
    viewer: User,
    item_id: str | int,
    user_rating: int | None = None,
    comment: str | None = None,
    watched: bool | None = None,
    progress: int | None = None,
    folder_id: int | None = None,
) -> dict[str, object]:
    item = get_watch_item_for_user(db, viewer, item_id)

    if user_rating is not None:
        item.user_rating = user_rating if user_rating > 0 else None
    if comment is not None:
        item.comment = comment.strip() or None
    if progress is not None:
        progress = max(0, min(100, int(progress)))
    if folder_id is not None:
        custom_folder = get_custom_folder_for_owner(db, folder_id, viewer) if folder_id else None
        item.custom_folder_id = custom_folder.id if custom_folder else None

    next_status = apply_watch_item_state(
        item,
        status_value=STATUS_COMPLETED if watched is True else UNSET,
        progress_percent=progress if progress is not None else UNSET,
        progress_mode="direct",
    )
    item.system_folder_id = get_system_folder_for_status(db, viewer, next_status).id

    db.commit()
    db.refresh(item)
    return build_movie_detail(item)



def add_item_to_folder(db: Session, viewer: User, folder_id: int, media_id: str | int) -> dict[str, object]:
    folder = get_custom_folder_for_owner(db, folder_id, viewer)
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Папка недоступна"},
        )

    item = get_watch_item_for_user(db, viewer, media_id)
    if item.custom_folder_id == folder.id:
        return {"status": "duplicate", "folder": build_folder_detail(db, folder, viewer)}

    item.custom_folder_id = folder.id
    db.commit()
    db.refresh(folder)
    return {"status": "added", "folder": build_folder_detail(db, folder, viewer)}



def remove_item_from_folder(db: Session, viewer: User, folder_id: int, media_id: str | int) -> dict[str, object]:
    folder = get_folder_by_id(db, folder_id)
    if folder is None or folder.user_id != viewer.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Папка недоступна"},
        )

    item = get_watch_item_for_user(db, viewer, media_id)

    if folder.is_system:
        if item.system_folder_id == folder.id:
            db.delete(item)
            db.commit()
        db.refresh(folder)
        return build_folder_detail(db, folder, viewer)

    if item.custom_folder_id == folder.id:
        item.custom_folder_id = None
        db.commit()
    db.refresh(folder)
    return build_folder_detail(db, folder, viewer)



def get_profile_view_response(
    db: Session,
    viewer: User | None,
    user_id: int | None = None,
    username: str | None = None,
) -> dict[str, object]:
    target_user = find_user_for_profile(db, user_id=user_id, username=username)
    if target_user is None:
        return {"status": "missing"}

    public_folders = list_public_folders_by_owner_view(db, target_user, viewer)
    return {
        "status": "ok",
        "user": build_profile_payload(db, target_user, viewer),
        "stats": build_profile_stats(db, target_user),
        "publicFolders": public_folders,
    }



def follow_user_response(db: Session, viewer: User, target_user_id: int) -> dict[str, object]:
    target_user = get_user_by_id(db, target_user_id)
    if target_user is None or target_user.id == viewer.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Пользователь недоступен"},
        )

    if not is_following_user(db, viewer.id, target_user.id):
        db.add(
            UserFollow(
                follower_user_id=viewer.id,
                followed_user_id=target_user.id,
            )
        )
        db.commit()
    return {"status": "following", "user": build_profile_payload(db, target_user, viewer)}



def unfollow_user_response(db: Session, viewer: User, target_user_id: int) -> dict[str, object]:
    target_user = get_user_by_id(db, target_user_id)
    if target_user is None or target_user.id == viewer.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Пользователь недоступен"},
        )

    db.execute(
        delete(UserFollow).where(
            UserFollow.follower_user_id == viewer.id,
            UserFollow.followed_user_id == target_user.id,
        )
    )
    db.commit()
    return {"status": "not-following", "user": build_profile_payload(db, target_user, viewer)}

