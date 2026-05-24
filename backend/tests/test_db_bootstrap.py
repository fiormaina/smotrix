import unittest

from app.db.bootstrap import build_mysql_compatibility_statements


class DatabaseBootstrapTests(unittest.TestCase):
    def test_builds_compatibility_statements_for_legacy_schema(self) -> None:
        statements = build_mysql_compatibility_statements(
            table_columns={
                "users": {"id", "email", "login", "password_hash", "created_at"},
                "watch_items": {
                    "id",
                    "user_id",
                    "system_folder_id",
                    "custom_folder_id",
                    "source",
                    "content_type",
                    "title",
                },
            },
            table_indexes={"users": set(), "watch_items": set()},
            nullable_columns={"users": set(), "watch_items": set()},
        )

        self.assertIn(
            "ALTER TABLE users ADD COLUMN display_name VARCHAR(80) NULL AFTER login",
            statements,
        )
        self.assertIn(
            "ALTER TABLE users ADD COLUMN extension_code VARCHAR(32) NULL AFTER display_name",
            statements,
        )
        self.assertIn(
            "ALTER TABLE users ADD COLUMN avatar_key VARCHAR(32) NULL AFTER extension_code",
            statements,
        )
        self.assertIn(
            "ALTER TABLE users ADD COLUMN avatar_image TEXT NULL AFTER avatar_key",
            statements,
        )
        self.assertIn(
            "ALTER TABLE users ADD UNIQUE KEY uq_users_extension_code (extension_code)",
            statements,
        )
        self.assertIn(
            "ALTER TABLE watch_items ADD COLUMN source_url TEXT NULL AFTER title",
            statements,
        )

    def test_skips_add_column_statements_when_schema_is_current(self) -> None:
        statements = build_mysql_compatibility_statements(
            table_columns={
                "users": {
                    "id",
                    "email",
                    "login",
                    "display_name",
                    "extension_code",
                    "avatar_key",
                    "avatar_image",
                    "password_hash",
                    "created_at",
                },
                "watch_items": {
                    "id",
                    "user_id",
                    "system_folder_id",
                    "custom_folder_id",
                    "source",
                    "content_type",
                    "title",
                    "source_url",
                },
            },
            table_indexes={"users": {"uq_users_extension_code"}, "watch_items": set()},
            nullable_columns={"users": set(), "watch_items": set()},
        )

        self.assertEqual(statements, [])

    def test_keeps_backfill_for_nullable_legacy_columns(self) -> None:
        statements = build_mysql_compatibility_statements(
            table_columns={
                "users": {
                    "id",
                    "email",
                    "login",
                    "display_name",
                    "extension_code",
                    "password_hash",
                    "created_at",
                },
            },
            table_indexes={"users": set()},
            nullable_columns={"users": {"display_name", "extension_code"}},
        )

        self.assertIn(
            "ALTER TABLE users ADD COLUMN avatar_key VARCHAR(32) NULL AFTER extension_code",
            statements,
        )
        self.assertIn(
            "UPDATE users SET display_name = login WHERE display_name IS NULL OR TRIM(display_name) = ''",
            statements,
        )
        self.assertIn(
            "ALTER TABLE users MODIFY extension_code VARCHAR(32) NOT NULL",
            statements,
        )


if __name__ == "__main__":
    unittest.main()
