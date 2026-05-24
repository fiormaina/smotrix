import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.folder import Folder
from app.models.user import User
from app.services.frontend_api import list_library_folders_view, save_folder_for_viewer


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


class FolderSavePersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = create_session()
        self.owner = create_user(
            self.db,
            email="owner@example.com",
            login="owner",
            display_name="Owner",
            extension_code="MT-OWNR-0001",
        )
        self.viewer = create_user(
            self.db,
            email="viewer@example.com",
            login="viewer",
            display_name="Viewer",
            extension_code="MT-VIEW-0001",
        )
        self.public_folder = Folder(
            user_id=self.owner.id,
            title="Публичная папка",
            description="Можно сохранять",
            access="public",
            is_system=False,
            system_key=None,
        )
        self.db.add(self.public_folder)
        self.db.commit()
        self.db.refresh(self.public_folder)

    def tearDown(self) -> None:
        self.db.close()

    def test_saved_folder_is_loaded_from_database(self) -> None:
        save_result = save_folder_for_viewer(self.db, self.viewer, self.public_folder.id)
        library_items = list_library_folders_view(self.db, self.viewer)

        self.assertEqual(save_result["status"], "saved")
        saved_folder = next(
            item for item in library_items
            if item["id"] == self.public_folder.id
        )
        self.assertTrue(saved_folder["isSaved"])
        self.assertEqual(saved_folder["ownerUsername"], "owner")


if __name__ == "__main__":
    unittest.main()
