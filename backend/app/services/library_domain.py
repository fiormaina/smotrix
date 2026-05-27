from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.folder import Folder
from app.models.user import User
from app.models.watch_item import WatchItem

UNSET = object()

STATUS_PLANNED = "planned"
STATUS_WATCHING = "watching"
STATUS_COMPLETED = "completed"

SYSTEM_CONTINUE_WATCHING = "continue_watching"
SYSTEM_WATCHED = "watched"
SYSTEM_WILL_WATCH = "will_watch"

SYSTEM_FOLDER_DEFINITIONS = (
    {
        "system_key": SYSTEM_CONTINUE_WATCHING,
        "status": STATUS_WATCHING,
        "title": "Продолжить просмотр",
        "description": "Фильмы и сериалы, которые пользователь смотрит сейчас",
    },
    {
        "system_key": SYSTEM_WATCHED,
        "status": STATUS_COMPLETED,
        "title": "Просмотрено",
        "description": "Контент, который пользователь уже посмотрел",
    },
    {
        "system_key": SYSTEM_WILL_WATCH,
        "status": STATUS_PLANNED,
        "title": "Буду смотреть",
        "description": "Контент, который пользователь отложил на будущее",
    },
)

STATUS_TO_SYSTEM_KEY = {
    STATUS_PLANNED: SYSTEM_WILL_WATCH,
    STATUS_WATCHING: SYSTEM_CONTINUE_WATCHING,
    STATUS_COMPLETED: SYSTEM_WATCHED,
}

SYSTEM_FOLDER_ORDER = {
    SYSTEM_CONTINUE_WATCHING: 0,
    SYSTEM_WATCHED: 1,
    SYSTEM_WILL_WATCH: 2,
}

STATUS_LABELS = {
    STATUS_PLANNED: "Планирую смотреть",
    STATUS_WATCHING: "Смотрю",
    STATUS_COMPLETED: "Просмотрено",
}

TYPE_LABELS = {
    "movie": "Фильм",
    "series": "Сериал",
}

SERIES_TYPE_ALIASES = {
    "series",
    "serial",
    "tv",
    "tvshow",
    "tv_show",
    "tvseries",
    "tv_series",
    "show",
    "episode",
    "episodes",
    "сериал",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_watch_status(
    status_value: str | None,
    *,
    fallback: str = STATUS_PLANNED,
) -> str:
    if status_value in STATUS_TO_SYSTEM_KEY:
        return str(status_value)
    return fallback


def default_progress_for_status(status_value: str | None) -> int:
    normalized_status = normalize_watch_status(status_value)
    if normalized_status == STATUS_COMPLETED:
        return 100
    if normalized_status == STATUS_WATCHING:
        return 36
    return 0


def resolve_progress_percent(
    status_value: str,
    progress_percent: int | None,
    progress_seconds: int | None,
    duration_seconds: int | None,
) -> int:
    normalized_status = normalize_watch_status(status_value)
    if normalized_status == STATUS_COMPLETED:
        return 100

    if progress_percent is not None:
        return progress_percent

    if progress_seconds is not None and duration_seconds:
        return max(0, min(100, round(progress_seconds / duration_seconds * 100)))

    return 0


def clamp_progress_percent(progress_percent: int) -> int:
    return max(0, min(100, int(progress_percent)))


def normalize_content_type(content_type: str | None) -> str:
    normalized = (content_type or "").strip().lower().replace("-", "_").replace(" ", "_")
    return "series" if normalized in SERIES_TYPE_ALIASES else "movie"


def get_type_label(content_type: str | None) -> str:
    return TYPE_LABELS.get(normalize_content_type(content_type), TYPE_LABELS["movie"])


def build_history_badge(item: WatchItem) -> str | None:
    if normalize_content_type(item.content_type) != "series":
        return None

    if item.season is not None and item.episode is not None:
        return f"Сезон {item.season}, серия {item.episode}"

    if item.season is not None:
        return f"Сезон {item.season}"

    if item.episode is not None:
        return f"Серия {item.episode}"

    return None


def build_media_meta(
    item: WatchItem,
    *,
    genres_mode: str = "all",
    include_year: bool = True,
    include_duration: bool = True,
    empty_fallback: str | None = None,
) -> str | None:
    parts: list[str] = []
    if item.genres:
        if genres_mode == "first":
            parts.append(str(item.genres[0]))
        else:
            parts.append(", ".join(item.genres))
    if include_year and item.year is not None:
        parts.append(str(item.year))
    if include_duration and item.duration_text:
        parts.append(item.duration_text)
    if not parts and empty_fallback:
        parts.append(empty_fallback)
    return " · ".join(parts) or None


def apply_watch_item_state(
    item: WatchItem,
    *,
    content_type: str | object = UNSET,
    status_value: str | object = UNSET,
    progress_percent: int | None | object = UNSET,
    progress_seconds: int | None | object = UNSET,
    duration_seconds: int | None | object = UNSET,
    season: int | None | object = UNSET,
    episode: int | None | object = UNSET,
    watched_at: datetime | None | object = UNSET,
    progress_mode: str = "resolve",
    reject_non_series_position: bool = False,
    clear_watched_at_on_incomplete_status: bool = False,
) -> str:
    if content_type is not UNSET:
        item.content_type = normalize_content_type(content_type)

    normalized_type = normalize_content_type(item.content_type)

    if duration_seconds is not UNSET:
        item.duration_seconds = duration_seconds
    if progress_seconds is not UNSET:
        item.progress_seconds = progress_seconds

    if normalized_type != "series":
        if reject_non_series_position and (season is not UNSET or episode is not UNSET):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Сезон и серия доступны только для сериалов"},
            )
        item.season = None
        item.episode = None
    else:
        if season is not UNSET:
            item.season = season
        if episode is not UNSET:
            item.episode = episode

    explicit_status = status_value is not UNSET
    next_status = normalize_watch_status(
        status_value if explicit_status else item.status,
        fallback=item.status or STATUS_PLANNED,
    )
    if explicit_status:
        item.status = next_status

    if progress_mode == "resolve":
        should_resolve_progress = (
            explicit_status
            or progress_percent is not UNSET
            or progress_seconds is not UNSET
            or duration_seconds is not UNSET
        )
        if should_resolve_progress:
            candidate_progress = (
                item.progress_percent if progress_percent is UNSET else progress_percent
            )
            item.progress_percent = resolve_progress_percent(
                status_value=next_status,
                progress_percent=candidate_progress,
                progress_seconds=item.progress_seconds,
                duration_seconds=item.duration_seconds,
            )
    elif progress_percent is not UNSET:
        item.progress_percent = clamp_progress_percent(int(progress_percent))
    elif explicit_status and next_status == STATUS_COMPLETED:
        item.progress_percent = 100

    if not explicit_status and item.progress_percent >= 100:
        next_status = STATUS_COMPLETED
        item.status = STATUS_COMPLETED

    explicit_watched_at = watched_at is not UNSET
    if next_status == STATUS_COMPLETED:
        item.progress_percent = 100
        if explicit_watched_at:
            item.watched_at = watched_at or item.watched_at or now_utc()
        elif item.watched_at is None:
            item.watched_at = now_utc()
        if item.progress_seconds is None and item.duration_seconds is not None:
            item.progress_seconds = item.duration_seconds
    elif explicit_watched_at:
        item.watched_at = watched_at
    elif clear_watched_at_on_incomplete_status and explicit_status:
        item.watched_at = None

    return next_status


def get_system_folder_for_status(db: Session, user: User, status_value: str) -> Folder:
    from app.services.library import ensure_default_folders

    ensure_default_folders(db=db, user=user)
    db.flush()

    folder_map = {
        folder.system_key or "": folder
        for folder in db.scalars(
            select(Folder).where(Folder.user_id == user.id, Folder.is_system.is_(True))
        ).all()
    }
    system_key = STATUS_TO_SYSTEM_KEY[normalize_watch_status(status_value)]
    folder = folder_map.get(system_key)
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Системная папка не найдена"},
        )
    return folder
