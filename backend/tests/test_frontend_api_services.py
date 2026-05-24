import unittest

from app.models.watch_item import WatchItem
from app.services.frontend_api import (
    create_folder_for_viewer,
    follow_user_response,
    get_folder_view_response,
    get_profile_view_response,
    list_recent_media_view,
    save_folder_for_viewer,
    search_media_view,
    unfollow_user_response,
    unsave_folder_for_viewer,
    update_media_item,
    update_folder_for_viewer,
)
from tests.helpers import create_custom_folder, create_session, create_user, get_system_folder


class FrontendApiServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = create_session()
        self.owner = create_user(
            self.db,
            email="owner@example.com",
            login="owner",
            display_name="Owner",
        )
        self.viewer = create_user(
            self.db,
            email="viewer@example.com",
            login="viewer",
            display_name="Viewer",
        )
        self.private_folder = create_custom_folder(
            self.db,
            self.owner,
            title="Private folder",
            access="private",
        )
        self.public_folder = create_custom_folder(
            self.db,
            self.owner,
            title="Public folder",
            access="public",
        )
        self.viewer_custom_folder = create_custom_folder(
            self.db,
            self.viewer,
            title="Viewer picks",
        )
        self.viewer_watching_folder = get_system_folder(self.db, self.viewer, "continue_watching")
        self.viewer_watched_folder = get_system_folder(self.db, self.viewer, "watched")

    def tearDown(self) -> None:
        self.db.close()

    def test_get_folder_view_response_distinguishes_private_access_modes(self) -> None:
        by_id_response = get_folder_view_response(
            self.db,
            self.viewer,
            folder_id=self.private_folder.id,
        )
        by_slug_response = get_folder_view_response(
            self.db,
            None,
            public_slug=f"folder-{self.private_folder.id}",
        )

        self.assertEqual(by_id_response["status"], "forbidden")
        self.assertEqual(by_slug_response["status"], "private-link")

    def test_save_folder_for_viewer_is_idempotent_and_unsave_restores_public_view(self) -> None:
        saved = save_folder_for_viewer(self.db, self.viewer, self.public_folder.id)
        saved_again = save_folder_for_viewer(self.db, self.viewer, self.public_folder.id)
        removed = unsave_folder_for_viewer(self.db, self.viewer, self.public_folder.id)
        folder_view = get_folder_view_response(self.db, self.viewer, folder_id=self.public_folder.id)

        self.assertEqual(saved["status"], "saved")
        self.assertTrue(saved["folder"]["isSaved"])
        self.assertEqual(saved_again["status"], "already-saved")
        self.assertEqual(removed, {"status": "removed", "folderId": self.public_folder.id})
        self.assertEqual(folder_view["status"], "ok")
        self.assertFalse(folder_view["folder"]["isSaved"])
        self.assertEqual(folder_view["folder"]["role"], "public")

    def test_create_and_update_folder_trim_text_and_visibility(self) -> None:
        created = create_folder_for_viewer(
            self.db,
            self.viewer,
            "  Weekend picks  ",
            "  For later  ",
            "private",
        )
        updated = update_folder_for_viewer(
            self.db,
            self.viewer,
            created["id"],
            "  Shared picks  ",
            "  ",
            "public",
        )

        self.assertEqual(created["title"], "Weekend picks")
        self.assertEqual(created["description"], "For later")
        self.assertEqual(updated["title"], "Shared picks")
        self.assertEqual(updated["description"], "")
        self.assertEqual(updated["visibility"], "public")

    def test_update_media_item_marks_entry_completed_and_moves_system_folder(self) -> None:
        item = WatchItem(
            user_id=self.viewer.id,
            system_folder_id=self.viewer_watching_folder.id,
            custom_folder_id=None,
            source="manual",
            content_type="movie",
            title="Movie",
            source_url="https://example.com/movie",
            year=2025,
            genres=["drama"],
            duration_text="110 мин",
            description=None,
            imdb_rating=7.5,
            user_rating=None,
            comment=None,
            status="watching",
            progress_percent=40,
            progress_seconds=None,
            duration_seconds=6600,
            season=None,
            episode=None,
            watched_at=None,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)

        result = update_media_item(
            self.db,
            self.viewer,
            item.id,
            user_rating=9,
            comment="  Great finish  ",
            watched=True,
            progress=70,
            folder_id=self.viewer_custom_folder.id,
        )
        refreshed_item = self.db.get(WatchItem, item.id)

        self.assertTrue(result["watched"])
        self.assertEqual(result["progress"], 100)
        self.assertEqual(result["userRating"], 9)
        self.assertEqual(result["comment"], "Great finish")
        self.assertIsNotNone(refreshed_item)
        self.assertEqual(refreshed_item.system_folder_id, self.viewer_watched_folder.id)
        self.assertEqual(refreshed_item.custom_folder_id, self.viewer_custom_folder.id)

    def test_recent_media_limit_is_clamped_and_search_uses_meta_fields(self) -> None:
        for title, genre, content_type in [
            ("First", "drama", "movie"),
            ("Second", "comedy", "movie"),
            ("Third", "fantasy", "series"),
        ]:
            self.db.add(
                WatchItem(
                    user_id=self.viewer.id,
                    system_folder_id=self.viewer_watching_folder.id,
                    custom_folder_id=None,
                    source="manual",
                    content_type=content_type,
                    title=title,
                    source_url=None,
                    year=2025,
                    genres=[genre],
                    duration_text="50 мин",
                    description=None,
                    imdb_rating=None,
                    user_rating=None,
                    comment=None,
                    status="watching",
                    progress_percent=40,
                    progress_seconds=None,
                    duration_seconds=None,
                    season=1 if content_type == "series" else None,
                    episode=1 if content_type == "series" else None,
                    watched_at=None,
                )
            )
        self.db.commit()

        recent_items = list_recent_media_view(self.db, self.viewer, limit=-5)
        search_items = search_media_view(self.db, self.viewer, "fantasy")

        self.assertEqual(len(recent_items), 1)
        self.assertEqual(len(search_items), 1)
        self.assertEqual(search_items[0]["title"], "Third")

    def test_follow_and_unfollow_user_response_updates_payload(self) -> None:
        followed = follow_user_response(self.db, self.viewer, self.owner.id)
        unfollowed = unfollow_user_response(self.db, self.viewer, self.owner.id)

        self.assertEqual(followed["status"], "following")
        self.assertEqual(followed["user"]["followersCount"], 1)
        self.assertTrue(followed["user"]["isFollowing"])
        self.assertEqual(unfollowed["status"], "not-following")
        self.assertEqual(unfollowed["user"]["followersCount"], 0)
        self.assertFalse(unfollowed["user"]["isFollowing"])

    def test_get_profile_view_response_returns_missing_for_unknown_user(self) -> None:
        response = get_profile_view_response(self.db, self.viewer, user_id=99999)

        self.assertEqual(response["status"], "missing")


if __name__ == "__main__":
    unittest.main()
