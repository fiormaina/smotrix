from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Folder(Base):
    __tablename__ = "folders"
    __table_args__ = (
        UniqueConstraint("user_id", "system_key", name="uq_folders_user_system_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    access: Mapped[str] = mapped_column(String(20), nullable=False, default="private")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    system_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="folders")
    system_watch_items = relationship(
        "WatchItem",
        foreign_keys="WatchItem.system_folder_id",
        back_populates="system_folder",
    )
    custom_watch_items = relationship(
        "WatchItem",
        foreign_keys="WatchItem.custom_folder_id",
        back_populates="custom_folder",
    )
    saved_by_links = relationship(
        "FolderSave",
        back_populates="folder",
        cascade="all, delete-orphan",
    )

    @property
    def can_delete(self) -> bool:
        return not self.is_system
