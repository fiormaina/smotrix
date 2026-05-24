import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import select

from app.core.security import decode_access_token, hash_password, verify_password
from app.models.folder import Folder
from app.schemas.auth import ExtensionLoginRequest, LoginRequest, RegisterRequest, UpdateProfileRequest
from app.services.users import (
    authenticate_extension_user,
    authenticate_user,
    create_user as create_user_service,
    update_user_profile,
)
from tests.helpers import create_session, create_user


class UserServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = create_session()

    def tearDown(self) -> None:
        self.db.close()

    def test_create_user_normalizes_identity_and_creates_default_folders(self) -> None:
        with patch("app.services.users.generate_extension_code", return_value="MT-ABCD-1234"):
            user = create_user_service(
                self.db,
                RegisterRequest(
                    email="USER@Example.com",
                    login="TeStEr",
                    password="Password123",
                ),
            )

        folder_keys = {
            folder.system_key
            for folder in self.db.scalars(
                select(Folder).where(Folder.user_id == user.id, Folder.is_system.is_(True))
            ).all()
        }
        self.assertEqual(user.email, "user@example.com")
        self.assertEqual(user.login, "tester")
        self.assertEqual(user.display_name, "tester")
        self.assertEqual(user.extension_code, "MT-ABCD-1234")
        self.assertTrue(verify_password("Password123", user.password_hash))
        self.assertEqual(folder_keys, {"continue_watching", "watched", "will_watch"})

    def test_create_user_rejects_duplicate_email(self) -> None:
        create_user(
            self.db,
            email="owner@example.com",
            login="owner",
            display_name="Owner",
        )

        with self.assertRaises(HTTPException) as context:
            create_user_service(
                self.db,
                RegisterRequest(
                    email="OWNER@example.com",
                    login="fresh-login",
                    password="Password123",
                ),
            )

        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(context.exception.detail["field"], "email")

    def test_update_user_profile_rejects_existing_login(self) -> None:
        first_user = create_user(
            self.db,
            email="first@example.com",
            login="first",
            display_name="First",
        )
        create_user(
            self.db,
            email="second@example.com",
            login="second",
            display_name="Second",
        )

        with self.assertRaises(HTTPException) as context:
            update_user_profile(
                self.db,
                first_user,
                UpdateProfileRequest(display_name="First Updated", login="second"),
            )

        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(context.exception.detail["field"], "login")

    def test_authenticate_user_accepts_login_and_returns_decodable_token(self) -> None:
        user = create_user(
            self.db,
            email="user@example.com",
            login="tester",
            display_name="Tester",
            password_hash=hash_password("Password123"),
        )

        response = authenticate_user(
            self.db,
            LoginRequest(identifier="TESTER", password="Password123"),
        )

        self.assertEqual(response.user.id, user.id)
        self.assertEqual(decode_access_token(response.access_token), user.id)

    def test_authenticate_user_rejects_invalid_password_hash(self) -> None:
        create_user(
            self.db,
            email="user@example.com",
            login="tester",
            display_name="Tester",
            password_hash="broken-hash",
        )

        with self.assertRaises(HTTPException) as context:
            authenticate_user(
                self.db,
                LoginRequest(identifier="tester", password="Password123"),
            )

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["field"], "password")

    def test_authenticate_extension_user_rejects_unknown_code(self) -> None:
        with self.assertRaises(HTTPException) as context:
            authenticate_extension_user(
                self.db,
                ExtensionLoginRequest(extension_code="MT-AAAA-0001"),
            )

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["field"], "extension_code")


if __name__ == "__main__":
    unittest.main()
