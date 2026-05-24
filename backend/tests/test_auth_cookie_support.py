import asyncio
import json
import unittest

from fastapi import Response

from app.api.deps import extract_access_token
from app.core.config import settings
from app.core.security import clear_auth_cookie, set_auth_cookie
from app.main import app


async def send_request(
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: bytes = b"",
) -> tuple[int, dict[str, str], bytes]:
    request_headers = headers or {}
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in request_headers.items()
    ]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path.split("?", maxsplit=1)[0],
        "raw_path": path.split("?", maxsplit=1)[0].encode("ascii"),
        "query_string": path.split("?", maxsplit=1)[1].encode("ascii")
        if "?" in path
        else b"",
        "root_path": "",
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8000),
    }

    sent_messages: list[dict[str, object]] = []
    body_sent = False

    async def receive() -> dict[str, object]:
        nonlocal body_sent
        if body_sent:
            return {"type": "http.disconnect"}
        body_sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict[str, object]) -> None:
        sent_messages.append(message)

    await app(scope, receive, send)

    start_message = next(
        message for message in sent_messages if message["type"] == "http.response.start"
    )
    response_headers = {
        key.decode("latin-1"): value.decode("latin-1")
        for key, value in start_message["headers"]
    }
    response_body = b"".join(
        message.get("body", b"")
        for message in sent_messages
        if message["type"] == "http.response.body"
    )
    return start_message["status"], response_headers, response_body


class AuthCookieSupportTests(unittest.TestCase):
    def test_extract_access_token_prefers_bearer_header(self) -> None:
        token = extract_access_token(
            authorization="Bearer header-token",
            auth_cookie="cookie-token",
        )

        self.assertEqual(token, "header-token")

    def test_extract_access_token_falls_back_to_cookie(self) -> None:
        token = extract_access_token(
            authorization=None,
            auth_cookie="cookie-token",
        )

        self.assertEqual(token, "cookie-token")

    def test_set_auth_cookie_marks_cookie_http_only(self) -> None:
        response = Response()

        set_auth_cookie(response, "test-token")

        cookie_header = response.headers["set-cookie"]
        self.assertIn(f"{settings.auth_cookie_name}=test-token", cookie_header)
        self.assertIn("HttpOnly", cookie_header)
        self.assertIn("Path=/", cookie_header)

    def test_clear_auth_cookie_expires_cookie(self) -> None:
        response = Response()

        clear_auth_cookie(response)

        cookie_header = response.headers["set-cookie"]
        self.assertIn(f"{settings.auth_cookie_name}=\"\"", cookie_header)
        self.assertIn("expires=", cookie_header.lower())
        self.assertIn("httponly", cookie_header.lower())

    def test_logout_clears_auth_cookie(self) -> None:
        status_code, headers, body = asyncio.run(
            send_request("POST", "/api/v1/auth/logout")
        )

        self.assertEqual(status_code, 200)
        self.assertIn("set-cookie", headers)
        self.assertIn(settings.auth_cookie_name, headers["set-cookie"])
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["loggedOut"], True)


if __name__ == "__main__":
    unittest.main()
