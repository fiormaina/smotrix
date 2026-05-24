import logging
from json import JSONDecodeError, loads
import sys
import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from app.core.config import settings


logger = logging.getLogger("movie_tracker")

BODY_LOG_PATH_PREFIXES = (
    "/api/v1/watch-history",
    "/api/v1/media",
    "/api/v1/library/watch-items",
)
MAX_LOGGED_BODY_LENGTH = 12000


def resolve_log_level() -> int:
    configured_level = (settings.log_level or "").strip().upper()
    if configured_level:
        return getattr(logging, configured_level, logging.INFO)
    if "unittest" in sys.modules:
        return logging.WARNING
    return logging.INFO


def configure_logging() -> None:
    level = resolve_log_level()
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger.setLevel(level)


def should_log_body(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in BODY_LOG_PATH_PREFIXES)


def truncate_log_value(value: str) -> str:
    if len(value) <= MAX_LOGGED_BODY_LENGTH:
        return value
    return f"{value[:MAX_LOGGED_BODY_LENGTH]}...<truncated>"


def format_body_for_log(body: bytes, content_type: str | None) -> str:
    if not body:
        return "<empty>"

    decoded = body.decode("utf-8", errors="replace")
    if content_type and "application/json" in content_type.lower():
        try:
            return truncate_log_value(str(loads(decoded)))
        except JSONDecodeError:
            return truncate_log_value(decoded)
    return truncate_log_value(decoded)


async def clone_request_with_body(request: Request) -> tuple[Request, bytes]:
    body = await request.body()

    async def receive() -> dict[str, object]:
        return {
            "type": "http.request",
            "body": body,
            "more_body": False,
        }

    return Request(request.scope, receive), body


async def clone_response_with_body(response: Response) -> tuple[Response, bytes]:
    if hasattr(response, "body") and response.body is not None:
        body = response.body
    else:
        body = b""
        async for chunk in response.body_iterator:
            body += chunk

    cloned_response = Response(
        content=body,
        status_code=response.status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
        background=response.background,
    )
    return cloned_response, body


async def log_requests(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    started_at = time.perf_counter()
    request_body = b""
    should_log_payloads = should_log_body(request.url.path)
    if should_log_payloads:
        request, request_body = await clone_request_with_body(request)
        logger.info(
            "%s %s request body: %s",
            request.method,
            request.url.path,
            format_body_for_log(request_body, request.headers.get("content-type")),
        )

    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.exception(
            "%s %s failed after %.2fms",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise

    if should_log_payloads:
        response, response_body = await clone_response_with_body(response)
        logger.info(
            "%s %s response body: %s",
            request.method,
            request.url.path,
            format_body_for_log(response_body, response.headers.get("content-type")),
        )

    elapsed_ms = (time.perf_counter() - started_at) * 1000
    logger.info(
        "%s %s -> %s %.2fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response
