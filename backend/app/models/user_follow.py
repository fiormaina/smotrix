from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class UserFollow(Base):
    __tablename__ = "user_follows"
    __table_args__ = (
        UniqueConstraint(
            "follower_user_id",
            "followed_user_id",
            name="uq_user_follows_follower_followed",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    follower_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    followed_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    follower = relationship(
        "User",
        foreign_keys=[follower_user_id],
        back_populates="following_links",
    )
    followed = relationship(
        "User",
        foreign_keys=[followed_user_id],
        back_populates="follower_links",
    )
