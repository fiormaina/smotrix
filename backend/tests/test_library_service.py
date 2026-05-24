from datetime import datetime, timezone
import unittest

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.folder import Folder
from app.models.watch_item import WatchItem
from app.schemas.library import CreateWatchItemRequest, UpdateWatchItemRequest
from app.services.library import create_watch_item, delete_folder, list_folders, list_watch_items, update_watch_item
from tests.helpers import create_custom_folder, create_session, create_user, get_system_folder


class LibraryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = create_session()
        self.user = create_user(
            self.db,
            email="user@example.com",
            login="tester",
            display_name="Tester",
        )
        self.custom_folder = create_custom_folder(self.db, self.user, title="Favorites")
        self.watching_folder = get_system_folder(self.db, self.user, "continue_watching")
        self.watched_folder = get_system_folder(self.db, self.user, "watched")
        self.planned_folder = get_system_folder(self.db, self.user, "will_watch")

    def tearDown(self) -> None:
        self.db.close()

    def test_list_folders_returns_system_first_with_item_counts(self) -> None:
        self.db.add_all(
            [
                WatchItem(
                    user_id=self.user.id,
                    system_folder_id=self.watching_folder.id,
                    custom_folder_id=self.custom_folder.id,
                    source="manual",
                    content_type="series",
                    title="Watching",
                    source_url=None,
                    year=2025,
                    genres=["drama"],
                    duration_text="45 мин",
                    description=None,
                    imdb_rating=None,
                    user_rating=None,
                    comment=None,
                    status="watching",
                    progress_percent=55,
                    progress_seconds=None,
                    duration_seconds=None,
                    season=1,
                    episode=4,
                    watched_at=None,
                ),
                WatchItem(
                    user_id=self.user.id,
                    system_folder_id=self.watched_folder.id,
                    custom_folder_id=None,
                    source="manual",
                    content_type="movie",
                    title="Completed",
                    source_url=None,
                    year=2024,
                    genres=["sci-fi"],
                    duration_text="120 мин",
                    description=None,
                    imdb_rating=None,
                    user_rating=9,
                    comment=None,
                    status="completed",
                    progress_percent=100,
                    progress_seconds=None,
                    duration_seconds=None,
                    season=None,
                    episode=None,
                    watched_at=datetime.now(timezone.utc),
                ),
            ]
        )
        self.db.commit()

        folders = list_folders(self.db, self.user)

        self.assertEqual(
            [folder.system_key for folder in folders[:3]],
            ["continue_watching", "watched", "will_watch"],
        )
        self.assertEqual([folder.items_count for folder in folders[:3]], [1, 1, 0])
        self.assertEqual(folders[3].title, "Favorites")
        self.assertEqual(folders[3].items_count, 1)

    def test_create_watch_item_infers_completed_status_from_watched_at_for_extension_source(self) -> None:
        response = create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                source="extension",
                content_type="movie",
                title="Extension Movie",
                watched_at=datetime.now(timezone.utc),
                duration_seconds=5400,
            ),
        )
        item = self.db.get(WatchItem, response.id)

        self.assertEqual(response.status, "completed")
        self.assertEqual(response.progress_percent, 100)
        self.assertIsNotNone(response.watched_at)
        self.assertIsNotNone(item)
        self.assertEqual(item.system_folder_id, self.watched_folder.id)
        self.assertEqual(item.progress_seconds, 5400)

    def test_create_watch_item_updates_existing_manual_item_for_extension_source(self) -> None:
        manual_item = WatchItem(
            user_id=self.user.id,
            system_folder_id=self.planned_folder.id,
            custom_folder_id=self.custom_folder.id,
            source="manual",
            content_type="movie",
            title="Shared Title",
            source_url=None,
            year=2024,
            genres=[],
            duration_text=None,
            description=None,
            imdb_rating=None,
            user_rating=8,
            comment="Keep me",
            status="planned",
            progress_percent=0,
            progress_seconds=None,
            duration_seconds=None,
            season=None,
            episode=None,
            watched_at=None,
        )
        self.db.add(manual_item)
        self.db.commit()
        self.db.refresh(manual_item)

        response = create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                source="extension",
                content_type="series",
                title="Shared Title",
                url="https://platform.example/shared-title",
                year=2024,
                progressSeconds=900,
                durationSeconds=1800,
                season=1,
                episode=2,
            ),
        )
        item = self.db.get(WatchItem, manual_item.id)

        self.assertEqual(response.id, manual_item.id)
        self.assertEqual(response.source, "extension")
        self.assertEqual(response.content_type, "series")
        self.assertEqual(response.source_url, "https://platform.example/shared-title")
        self.assertEqual(response.status, "watching")
        self.assertEqual(response.progress_percent, 50)
        self.assertEqual(response.custom_folder_id, self.custom_folder.id)
        self.assertEqual(response.user_rating, 8)
        self.assertEqual(response.comment, "Keep me")
        self.assertIsNotNone(item)
        self.assertEqual(item.source, "extension")
        self.assertEqual(item.system_folder_id, self.watching_folder.id)
        self.assertEqual(item.source_url, "https://platform.example/shared-title")
        self.assertEqual(item.content_type, "series")
        self.assertEqual(item.progress_seconds, 900)
        self.assertEqual(item.duration_seconds, 1800)
        self.assertEqual(item.season, 1)
        self.assertEqual(item.episode, 2)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(WatchItem)), 1)

    def test_create_watch_item_rejects_system_folder_as_custom_folder(self) -> None:
        with self.assertRaises(HTTPException) as context:
            create_watch_item(
                self.db,
                self.user,
                CreateWatchItemRequest(
                    source="extension",
                    content_type="movie",
                    title="Invalid folder",
                    custom_folder_id=self.watched_folder.id,
                ),
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("Системную папку", context.exception.detail["message"])

    def test_update_watch_item_rejects_explicit_null_status(self) -> None:
        created = create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                content_type="movie",
                title="Movie",
                status="completed",
                rating=8,
            ),
        )

        with self.assertRaises(HTTPException) as context:
            update_watch_item(
                self.db,
                self.user,
                created.id,
                UpdateWatchItemRequest.model_validate({"status": None}),
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail["message"], "Статус не может быть пустым")

    def test_update_watch_item_clears_custom_folder_and_resolves_progress(self) -> None:
        created = create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                content_type="series",
                title="Series",
                status="watching",
                season=1,
                episode=2,
                custom_folder_id=self.custom_folder.id,
                duration_seconds=1800,
            ),
        )

        updated = update_watch_item(
            self.db,
            self.user,
            created.id,
            UpdateWatchItemRequest.model_validate(
                {
                    "folderId": None,
                    "genres": [" drama ", " ", "thriller "],
                    "progress": 50,
                    "progressSeconds": 900,
                    "durationSeconds": 1800,
                }
            ),
        )
        item = self.db.get(WatchItem, created.id)

        self.assertEqual(updated.custom_folder_id, None)
        self.assertEqual(updated.progress_percent, 50)
        self.assertEqual(updated.genres, ["drama", "thriller"])
        self.assertIsNotNone(item)
        self.assertIsNone(item.custom_folder_id)

    def test_delete_folder_rejects_system_folder(self) -> None:
        with self.assertRaises(HTTPException) as context:
            delete_folder(self.db, self.user, self.watched_folder.id)

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("Системные папки", context.exception.detail["message"])

    def test_list_watch_items_filters_by_content_type(self) -> None:
        create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                content_type="movie",
                title="Movie",
                status="completed",
                rating=9,
            ),
        )
        create_watch_item(
            self.db,
            self.user,
            CreateWatchItemRequest(
                content_type="series",
                title="Series",
                status="watching",
                season=1,
                episode=1,
            ),
        )

        response = list_watch_items(self.db, self.user, content_type="series")

        self.assertEqual(len(response.items), 1)
        self.assertEqual(response.items[0].content_type, "series")
        self.assertEqual(response.watching_count, 1)
        self.assertEqual(response.completed_count, 0)
        self.assertEqual(response.planned_count, 0)


if __name__ == "__main__":
    unittest.main()
