from datetime import datetime

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.security import (
    clear_auth_cookie,
    create_access_token,
    set_auth_cookie,
)
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ExtensionLoginRequest,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserResponse,
)
from app.services.frontend_api import build_auth_user_payload, set_avatar_state
from app.services.users import (
    authenticate_extension_user,
    authenticate_user,
    create_user,
    delete_user_account,
    update_user_profile,
)

router = APIRouter()


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    user = create_user(db=db, payload=payload)
    auth_payload = {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": build_auth_user_payload(user),
    }
    set_auth_cookie(response, auth_payload["access_token"])
    return auth_payload


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Login with email or login",
)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    auth_response = authenticate_user(db=db, payload=payload)
    set_auth_cookie(response, auth_response.access_token)
    return auth_response


@router.post(
    "/extension-login",
    response_model=AuthResponse,
    summary="Login browser extension with extension code",
)
def extension_login(
    payload: ExtensionLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    auth_response = authenticate_extension_user(db=db, payload=payload)
    set_auth_cookie(response, auth_response.access_token)
    return auth_response


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
)
def me(current_user: User = Depends(get_current_user)) -> dict[str, object]:
    return build_auth_user_payload(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
)
def update_me(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    user = update_user_profile(db=db, user=current_user, payload=payload)
    set_avatar_state(db, user, payload.avatar_key, payload.avatar_image)
    return build_auth_user_payload(user)


@router.delete(
    "/me",
    summary="Delete current user account",
)
def delete_me(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    delete_user_account(db=db, user=current_user)
    clear_auth_cookie(response)
    return {"deletedAt": datetime.utcnow().isoformat()}


@router.post(
    "/logout",
    summary="Logout current session",
)
def logout(response: Response) -> dict[str, object]:
    clear_auth_cookie(response)
    return {"loggedOut": True}
