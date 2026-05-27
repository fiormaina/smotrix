import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.folder import Folder
from app.models.user import User
from app.models.watch_item import WatchItem
from app.services.frontend_api import (
    create_watch_history_item,
    list_watch_history_view,
    remove_item_from_folder,
    update_watch_history_item,
)
from app.services.library import ensure_default_folders


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


def get_system_folder(db: Session, user: User, system_key: str) -> Folder:
    folder_map = ensure_default_folders(db, user)
    db.commit()
    return folder_map[system_key]


class FrontendWatchHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = create_session()
        self.user = create_user(self.db)
        self.watching_folder = get_system_folder(self.db, self.user, "continue_watching")
        self.planned_folder = get_system_folder(self.db, self.user, "will_watch")

    def tearDown(self) -> None:
        self.db.close()

    def test_create_watch_history_item_updates_existing_entry_and_promotes_series(self) -> None:
        legacy_item = WatchItem(
            user_id=self.user.id,
            system_folder_id=self.watching_folder.id,
            custom_folder_id=None,
            source="manual",
            content_type="movie",
            title="Счастье",
            source_url=None,
            year=2021,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=None,
            comment=None,
            status="watching",
            progress_percent=30,
            season=None,
            episode=None,
            watched_at=None,
        )
        self.db.add(legacy_item)
        self.db.commit()
        self.db.refresh(legacy_item)

        item = create_watch_history_item(
            self.db,
            self.user,
            content_type="serial",
            title="Счастье",
            source_url="https://player.example/happiness",
            year=2021,
            status_value="watching",
            season=1,
            episode=31,
            rating=None,
            comment=None,
            folder_id=None,
        )

        refreshed_item = self.db.get(WatchItem, legacy_item.id)
        self.assertIsNotNone(refreshed_item)
        self.assertEqual(item["id"], legacy_item.id)
        self.assertEqual(item["type"], "series")
        self.assertEqual(item["url"], "https://player.example/happiness")
        self.assertEqual(item["season"], 1)
        self.assertEqual(item["episode"], 31)
        self.assertEqual(refreshed_item.content_type, "series")
        self.assertEqual(refreshed_item.source_url, "https://player.example/happiness")
        self.assertEqual(refreshed_item.season, 1)
        self.assertEqual(refreshed_item.episode, 31)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(WatchItem)), 1)

    def test_list_watch_history_view_hides_legacy_duplicates(self) -> None:
        older_item = WatchItem(
            user_id=self.user.id,
            system_folder_id=self.watching_folder.id,
            custom_folder_id=None,
            source="manual",
            content_type="movie",
            title="Счастье",
            source_url=None,
            year=2021,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=None,
            comment=None,
            status="watching",
            progress_percent=30,
            season=None,
            episode=None,
            watched_at=None,
        )
        newer_item = WatchItem(
            user_id=self.user.id,
            system_folder_id=self.watching_folder.id,
            custom_folder_id=None,
            source="manual",
            content_type="series",
            title="Счастье",
            source_url=None,
            year=2021,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=None,
            comment=None,
            status="watching",
            progress_percent=36,
            season=1,
            episode=31,
            watched_at=None,
        )
        self.db.add(older_item)
        self.db.add(newer_item)
        self.db.commit()
        self.db.refresh(newer_item)

        items = list_watch_history_view(self.db, self.user)

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], newer_item.id)
        self.assertEqual(items[0]["type"], "series")
        self.assertEqual(items[0]["season"], 1)
        self.assertEqual(items[0]["episode"], 31)

    def test_remove_item_from_system_folder_deletes_watch_item(self) -> None:
        planned_item = WatchItem(
            user_id=self.user.id,
            system_folder_id=self.planned_folder.id,
            custom_folder_id=None,
            source="manual",
            content_type="movie",
            title="Отложенный фильм",
            source_url=None,
            year=2024,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=None,
            comment=None,
            status="planned",
            progress_percent=0,
            season=None,
            episode=None,
            watched_at=None,
        )
        self.db.add(planned_item)
        self.db.commit()
        self.db.refresh(planned_item)

        folder_detail = remove_item_from_folder(self.db, self.user, self.planned_folder.id, planned_item.id)

        self.assertIsNone(self.db.get(WatchItem, planned_item.id))
        self.assertEqual(folder_detail["id"], self.planned_folder.id)
        self.assertEqual(folder_detail["itemsCount"], 0)
        self.assertEqual(folder_detail["items"], [])

    def test_remove_item_from_custom_folder_keeps_watch_item(self) -> None:
        custom_folder = Folder(
            user_id=self.user.id,
            title="Моя папка",
            description=None,
            access="private",
            is_system=False,
            system_key=None,
        )
        self.db.add(custom_folder)
        self.db.commit()
        self.db.refresh(custom_folder)

        custom_item = WatchItem(
            user_id=self.user.id,
            system_folder_id=self.watching_folder.id,
            custom_folder_id=custom_folder.id,
            source="manual",
            content_type="movie",
            title="Фильм в папке",
            source_url=None,
            year=2024,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=None,
            comment=None,
            status="watching",
            progress_percent=15,
            season=None,
            episode=None,
            watched_at=None,
        )
        self.db.add(custom_item)
        self.db.commit()
        self.db.refresh(custom_item)

        folder_detail = remove_item_from_folder(self.db, self.user, custom_folder.id, custom_item.id)
        refreshed_item = self.db.get(WatchItem, custom_item.id)

        self.assertIsNotNone(refreshed_item)
        self.assertIsNone(refreshed_item.custom_folder_id)
        self.assertEqual(folder_detail["id"], custom_folder.id)
        self.assertEqual(folder_detail["itemsCount"], 0)
        self.assertEqual(folder_detail["items"], [])

    def test_update_watch_history_item_clears_watched_at_when_status_returns_to_planned(self) -> None:
        completed_item = WatchItem(
            user_id=self.user.id,
            system_folder_id=get_system_folder(self.db, self.user, "watched").id,
            custom_folder_id=None,
            source="manual",
            content_type="movie",
            title="Завершенный фильм",
            source_url=None,
            year=2024,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=8,
            comment=None,
            status="completed",
            progress_percent=100,
            season=None,
            episode=None,
            watched_at=datetime.now(timezone.utc),
        )
        self.db.add(completed_item)
        self.db.commit()
        self.db.refresh(completed_item)

        updated = update_watch_history_item(
            self.db,
            self.user,
            completed_item.id,
            status_value="planned",
        )
        refreshed_item = self.db.get(WatchItem, completed_item.id)

        self.assertEqual(updated["status"], "planned")
        self.assertIsNotNone(refreshed_item)
        self.assertEqual(refreshed_item.status, "planned")
        self.assertIsNone(refreshed_item.watched_at)

    def test_update_watch_history_item_progress_100_promotes_item_to_completed(self) -> None:
        item = WatchItem(
            user_id=self.user.id,
            system_folder_id=self.watching_folder.id,
            custom_folder_id=None,
            source="manual",
            content_type="movie",
            title="Фильм",
            source_url=None,
            year=2024,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=None,
            comment=None,
            status="watching",
            progress_percent=30,
            season=None,
            episode=None,
            watched_at=None,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)

        updated = update_watch_history_item(
            self.db,
            self.user,
            item.id,
            progress=100,
        )
        refreshed_item = self.db.get(WatchItem, item.id)
        watched_folder = get_system_folder(self.db, self.user, "watched")

        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["progress"], 100)
        self.assertIsNotNone(updated["watchedAt"])
        self.assertIsNotNone(refreshed_item)
        self.assertEqual(refreshed_item.status, "completed")
        self.assertEqual(refreshed_item.system_folder_id, watched_folder.id)
        self.assertIsNotNone(refreshed_item.watched_at)


if __name__ == "__main__":
    unittest.main()
