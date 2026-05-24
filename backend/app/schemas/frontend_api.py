from pydantic import BaseModel, ConfigDict, Field


class FrontendPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class ViewerPayload(FrontendPayload):
    viewer_id: int | None = Field(default=None, alias="viewerId")


class FolderCreatePayload(ViewerPayload):
    title: str
    description: str = ""
    visibility: str = "private"


class FolderUpdatePayload(ViewerPayload):
    title: str | None = None
    description: str | None = None
    visibility: str | None = None


class FolderItemPayload(ViewerPayload):
    media_id: str | int = Field(alias="mediaId")


class FollowPayload(ViewerPayload):
    pass


class WatchHistoryCreatePayload(FrontendPayload):
    type: str = "movie"
    title: str
    url: str | None = None
    year: int | None = None
    status: str = "planned"
    season: int | None = None
    episode: int | None = None
    rating: int | None = None
    comment: str | None = None
    folder_id: int | None = Field(default=None, alias="folderId")


class WatchHistoryUpdatePayload(FrontendPayload):
    type: str | None = None
    status: str | None = None
    progress: int | None = None
    url: str | None = None
    season: int | None = None
    episode: int | None = None
    rating: int | None = None
    comment: str | None = None
    watched_at: str | None = Field(default=None, alias="watchedAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    folder_id: int | None = Field(default=None, alias="folderId")


class MediaUpdatePayload(FrontendPayload):
    user_rating: int | None = Field(default=None, alias="userRating")
    comment: str | None = None
    watched: bool | None = None
    progress: int | None = None
    folder_id: int | None = Field(default=None, alias="folderId")
