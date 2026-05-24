from datetime import datetime
from urllib.parse import urlencode

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    login: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    extension_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    avatar_key: Mapped[str | None] = mapped_column(String(32), nullable=True)
    avatar_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    folders = relationship(
        "Folder",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    watch_items = relationship(
        "WatchItem",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    saved_folder_links = relationship(
        "FolderSave",
        back_populates="viewer",
        cascade="all, delete-orphan",
        foreign_keys="FolderSave.viewer_user_id",
    )
    following_links = relationship(
        "UserFollow",
        back_populates="follower",
        cascade="all, delete-orphan",
        foreign_keys="UserFollow.follower_user_id",
    )
    follower_links = relationship(
        "UserFollow",
        back_populates="followed",
        cascade="all, delete-orphan",
        foreign_keys="UserFollow.followed_user_id",
    )

    @property
    def profile_url(self) -> str:
        base_url = settings.frontend_base_url.rstrip("/")
        return f"{base_url}/pages/profile.html?{urlencode({'user': self.login})}"
