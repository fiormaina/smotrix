import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Response, status

from app.core.config import settings


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=settings.password_bcrypt_rounds)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    normalized_hash = password_hash
    if normalized_hash.startswith("$2y$"):
        normalized_hash = "$2b$" + normalized_hash[4:]

    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        normalized_hash.encode("utf-8"),
    )


def create_access_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes,
    )
    payload = {
        "sub": str(user_id),
        "exp": int(expires_at.timestamp()),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_part = base64.urlsafe_b64encode(payload_bytes).decode("utf-8").rstrip("=")
    signature = hmac.new(
        settings.auth_secret_key.encode("utf-8"),
        payload_part.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    signature_part = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{payload_part}.{signature_part}"


def decode_access_token(token: str) -> int:
    try:
        payload_part, signature_part = token.split(".", maxsplit=1)
    except ValueError:
        raise_invalid_token()

    expected_signature = hmac.new(
        settings.auth_secret_key.encode("utf-8"),
        payload_part.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_signature_part = (
        base64.urlsafe_b64encode(expected_signature).decode("utf-8").rstrip("=")
    )
    if not hmac.compare_digest(signature_part, expected_signature_part):
        raise_invalid_token()

    padded_payload = payload_part + "=" * (-len(payload_part) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded_payload))
        expires_at = int(payload["exp"])
        user_id = int(payload["sub"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise_invalid_token()

    if expires_at < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Срок действия токена истек"},
        )

    return user_id


def set_auth_cookie(response: Response, token: str) -> None:
    max_age = settings.access_token_expire_minutes * 60
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=max_age,
        expires=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        domain=settings.auth_cookie_domain,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.auth_cookie_name,
        domain=settings.auth_cookie_domain,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )


def raise_invalid_token() -> None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"message": "Неверный токен авторизации"},
    )
