import sys
from pathlib import Path

from sqlalchemy.exc import OperationalError, ProgrammingError

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User
from app.services.users import get_user_by_email, get_user_by_login

TEST_EMAIL = "test@mail.ru"
TEST_LOGIN = "test"
TEST_PASSWORD = "qwerty12345"


def seed_test_user() -> None:
    db = SessionLocal()
    try:
        user = get_user_by_email(db, TEST_EMAIL) or get_user_by_login(db, TEST_LOGIN)
        if user is None:
            user = User(email=TEST_EMAIL, login=TEST_LOGIN)
            db.add(user)

        user.email = TEST_EMAIL
        user.login = TEST_LOGIN
        user.password_hash = hash_password(TEST_PASSWORD)
        db.commit()
        db.refresh(user)
        print(f"Seeded test user id={user.id} email={user.email} login={user.login}")
    except (OperationalError, ProgrammingError) as exc:
        db.rollback()
        raise SystemExit(f"Database error: {exc}") from exc
    finally:
        db.close()


if __name__ == "__main__":
    seed_test_user()
