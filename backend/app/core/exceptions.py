from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core.logging import logger


FIELD_NAMES = {
    "email": "почта",
    "login": "логин",
    "display_name": "имя",
    "extension_code": "код расширения",
    "identifier": "почта или логин",
    "password": "пароль",
}


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    app.add_exception_handler(ValidationError, validation_exception_handler)
    app.add_exception_handler(SQLAlchemyError, database_exception_handler)
    app.add_exception_handler(Exception, unexpected_exception_handler)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return error_response(exc.status_code, normalize_detail(exc.detail))


async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return error_response(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        validation_errors_to_detail(exc.errors()),
    )


async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    return error_response(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        validation_errors_to_detail(exc.errors()),
    )


async def database_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database error on %s %s", request.method, request.url.path)
    return error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        {"message": "Ошибка базы данных. Попробуйте позже"},
    )


async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unexpected error on %s %s", request.method, request.url.path)
    return error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        {"message": "Внутренняя ошибка сервера. Попробуйте позже"},
    )


def error_response(status_code: int, detail: dict[str, Any]) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail})


def normalize_detail(detail: Any) -> dict[str, Any]:
    if isinstance(detail, dict):
        return {
            "field": detail.get("field"),
            "message": str(detail.get("message") or "Произошла ошибка"),
        }

    return {"message": translate_message(str(detail))}


def validation_errors_to_detail(errors: list[dict[str, Any]]) -> dict[str, Any]:
    first_error = errors[0] if errors else {}
    field = get_error_field(first_error)
    return {
        "field": field,
        "message": translate_validation_error(first_error, field),
    }


def get_error_field(error: dict[str, Any]) -> str | None:
    location = error.get("loc") or []
    if not location:
        return None

    field = location[-1]
    if isinstance(field, str):
        return field

    return None


def translate_validation_error(error: dict[str, Any], field: str | None) -> str:
    field_name = FIELD_NAMES.get(field or "", "поле")
    error_type = str(error.get("type") or "")
    context = error.get("ctx") or {}

    if error_type in {"missing", "value_error.missing"}:
        return f"Заполните поле: {field_name}"

    if "email" in error_type:
        return "Укажите корректную почту"

    if "string_too_short" in error_type or "min_length" in error_type:
        min_length = context.get("min_length")
        if min_length:
            return f"Поле {field_name} должно быть не короче {min_length} символов"
        return f"Поле {field_name} слишком короткое"

    if "string_too_long" in error_type or "max_length" in error_type:
        max_length = context.get("max_length")
        if max_length:
            return f"Поле {field_name} должно быть не длиннее {max_length} символов"
        return f"Поле {field_name} слишком длинное"

    if "string_pattern_mismatch" in error_type:
        return "Логин может содержать только латинские буквы, цифры, точку, дефис и нижнее подчеркивание"

    raw_message = str(error.get("msg") or "")
    if field == "email" or "email" in raw_message.lower():
        return "Укажите корректную почту"

    if "Password must contain at least one letter and one digit" in raw_message:
        return "Пароль должен содержать хотя бы одну букву и одну цифру"

    return f"Некорректное значение поля: {field_name}"


def translate_message(message: str) -> str:
    messages = {
        "Authorization bearer token is required": "Требуется токен авторизации",
        "Invalid token": "Неверный токен авторизации",
        "Token expired": "Срок действия токена истек",
        "User not found": "Пользователь не найден",
        "Not Found": "Маршрут не найден",
        "Method Not Allowed": "Метод запроса не разрешен",
    }
    return messages.get(message, message if is_russian(message) else "Произошла ошибка")


def is_russian(message: str) -> bool:
    return any("а" <= char.lower() <= "я" or char == "ё" for char in message)
