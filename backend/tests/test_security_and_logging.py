import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import unittest

from fastapi import HTTPException

from app.core.config import settings
from app.core.logging import BODY_LOG_PATH_PREFIXES, format_body_for_log, should_log_body, truncate_log_value
from app.core.security import create_access_token, decode_access_token


def build_token(*, user_id: int, expires_at: datetime) -> str:
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


class SecurityAndLoggingTests(unittest.TestCase):
    def test_decode_access_token_round_trip(self) -> None:
        token = create_access_token(42)

        self.assertEqual(decode_access_token(token), 42)

    def test_decode_access_token_rejects_tampered_signature(self) -> None:
        token = create_access_token(42)
        tampered_token = f"{token.rsplit('.', maxsplit=1)[0]}.invalid"

        with self.assertRaises(HTTPException) as context:
            decode_access_token(tampered_token)

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["message"], "Неверный токен авторизации")

    def test_decode_access_token_rejects_expired_token(self) -> None:
        expired_token = build_token(
            user_id=7,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )

        with self.assertRaises(HTTPException) as context:
            decode_access_token(expired_token)

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["message"], "Срок действия токена истек")

    def test_format_body_for_log_parses_json_and_handles_invalid_payloads(self) -> None:
        json_body = format_body_for_log(b'{"title":"Movie","rating":9}', "application/json")
        invalid_json_body = format_body_for_log(b"{broken", "application/json")
        plain_text_body = format_body_for_log(b"  simple body  ", "text/plain")

        self.assertEqual(json_body, "{'title': 'Movie', 'rating': 9}")
        self.assertEqual(invalid_json_body, "{broken")
        self.assertEqual(plain_text_body, "  simple body  ")

    def test_truncate_and_path_checks_cover_logging_helpers(self) -> None:
        self.assertEqual(format_body_for_log(b"", "application/json"), "<empty>")
        self.assertTrue(should_log_body(f"{BODY_LOG_PATH_PREFIXES[0]}/123"))
        self.assertFalse(should_log_body("/api/v1/auth/login"))
        self.assertTrue(truncate_log_value("x" * 13000).endswith("...<truncated>"))


if __name__ == "__main__":
    unittest.main()
