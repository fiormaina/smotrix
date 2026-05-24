from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

WatchSource = Literal["manual", "extension"]
WatchStatus = Literal["planned", "watching", "completed"]
ContentType = Literal["movie", "series"]


class FolderResponse(BaseModel):
    id: int
    title: str
    description: str | None = None
    access: str = "private"
    is_system: bool = Field(alias="isSystem")
    system_key: str | None = Field(alias="systemKey")
    can_delete: bool = Field(alias="canDelete")
    items_count: int = Field(alias="itemsCount")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class FolderListResponse(BaseModel):
    items: list[FolderResponse]


class CreateWatchItemRequest(BaseModel):
    source: WatchSource = "manual"
    content_type: ContentType = Field(alias="type")
    title: str = Field(min_length=1, max_length=255)
    source_url: str | None = Field(default=None, alias="url")
    year: int | None = Field(default=None, ge=1800, le=3000)
    genres: list[str] = Field(default_factory=list, max_length=10)
    duration_text: str | None = Field(default=None, alias="duration", max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    status: WatchStatus | None = None
    progress_percent: int | None = Field(default=None, alias="progress", ge=0, le=100)
    progress_seconds: int | None = Field(default=None, alias="progressSeconds", ge=0)
    duration_seconds: int | None = Field(default=None, alias="durationSeconds", ge=1)
    season: int | None = Field(default=None, ge=0)
    episode: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=10)
    comment: str | None = Field(default=None, max_length=800)
    custom_folder_id: int | None = Field(default=None, alias="folderId")
    watched_at: datetime | None = Field(default=None, alias="watchedAt")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, title: str) -> str:
        normalized = title.strip()
        if not normalized:
            raise ValueError("Title must not be empty")
        return normalized

    @field_validator("genres")
    @classmethod
    def normalize_genres(cls, genres: list[str]) -> list[str]:
        return [genre.strip() for genre in genres if genre and genre.strip()]

    @field_validator("duration_text", "description", "comment")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("source_url")
    @classmethod
    def normalize_source_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_payload(self) -> "CreateWatchItemRequest":
        if self.source == "manual" and self.status is None:
            raise ValueError("Status is required for manual items")

        if self.content_type == "movie" and (self.season is not None or self.episode is not None):
            raise ValueError("Season and episode are only available for series")

        if self.source == "manual" and self.status == "completed" and self.rating is None:
            raise ValueError("Rating is required when manually adding completed content")

        return self


class UpdateWatchItemRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    source_url: str | None = Field(default=None, alias="url")
    year: int | None = Field(default=None, ge=1800, le=3000)
    genres: list[str] | None = Field(default=None, max_length=10)
    duration_text: str | None = Field(default=None, alias="duration", max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    status: WatchStatus | None = None
    progress_percent: int | None = Field(default=None, alias="progress", ge=0, le=100)
    progress_seconds: int | None = Field(default=None, alias="progressSeconds", ge=0)
    duration_seconds: int | None = Field(default=None, alias="durationSeconds", ge=1)
    season: int | None = Field(default=None, ge=0)
    episode: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=10)
    comment: str | None = Field(default=None, max_length=800)
    custom_folder_id: int | None = Field(default=None, alias="folderId")
    watched_at: datetime | None = Field(default=None, alias="watchedAt")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, title: str | None) -> str | None:
        if title is None:
            return None
        normalized = title.strip()
        if not normalized:
            raise ValueError("Title must not be empty")
        return normalized

    @field_validator("genres")
    @classmethod
    def normalize_genres(cls, genres: list[str] | None) -> list[str] | None:
        if genres is None:
            return None
        return [genre.strip() for genre in genres if genre and genre.strip()]

    @field_validator("duration_text", "description", "comment")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("source_url")
    @classmethod
    def normalize_source_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class WatchHistoryItemResponse(BaseModel):
    id: int
    title: str
    content_type: ContentType = Field(alias="type")
    source_url: str | None = Field(default=None, alias="url")
    status: WatchStatus
    progress_percent: int = Field(alias="progress")
    progress_seconds: int | None = Field(alias="progressSeconds")
    duration_seconds: int | None = Field(alias="durationSeconds")
    user_rating: int | None = Field(default=None, alias="userRating")
    comment: str | None = None
    custom_folder_id: int | None = Field(alias="folderId")
    system_folder_id: int = Field(alias="systemFolderId")
    badge: str | None = None
    meta: str | None = None
    year: int | None = None
    genres: list[str] = Field(default_factory=list)
    duration_text: str | None = Field(default=None, alias="duration")
    source: WatchSource
    updated_at: datetime = Field(alias="updatedAt")
    watched_at: datetime | None = Field(default=None, alias="watchedAt")

    model_config = ConfigDict(populate_by_name=True)


class WatchItemsListResponse(BaseModel):
    items: list[WatchHistoryItemResponse]
    watching_count: int = Field(alias="watchingCount")
    completed_count: int = Field(alias="completedCount")
    planned_count: int = Field(alias="plannedCount")

    model_config = ConfigDict(populate_by_name=True)


class WatchItemDetailResponse(BaseModel):
    id: int
    title: str
    source_url: str | None = Field(default=None, alias="url")
    genres: list[str] = Field(default_factory=list)
    year: int | None = None
    duration_text: str | None = Field(default=None, alias="duration")
    content_type: ContentType = Field(alias="type")
    imdb_rating: str = Field(alias="imdbRating")
    user_rating: int | None = Field(default=None, alias="userRating")
    progress_percent: int = Field(alias="progress")
    progress_seconds: int | None = Field(alias="progressSeconds")
    duration_seconds: int | None = Field(alias="durationSeconds")
    custom_folder_id: int | None = Field(alias="folderId")
    system_folder_id: int = Field(alias="systemFolderId")
    watched: bool
    comment: str | None = None
    description: str | None = None
    status: WatchStatus
    season: int | None = None
    episode: int | None = None
    source: WatchSource
    watched_at: datetime | None = Field(default=None, alias="watchedAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)
