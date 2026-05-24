DROP PROCEDURE IF EXISTS prepare_users_profile_fields;

DELIMITER //

CREATE PROCEDURE prepare_users_profile_fields()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND column_name = 'display_name'
    ) THEN
        ALTER TABLE users ADD COLUMN display_name VARCHAR(80) NULL AFTER login;
    END IF;

    UPDATE users
    SET display_name = login
    WHERE display_name IS NULL OR TRIM(display_name) = '';

    ALTER TABLE users MODIFY display_name VARCHAR(80) NOT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND column_name = 'extension_code'
    ) THEN
        ALTER TABLE users ADD COLUMN extension_code VARCHAR(32) NULL AFTER display_name;
    END IF;

    UPDATE users
    SET extension_code = CONCAT('MT-', LPAD(UPPER(HEX(id)), 8, '0'))
    WHERE extension_code IS NULL OR TRIM(extension_code) = '';

    ALTER TABLE users MODIFY extension_code VARCHAR(32) NOT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND index_name = 'uq_users_extension_code'
    ) THEN
        ALTER TABLE users ADD UNIQUE KEY uq_users_extension_code (extension_code);
    END IF;
END//

DELIMITER ;

CALL prepare_users_profile_fields();

DROP PROCEDURE prepare_users_profile_fields;
