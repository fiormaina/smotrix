import asyncio
import unittest

from app.main import app


async def send_options_request(path: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
    raw_headers = [(key.lower().encode("latin-1"), value.encode("latin-1")) for key, value in headers.items()]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "OPTIONS",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "root_path": "",
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8000),
    }

    sent_messages: list[dict[str, object]] = []

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, object]) -> None:
        sent_messages.append(message)

    await app(scope, receive, send)

    start_message = next(message for message in sent_messages if message["type"] == "http.response.start")
    body_parts = [
        message.get("body", b"")
        for message in sent_messages
        if message["type"] == "http.response.body"
    ]
    response_headers = {
        key.decode("latin-1"): value.decode("latin-1")
        for key, value in start_message["headers"]
    }
    return start_message["status"], response_headers, b"".join(body_parts)


class CorsTests(unittest.TestCase):
    def test_preflight_to_loopback_allows_private_network_for_allowed_origin(self) -> None:
        status_code, headers, _ = asyncio.run(
            send_options_request(
                "/api/v1/auth/login",
                headers={
                    "Origin": "https://fiormaina.github.io",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                    "Access-Control-Request-Private-Network": "true",
                },
            )
        )

        self.assertEqual(status_code, 200)
        self.assertEqual(headers.get("access-control-allow-origin"), "https://fiormaina.github.io")
        self.assertEqual(headers.get("access-control-allow-private-network"), "true")

    def test_preflight_to_loopback_does_not_allow_private_network_for_unknown_origin(self) -> None:
        status_code, headers, _ = asyncio.run(
            send_options_request(
                "/api/v1/auth/login",
                headers={
                    "Origin": "https://example.com",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                    "Access-Control-Request-Private-Network": "true",
                },
            )
        )

        self.assertEqual(status_code, 400)
        self.assertIsNone(headers.get("access-control-allow-origin"))


if __name__ == "__main__":
    unittest.main()
