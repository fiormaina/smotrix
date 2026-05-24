import asyncio
import json
import unittest

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


class AuthGuardsTests(unittest.TestCase):
    def test_watch_history_requires_authorization(self) -> None:
        status_code, _, body = asyncio.run(send_request("GET", "/api/v1/watch-history"))

        self.assertEqual(status_code, 401)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["detail"]["message"], "Требуется токен авторизации")

    def test_media_recent_requires_authorization_even_with_viewer_id(self) -> None:
        status_code, _, body = asyncio.run(
            send_request("GET", "/api/v1/media/recent?viewerId=1")
        )

        self.assertEqual(status_code, 401)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["detail"]["message"], "Требуется токен авторизации")

    def test_public_profile_view_remains_available_without_authorization(self) -> None:
        status_code, _, body = asyncio.run(send_request("GET", "/api/v1/profiles/view"))

        self.assertEqual(status_code, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["status"], "missing")


if __name__ == "__main__":
    unittest.main()
