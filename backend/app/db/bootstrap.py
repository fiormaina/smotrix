from sqlalchemy import inspect, text

import app.models  # noqa: F401
from app.core.logging import logger
from app.db.session import engine
from app.models.base import Base


MYSQL_DIALECTS = {"mysql", "mariadb"}


def build_mysql_compatibility_statements(
    table_columns: dict[str, set[str]],
    table_indexes: dict[str, set[str]] | None = None,
    nullable_columns: dict[str, set[str]] | None = None,
) -> list[str]:
    statements: list[str] = []
    indexes = table_indexes or {}
    nullable = nullable_columns or {}

    user_columns = table_columns.get("users")
    if user_columns is not None:
        if "display_name" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN display_name VARCHAR(80) NULL AFTER login")
        if "display_name" not in user_columns or "display_name" in nullable.get("users", set()):
            statements.append("UPDATE users SET display_name = login WHERE display_name IS NULL OR TRIM(display_name) = ''")
            statements.append("ALTER TABLE users MODIFY display_name VARCHAR(80) NOT NULL")

        if "extension_code" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN extension_code VARCHAR(32) NULL AFTER display_name")
        if "extension_code" not in user_columns or "extension_code" in nullable.get("users", set()):
            statements.append(
                "UPDATE users "
                "SET extension_code = CONCAT('MT-', LPAD(UPPER(HEX(id)), 8, '0')) "
                "WHERE extension_code IS NULL OR TRIM(extension_code) = ''"
            )
            statements.append("ALTER TABLE users MODIFY extension_code VARCHAR(32) NOT NULL")
        if "uq_users_extension_code" not in indexes.get("users", set()):
            statements.append("ALTER TABLE users ADD UNIQUE KEY uq_users_extension_code (extension_code)")

        if "avatar_key" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN avatar_key VARCHAR(32) NULL AFTER extension_code")
        if "avatar_image" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN avatar_image TEXT NULL AFTER avatar_key")

    watch_item_columns = table_columns.get("watch_items")
    if watch_item_columns is not None and "source_url" not in watch_item_columns:
        statements.append("ALTER TABLE watch_items ADD COLUMN source_url TEXT NULL AFTER title")

    return statements


def ensure_database_schema() -> None:
    Base.metadata.create_all(bind=engine)

    if engine.dialect.name not in MYSQL_DIALECTS:
        return

    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    table_columns = {
        table_name: {column["name"] for column in inspector.get_columns(table_name)}
        for table_name in table_names
    }
    nullable_columns = {
        table_name: {
            column["name"]
            for column in inspector.get_columns(table_name)
            if column.get("nullable", True)
        }
        for table_name in table_names
    }
    table_indexes = {
        table_name: {
            index["name"]
            for index in inspector.get_indexes(table_name)
            if index.get("name")
        }
        for table_name in table_names
    }

    statements = build_mysql_compatibility_statements(
        table_columns=table_columns,
        table_indexes=table_indexes,
        nullable_columns=nullable_columns,
    )
    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

    logger.info("Applied %s database compatibility statement(s)", len(statements))
