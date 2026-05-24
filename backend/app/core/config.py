from typing import Literal

from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    app_name: str = "Movie Tracker API"
    app_env: str = "local"
    log_level: str | None = None
    api_v1_prefix: str = "/api/v1"
    frontend_base_url: str = "https://fiormaina.github.io/movie-tracker-front"
    cors_origins: list[str] = [
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5500",
        "https://fiormaina.github.io",
        "null",
    ]

    mysql_host: str = Field(
        default="127.0.0.1",
        validation_alias=AliasChoices("MYSQL_HOST", "MYSQLHOST"),
    )
    mysql_port: int = Field(
        default=3306,
        validation_alias=AliasChoices("MYSQL_PORT", "MYSQLPORT"),
    )
    mysql_user: str = Field(
        default="root",
        validation_alias=AliasChoices("MYSQL_USER", "MYSQLUSER"),
    )
    mysql_password: str = Field(
        default="12345",
        validation_alias=AliasChoices("MYSQL_PASSWORD", "MYSQLPASSWORD"),
    )
    mysql_database: str = Field(
        default="movie_tracker",
        validation_alias=AliasChoices("MYSQL_DATABASE", "MYSQLDATABASE"),
    )

    password_bcrypt_rounds: int = 12
    auth_secret_key: str = "movie-tracker-local-secret"
    access_token_expire_minutes: int = 1440
    auth_cookie_name: str = "movie_tracker_access_token"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    auth_cookie_domain: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @computed_field
    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="mysql+pymysql",
            username=self.mysql_user,
            password=self.mysql_password,
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_database,
            query={"charset": "utf8mb4"},
        )


settings = Settings()


