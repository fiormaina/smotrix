from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.folder import Folder
from app.models.user import User
from app.models.watch_item import WatchItem
from app.schemas.library import (
    CreateWatchItemRequest,
    FolderResponse,
    UpdateWatchItemRequest,
    WatchHistoryItemResponse,
    WatchItemDetailResponse,
    WatchItemsListResponse,
)
from app.services.library_domain import (
    STATUS_COMPLETED,
    STATUS_PLANNED,
    STATUS_WATCHING,
    SYSTEM_FOLDER_DEFINITIONS,
    SYSTEM_FOLDER_ORDER,
    UNSET,
    apply_watch_item_state,
    build_history_badge,
    build_media_meta,
    get_system_folder_for_status,
)


def ensure_default_folders(db: Session, user: User) -> dict[str, Folder]:
    statement = select(Folder).where(Folder.user_id == user.id)
    folders = list(db.scalars(statement))
    folders_by_system_key = {
        folder.system_key: folder
        for folder in folders
        if folder.is_system and folder.system_key is not None
    }

    created = False
    for definition in SYSTEM_FOLDER_DEFINITIONS:
        if definition["system_key"] in folders_by_system_key:
            continue

        folder = Folder(
            user_id=user.id,
            title=definition["title"],
            description=definition["description"],
            access="private",
            is_system=True,
            system_key=definition["system_key"],
        )
        db.add(folder)
        folders.append(folder)
        folders_by_system_key[definition["system_key"]] = folder
        created = True

    if created:
        db.flush()

    return folders_by_system_key


def _infer_status(payload: CreateWatchItemRequest) -> str:
    if payload.status is not None:
        return payload.status

    if payload.watched_at is not None:
        return STATUS_COMPLETED

    if payload.progress_percent == 100:
        return STATUS_COMPLETED

    if payload.duration_seconds and payload.progress_seconds is not None and payload.progress_seconds >= payload.duration_seconds:
        return STATUS_COMPLETED

    if (payload.progress_percent or 0) > 0 or payload.progress_seconds is not None:
        return STATUS_WATCHING

    return STATUS_PLANNED


def _normalize_lookup_value(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _find_existing_watch_item(
    db: Session,
    user: User,
    title: str,
    source_url: str | None,
    year: int | None,
) -> WatchItem | None:
    normalized_url = _normalize_lookup_value(source_url)
    normalized_title = _normalize_lookup_value(title)
    items = db.scalars(
        select(WatchItem)
        .where(WatchItem.user_id == user.id)
        .order_by(WatchItem.updated_at.desc(), WatchItem.id.desc())
    ).all()

    if normalized_url:
        for item in items:
            if _normalize_lookup_value(item.source_url) == normalized_url:
                return item

    if normalized_title:
        if year is not None:
            for item in items:
                if _normalize_lookup_value(item.title) == normalized_title and item.year == year:
                    return item

        for item in items:
            if _normalize_lookup_value(item.title) == normalized_title:
                return item

    return None


def _format_imdb_rating(imdb_rating: float | None) -> str:
    if imdb_rating is None:
        return "—"
    return f"{imdb_rating:.1f}".rstrip("0").rstrip(".")


def _get_custom_folder_or_404(db: Session, user: User, folder_id: int) -> Folder:
    statement = select(Folder).where(
        Folder.id == folder_id,
        Folder.user_id == user.id,
    )
    folder = db.scalar(statement)
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "Папка не найдена"},
        )
    if folder.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Системную папку нельзя выбирать как пользовательскую"},
        )
    return folder


def _get_watch_item_or_404(db: Session, user: User, item_id: int) -> WatchItem:
    statement = (
        select(WatchItem)
        .where(WatchItem.id == item_id, WatchItem.user_id == user.id)
        .options(
            selectinload(WatchItem.system_folder),
            selectinload(WatchItem.custom_folder),
        )
    )
    item = db.scalar(statement)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "Контент не найден"},
        )
    return item


def _to_folder_response(folder: Folder, items_count: int) -> FolderResponse:
    return FolderResponse(
        id=folder.id,
        title=folder.title,
        description=folder.description,
        access=folder.access,
        is_system=folder.is_system,
        system_key=folder.system_key,
        can_delete=folder.can_delete,
        items_count=items_count,
    )


def _to_history_item_response(item: WatchItem) -> WatchHistoryItemResponse:
    return WatchHistoryItemResponse(
        id=item.id,
        title=item.title,
        content_type=item.content_type,
        source_url=item.source_url,
        status=item.status,
        progress_percent=item.progress_percent,
        progress_seconds=item.progress_seconds,
        duration_seconds=item.duration_seconds,
        user_rating=item.user_rating,
        comment=item.comment,
        custom_folder_id=item.custom_folder_id,
        system_folder_id=item.system_folder_id,
        badge=build_history_badge(item),
        meta=build_media_meta(item),
        year=item.year,
        genres=item.genres or [],
        duration_text=item.duration_text,
        source=item.source,
        updated_at=item.updated_at,
        watched_at=item.watched_at,
    )


def _to_detail_response(item: WatchItem) -> WatchItemDetailResponse:
    return WatchItemDetailResponse(
        id=item.id,
        title=item.title,
        source_url=item.source_url,
        genres=item.genres or [],
        year=item.year,
        duration_text=item.duration_text,
        content_type=item.content_type,
        imdb_rating=_format_imdb_rating(item.imdb_rating),
        user_rating=item.user_rating,
        progress_percent=item.progress_percent,
        progress_seconds=item.progress_seconds,
        duration_seconds=item.duration_seconds,
        custom_folder_id=item.custom_folder_id,
        system_folder_id=item.system_folder_id,
        watched=item.status == STATUS_COMPLETED,
        comment=item.comment,
        description=item.description,
        status=item.status,
        season=item.season,
        episode=item.episode,
        source=item.source,
        watched_at=item.watched_at,
        updated_at=item.updated_at,
    )


def list_folders(db: Session, user: User) -> list[FolderResponse]:
    ensure_default_folders(db, user)

    folders = list(
        db.scalars(
            select(Folder)
            .where(Folder.user_id == user.id)
            .order_by(Folder.is_system.desc(), Folder.title.asc()),
        )
    )

    system_counts = dict(
        db.execute(
            select(WatchItem.system_folder_id, func.count(WatchItem.id))
            .where(WatchItem.user_id == user.id)
            .group_by(WatchItem.system_folder_id)
        ).all()
    )
    custom_counts = dict(
        db.execute(
            select(WatchItem.custom_folder_id, func.count(WatchItem.id))
            .where(
                WatchItem.user_id == user.id,
                WatchItem.custom_folder_id.is_not(None),
            )
            .group_by(WatchItem.custom_folder_id)
        ).all()
    )

    folders.sort(
        key=lambda folder: (
            0 if folder.is_system else 1,
            SYSTEM_FOLDER_ORDER.get(folder.system_key or "", 999),
            folder.title.lower(),
        )
    )

    return [
        _to_folder_response(
            folder=folder,
            items_count=system_counts.get(folder.id, 0)
            if folder.is_system
            else custom_counts.get(folder.id, 0),
        )
        for folder in folders
    ]


def list_watch_items(
    db: Session,
    user: User,
    content_type: str | None = None,
) -> WatchItemsListResponse:
    ensure_default_folders(db, user)

    statement = (
        select(WatchItem)
        .where(WatchItem.user_id == user.id)
        .options(
            selectinload(WatchItem.system_folder),
            selectinload(WatchItem.custom_folder),
        )
        .order_by(WatchItem.updated_at.desc(), WatchItem.id.desc())
    )
    if content_type is not None:
        statement = statement.where(WatchItem.content_type == content_type)

    items = list(db.scalars(statement))
    return WatchItemsListResponse(
        items=[_to_history_item_response(item) for item in items],
        watching_count=sum(1 for item in items if item.status == STATUS_WATCHING),
        completed_count=sum(1 for item in items if item.status == STATUS_COMPLETED),
        planned_count=sum(1 for item in items if item.status == STATUS_PLANNED),
    )


def get_watch_item_detail(db: Session, user: User, item_id: int) -> WatchItemDetailResponse:
    ensure_default_folders(db, user)
    item = _get_watch_item_or_404(db, user, item_id)
    return _to_detail_response(item)


def create_watch_item(
    db: Session,
    user: User,
    payload: CreateWatchItemRequest,
) -> WatchItemDetailResponse:
    resolved_status = _infer_status(payload)
    custom_folder_id = None
    if payload.custom_folder_id is not None:
        custom_folder_id = _get_custom_folder_or_404(db, user, payload.custom_folder_id).id

    if payload.source == "extension":
        existing_item = _find_existing_watch_item(
            db,
            user,
            payload.title,
            payload.source_url,
            payload.year,
        )
        if existing_item is not None:
            existing_item.source = "extension"
            existing_item.title = payload.title
            if payload.source_url is not None:
                existing_item.source_url = payload.source_url
            if payload.year is not None:
                existing_item.year = payload.year
            if payload.genres:
                existing_item.genres = payload.genres
            if payload.duration_text is not None:
                existing_item.duration_text = payload.duration_text
            if payload.description is not None:
                existing_item.description = payload.description
            if payload.rating is not None:
                existing_item.user_rating = payload.rating
            if payload.comment is not None:
                existing_item.comment = payload.comment
            if custom_folder_id is not None:
                existing_item.custom_folder_id = custom_folder_id

            next_status = apply_watch_item_state(
                existing_item,
                content_type=payload.content_type,
                status_value=resolved_status,
                progress_percent=payload.progress_percent,
                progress_seconds=payload.progress_seconds,
                duration_seconds=payload.duration_seconds,
                season=payload.season if payload.season is not None else UNSET,
                episode=payload.episode if payload.episode is not None else UNSET,
                watched_at=payload.watched_at,
                progress_mode="resolve",
                reject_non_series_position=True,
                clear_watched_at_on_incomplete_status=True,
            )
            existing_item.system_folder_id = get_system_folder_for_status(db, user, next_status).id
            db.commit()
            db.refresh(existing_item)
            return _to_detail_response(existing_item)

    system_folder = get_system_folder_for_status(db, user, resolved_status)

    item = WatchItem(
        user_id=user.id,
        system_folder_id=system_folder.id,
        custom_folder_id=custom_folder_id,
        source=payload.source,
        content_type=payload.content_type,
        title=payload.title,
        source_url=payload.source_url,
        year=payload.year,
        genres=payload.genres,
        duration_text=payload.duration_text,
        description=payload.description,
        imdb_rating=None,
        user_rating=payload.rating,
        comment=payload.comment,
        status=resolved_status,
        progress_percent=0,
        progress_seconds=None,
        duration_seconds=payload.duration_seconds,
        season=None,
        episode=None,
        watched_at=None,
    )
    apply_watch_item_state(
        item,
        status_value=resolved_status,
        progress_percent=payload.progress_percent,
        progress_seconds=payload.progress_seconds,
        duration_seconds=payload.duration_seconds,
        season=payload.season if payload.season is not None else UNSET,
        episode=payload.episode if payload.episode is not None else UNSET,
        watched_at=payload.watched_at,
        progress_mode="resolve",
        reject_non_series_position=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_detail_response(item)


def update_watch_item(
    db: Session,
    user: User,
    item_id: int,
    payload: UpdateWatchItemRequest,
) -> WatchItemDetailResponse:
    item = _get_watch_item_or_404(db, user, item_id)
    updates = payload.model_dump(exclude_unset=True, by_alias=False)

    if "status" in updates and payload.status is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Статус не может быть пустым"},
        )

    if "title" in updates:
        item.title = payload.title
    if "source_url" in updates:
        item.source_url = payload.source_url
    if "year" in updates:
        item.year = payload.year
    if "genres" in updates and payload.genres is not None:
        item.genres = payload.genres
    if "duration_text" in updates:
        item.duration_text = payload.duration_text
    if "description" in updates:
        item.description = payload.description
    if "rating" in updates:
        item.user_rating = payload.rating
    if "comment" in updates:
        item.comment = payload.comment

    if "custom_folder_id" in updates:
        if payload.custom_folder_id is None:
            item.custom_folder_id = None
        else:
            item.custom_folder_id = _get_custom_folder_or_404(db, user, payload.custom_folder_id).id

    next_status = apply_watch_item_state(
        item,
        status_value=payload.status if "status" in updates else UNSET,
        progress_percent=payload.progress_percent if "progress_percent" in updates else UNSET,
        progress_seconds=payload.progress_seconds if "progress_seconds" in updates else UNSET,
        duration_seconds=payload.duration_seconds if "duration_seconds" in updates else UNSET,
        season=payload.season if "season" in updates else UNSET,
        episode=payload.episode if "episode" in updates else UNSET,
        watched_at=payload.watched_at if "watched_at" in updates else UNSET,
        progress_mode="resolve",
        reject_non_series_position=True,
        clear_watched_at_on_incomplete_status=True,
    )
    if "status" in updates:
        item.system_folder_id = get_system_folder_for_status(db, user, next_status).id

    db.commit()
    db.refresh(item)
    return _to_detail_response(item)


def delete_folder(db: Session, user: User, folder_id: int) -> None:
    ensure_default_folders(db, user)
    statement = select(Folder).where(Folder.id == folder_id, Folder.user_id == user.id)
    folder = db.scalar(statement)
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "Папка не найдена"},
        )
    if folder.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Системные папки удалять нельзя"},
        )

    db.delete(folder)
    db.commit()
