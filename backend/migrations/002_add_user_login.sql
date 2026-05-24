DROP PROCEDURE IF EXISTS prepare_users_for_auth;

DELIMITER //

CREATE PROCEDURE prepare_users_for_auth()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND column_name = 'login'
    ) THEN
        ALTER TABLE users ADD COLUMN login VARCHAR(100) NULL AFTER email;
        UPDATE users
        SET login = LOWER(SUBSTRING_INDEX(email, '@', 1))
        WHERE login IS NULL;
        ALTER TABLE users MODIFY login VARCHAR(100) NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND column_name = 'password_hash'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
                AND table_name = 'users'
                AND column_name = 'password'
        ) THEN
            ALTER TABLE users RENAME COLUMN password TO password_hash;
        ELSE
            ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL AFTER login;
        END IF;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND index_name = 'uq_users_login'
    ) THEN
        ALTER TABLE users ADD UNIQUE KEY uq_users_login (login);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND index_name = 'uq_users_email'
    ) THEN
        ALTER TABLE users ADD UNIQUE KEY uq_users_email (email);
    END IF;
END//

DELIMITER ;

CALL prepare_users_for_auth();

DROP PROCEDURE prepare_users_for_auth;
