import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.user import User
from app.models.watch_item import WatchItem
from app.schemas.library import CreateWatchItemRequest, UpdateWatchItemRequest
from app.services.library import create_watch_item, ensure_default_folders, update_watch_item


def create_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def create_user(db: Session) -> User:
    user = User(
        email="user@example.com",
        login="tester",
        display_name="Tester",
        extension_code="extension-code",
        password_hash="hashed",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class LibraryWriteRulesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = create_session()
        self.user = create_user(self.db)
        ensure_default_folders(self.db, self.user)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def test_create_completed_item_sets_watched_at_and_progress_seconds(self) -> None:
        response = create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                type="movie",
                title="Фильм",
                status="completed",
                rating=9,
                durationSeconds=7200,
            ),
        )
        item = self.db.get(WatchItem, response.id)

        self.assertIsNotNone(item)
        self.assertEqual(response.status, "completed")
        self.assertEqual(response.progress_percent, 100)
        self.assertEqual(response.progress_seconds, 7200)
        self.assertIsNotNone(response.watched_at)
        self.assertEqual(item.progress_seconds, 7200)
        self.assertIsNotNone(item.watched_at)

    def test_update_status_to_planned_clears_watched_at(self) -> None:
        created = create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                type="movie",
                title="Фильм",
                status="completed",
                rating=7,
            ),
        )

        response = update_watch_item(
            self.db,
            self.user,
            created.id,
            UpdateWatchItemRequest(status="planned"),
        )
        item = self.db.get(WatchItem, created.id)

        self.assertEqual(response.status, "planned")
        self.assertIsNotNone(item)
        self.assertEqual(item.status, "planned")
        self.assertIsNone(item.watched_at)


if __name__ == "__main__":
    unittest.main()
