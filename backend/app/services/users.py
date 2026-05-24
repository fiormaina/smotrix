import secrets
import string

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ExtensionLoginRequest,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
)


def get_user_by_email(db: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email.lower())
    return db.scalar(statement)



def get_user_by_login(db: Session, login: str) -> User | None:
    statement = select(User).where(User.login == login.lower())
    return db.scalar(statement)



def get_user_by_id(db: Session, user_id: int) -> User | None:
    statement = select(User).where(User.id == user_id)
    return db.scalar(statement)



def get_user_by_identifier(db: Session, identifier: str) -> User | None:
    normalized_identifier = identifier.lower()
    statement = select(User).where(
        (User.email == normalized_identifier) | (User.login == normalized_identifier),
    )
    return db.scalar(statement)



def get_user_by_extension_code(db: Session, extension_code: str) -> User | None:
    statement = select(User).where(User.extension_code == extension_code)
    return db.scalar(statement)



def generate_extension_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        first_segment = "".join(secrets.choice(alphabet) for _ in range(4))
        second_segment = "".join(secrets.choice(alphabet) for _ in range(4))
        extension_code = f"MT-{first_segment}-{second_segment}"
        if get_user_by_extension_code(db, extension_code) is None:
            return extension_code

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"message": "Не удалось сгенерировать код подключения расширения"},
    )



def create_user(db: Session, payload: RegisterRequest) -> User:
    email = payload.email.lower()
    login = payload.login.lower()
    if get_user_by_email(db, email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "email",
                "message": "Пользователь с такой почтой уже существует",
            },
        )
    if get_user_by_login(db, login) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "login",
                "message": "Пользователь с таким логином уже существует",
            },
        )

    user = User(
        email=email,
        login=login,
        display_name=login,
        extension_code=generate_extension_code(db),
        password_hash=hash_password(payload.password),
    )
    db.add(user)

    try:
        db.flush()

        from app.services.library import ensure_default_folders

        ensure_default_folders(db=db, user=user)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Пользователь с такими данными уже существует",
            },
        ) from exc

    db.refresh(user)
    return user



def update_user_profile(db: Session, user: User, payload: UpdateProfileRequest) -> User:
    existing_user = get_user_by_login(db, payload.login)
    if existing_user is not None and existing_user.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "login",
                "message": "Пользователь с таким логином уже существует",
            },
        )

    user.display_name = payload.display_name
    user.login = payload.login

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Не удалось сохранить изменения профиля"},
        ) from exc

    db.refresh(user)
    return user



def delete_user_account(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()



def authenticate_user(db: Session, payload: LoginRequest) -> AuthResponse:
    user = get_user_by_identifier(db, payload.identifier)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "field": "identifier",
                "message": "Пользователь не найден",
            },
        )

    try:
        is_password_valid = verify_password(
            payload.password,
            user.password_hash,
        )
    except ValueError:
        is_password_valid = False

    if not is_password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "field": "password",
                "message": "Неверный пароль",
            },
        )

    return AuthResponse(
        access_token=create_access_token(user.id),
        user=user,
    )



def authenticate_extension_user(db: Session, payload: ExtensionLoginRequest) -> AuthResponse:
    user = get_user_by_extension_code(db, payload.extension_code)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "field": "extension_code",
                "message": "Код подключения расширения не найден",
            },
        )

    return AuthResponse(
        access_token=create_access_token(user.id),
        user=user,
    )
