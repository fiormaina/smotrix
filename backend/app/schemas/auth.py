from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    login: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)

    @field_validator("login")
    @classmethod
    def normalize_login(cls, login: str) -> str:
        return login.lower()

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        has_letter = any(char.isalpha() for char in password)
        has_digit = any(char.isdigit() for char in password)
        if not has_letter or not has_digit:
            raise ValueError("Password must contain at least one letter and one digit")
        return password


class UpdateProfileRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    login: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    avatar_key: str | None = None
    avatar_image: str | None = None

    model_config = ConfigDict(extra="ignore")

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, display_name: str) -> str:
        return display_name.strip()

    @field_validator("login")
    @classmethod
    def normalize_profile_login(cls, login: str) -> str:
        return login.strip().lower()


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, identifier: str) -> str:
        return identifier.strip().lower()


class ExtensionLoginRequest(BaseModel):
    extension_code: str = Field(
        min_length=12,
        max_length=12,
        pattern=r"^MT-[A-Z0-9]{4}-[A-Z0-9]{4}$",
    )

    @field_validator("extension_code", mode="before")
    @classmethod
    def normalize_extension_code(cls, extension_code: str) -> str:
        return str(extension_code).strip().upper()


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    login: str
    display_name: str
    extension_code: str
    profile_url: str
    created_at: datetime
    avatar_key: str | None = None
    avatar_image: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
