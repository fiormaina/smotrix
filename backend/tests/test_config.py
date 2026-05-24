import os
import unittest
from unittest.mock import patch

from app.core.config import Settings


class SettingsTests(unittest.TestCase):
    def test_settings_accept_railway_mysql_environment_variable_names(self) -> None:
        with patch.dict(
            os.environ,
            {
                "MYSQLHOST": "railway.internal",
                "MYSQLPORT": "4406",
                "MYSQLUSER": "movie_user",
                "MYSQLPASSWORD": "secret",
                "MYSQLDATABASE": "movie_db",
            },
            clear=False,
        ):
            settings = Settings(_env_file=None)

        self.assertEqual(settings.mysql_host, "railway.internal")
        self.assertEqual(settings.mysql_port, 4406)
        self.assertEqual(settings.mysql_user, "movie_user")
        self.assertEqual(settings.mysql_password, "secret")
        self.assertEqual(settings.mysql_database, "movie_db")
        self.assertEqual(str(settings.database_url.host), "railway.internal")
        self.assertEqual(settings.database_url.port, 4406)


if __name__ == "__main__":
    unittest.main()
