import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.folder import Folder
from app.models.user_follow import UserFollow
from app.models.user import User
from app.models.watch_item import WatchItem
from app.services.frontend_api import (
    build_profile_payload,
    get_profile_connections_response,
    get_profile_view_response,
)
from app.services.library import ensure_default_folders


def create_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def create_user(
    db: Session,
    *,
    email: str,
    login: str,
    display_name: str,
    extension_code: str,
) -> User:
    user = User(
        email=email,
        login=login,
        display_name=display_name,
        extension_code=extension_code,
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


class ProfilePayloadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = create_session()
        self.viewer = create_user(
            self.db,
            email="viewer@example.com",
            login="viewer",
            display_name="Viewer",
            extension_code="MT-VIEW-0001",
        )
        self.target = create_user(
            self.db,
            email="target@example.com",
            login="fiormaina",
            display_name="Fiormaina",
            extension_code="MT-TARGET-01",
        )
        self.follower = create_user(
            self.db,
            email="follower@example.com",
            login="follower",
            display_name="Follower",
            extension_code="MT-FOLLOW-01",
        )
        self.watching_folder = get_system_folder(self.db, self.target, "continue_watching")
        self.completed_folder = get_system_folder(self.db, self.target, "watched")
        self.planned_folder = get_system_folder(self.db, self.target, "will_watch")

    def tearDown(self) -> None:
        self.db.close()

    def test_profile_payload_uses_camel_case_and_github_profile_url(self) -> None:
        self.target.avatar_key = "sunrise"
        self.target.avatar_image = "https://cdn.example/avatar.png"
        self.db.add_all([
            UserFollow(follower_user_id=self.viewer.id, followed_user_id=self.target.id),
            UserFollow(follower_user_id=self.follower.id, followed_user_id=self.target.id),
        ])
        self.db.commit()

        payload = build_profile_payload(self.db, self.target, self.viewer)

        self.assertEqual(payload["username"], "fiormaina")
        self.assertEqual(
            payload["profileUrl"],
            "https://fiormaina.github.io/movie-tracker-front/pages/profile.html?user=fiormaina",
        )
        self.assertEqual(payload["followersCount"], 2)
        self.assertEqual(payload["followingCount"], 0)
        self.assertTrue(payload["isFollowing"])
        self.assertFalse(payload["isOwner"])
        self.assertEqual(payload["avatarKey"], "sunrise")
        self.assertEqual(payload["avatarImage"], "https://cdn.example/avatar.png")
        self.assertNotIn("display_name", payload)
        self.assertNotIn("extension_code", payload)
        self.assertNotIn("extensionCode", payload)
        self.assertNotIn("avatar_key", payload)
        self.assertNotIn("avatar_image", payload)
        self.assertNotIn("profile_url", payload)
        self.assertNotIn("login", payload)

    def test_profile_payload_includes_extension_code_for_owner_only(self) -> None:
        owner_payload = build_profile_payload(self.db, self.target, self.target)
        viewer_payload = build_profile_payload(self.db, self.target, self.viewer)

        self.assertEqual(owner_payload["extensionCode"], "MT-TARGET-01")
        self.assertTrue(owner_payload["isOwner"])
        self.assertNotIn("extensionCode", viewer_payload)
        self.assertFalse(viewer_payload["isOwner"])

    def test_profile_connections_response_returns_followers_and_following_lists(self) -> None:
        self.db.add_all([
            UserFollow(follower_user_id=self.viewer.id, followed_user_id=self.target.id),
            UserFollow(follower_user_id=self.follower.id, followed_user_id=self.target.id),
            UserFollow(follower_user_id=self.target.id, followed_user_id=self.viewer.id),
        ])
        self.db.commit()

        followers_response = get_profile_connections_response(
            self.db,
            self.viewer,
            self.target.id,
            "followers",
        )
        following_response = get_profile_connections_response(
            self.db,
            self.viewer,
            self.target.id,
            "following",
        )

        self.assertEqual(followers_response["status"], "ok")
        self.assertEqual([item["username"] for item in followers_response["items"]], ["viewer", "follower"])
        self.assertEqual(following_response["status"], "ok")
        self.assertEqual([item["username"] for item in following_response["items"]], ["viewer"])

    def test_profile_view_response_returns_backend_stats(self) -> None:
        self.db.add_all([
            WatchItem(
                user_id=self.target.id,
                system_folder_id=self.completed_folder.id,
                custom_folder_id=None,
                source="manual",
                content_type="movie",
                title="Фильм",
                source_url=None,
                year=2024,
                genres=[],
                duration_text="120 мин",
                description=None,
                imdb_rating=None,
                user_rating=8,
                comment=None,
                status="completed",
                progress_percent=100,
                progress_seconds=7200,
                duration_seconds=7200,
                season=None,
                episode=None,
                watched_at=None,
            ),
            WatchItem(
                user_id=self.target.id,
                system_folder_id=self.watching_folder.id,
                custom_folder_id=None,
                source="manual",
                content_type="series",
                title="Сериал",
                source_url=None,
                year=2025,
                genres=[],
                duration_text="30 мин/эп",
                description=None,
                imdb_rating=None,
                user_rating=None,
                comment=None,
                status="watching",
                progress_percent=60,
                progress_seconds=None,
                duration_seconds=1800,
                season=1,
                episode=3,
                watched_at=None,
            ),
            WatchItem(
                user_id=self.target.id,
                system_folder_id=self.planned_folder.id,
                custom_folder_id=None,
                source="manual",
                content_type="movie",
                title="В планах",
                source_url=None,
                year=2026,
                genres=[],
                duration_text="95 мин",
                description=None,
                imdb_rating=None,
                user_rating=None,
                comment=None,
                status="planned",
                progress_percent=0,
                progress_seconds=None,
                duration_seconds=5700,
                season=None,
                episode=None,
                watched_at=None,
            ),
        ])
        self.db.commit()

        response = get_profile_view_response(self.db, self.viewer, user_id=self.target.id)

        self.assertEqual(response["status"], "ok")
        self.assertEqual(response["user"]["username"], "fiormaina")
        self.assertEqual(
            response["stats"],
            [
                {"id": "movies", "value": 1, "label": "Фильмов", "icon": "movie"},
                {"id": "series", "value": 1, "label": "Сериалов", "icon": "series"},
                {"id": "episodes", "value": 3, "label": "Эпизодов", "icon": "episodes"},
                {"id": "hours", "value": 4, "label": "Часов просмотра", "icon": "hours"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
