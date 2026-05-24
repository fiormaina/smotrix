from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.folder import Folder
from app.models.user import User
from app.services.library import ensure_default_folders


def create_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def create_user(
    db: Session,
    *,
    email: str,
    login: str,
    display_name: str,
    extension_code: str | None = None,
    password_hash: str = "hashed",
) -> User:
    next_index = int(db.scalar(select(func.count()).select_from(User)) or 0) + 1
    user = User(
        email=email,
        login=login,
        display_name=display_name,
        extension_code=extension_code or f"MT-{next_index:04d}-{next_index:04d}",
        password_hash=password_hash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_custom_folder(
    db: Session,
    user: User,
    *,
    title: str,
    description: str | None = None,
    access: str = "private",
) -> Folder:
    folder = Folder(
        user_id=user.id,
        title=title,
        description=description,
        access=access,
        is_system=False,
        system_key=None,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def get_system_folder(db: Session, user: User, system_key: str) -> Folder:
    folder_map = ensure_default_folders(db, user)
    db.commit()
    return folder_map[system_key]
