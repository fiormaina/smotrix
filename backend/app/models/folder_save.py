from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class FolderSave(Base):
    __tablename__ = "folder_saves"
    __table_args__ = (
        UniqueConstraint("viewer_user_id", "folder_id", name="uq_folder_saves_viewer_folder"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    viewer_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    viewer = relationship("User", back_populates="saved_folder_links")
    folder = relationship("Folder", back_populates="saved_by_links")
