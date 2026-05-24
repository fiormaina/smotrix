from collections.abc import Generator

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.user import User
from app.services.users import get_user_by_id


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



def get_optional_current_user(
    authorization: str | None = Header(default=None),
    auth_cookie: str | None = Cookie(default=None, alias=settings.auth_cookie_name),
    db: Session = Depends(get_db),
) -> User | None:
    token = extract_access_token(authorization=authorization, auth_cookie=auth_cookie)
    if token is None:
        return None

    user_id = decode_access_token(token)
    return get_user_by_id(db, user_id)



def get_current_user(
    authorization: str | None = Header(default=None),
    auth_cookie: str | None = Cookie(default=None, alias=settings.auth_cookie_name),
    db: Session = Depends(get_db),
) -> User:
    user = get_optional_current_user(
        authorization=authorization,
        auth_cookie=auth_cookie,
        db=db,
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Требуется токен авторизации"},
        )
    return user


def extract_access_token(
    authorization: str | None,
    auth_cookie: str | None,
) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", maxsplit=1)[1].strip()
        if token:
            return token

    if auth_cookie:
        return auth_cookie.strip() or None

    return None
