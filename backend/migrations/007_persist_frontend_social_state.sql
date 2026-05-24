DROP PROCEDURE IF EXISTS prepare_frontend_social_state;

DELIMITER //

CREATE PROCEDURE prepare_frontend_social_state()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND column_name = 'avatar_key'
    ) THEN
        ALTER TABLE users ADD COLUMN avatar_key VARCHAR(32) NULL AFTER extension_code;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND column_name = 'avatar_image'
    ) THEN
        ALTER TABLE users ADD COLUMN avatar_image TEXT NULL AFTER avatar_key;
    END IF;

    CREATE TABLE IF NOT EXISTS folder_saves (
        id INT NOT NULL AUTO_INCREMENT,
        viewer_user_id INT NOT NULL,
        folder_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_folder_saves_viewer_user_id (viewer_user_id),
        KEY ix_folder_saves_folder_id (folder_id),
        UNIQUE KEY uq_folder_saves_viewer_folder (viewer_user_id, folder_id),
        CONSTRAINT fk_folder_saves_viewer_user_id
            FOREIGN KEY (viewer_user_id) REFERENCES users (id)
            ON DELETE CASCADE,
        CONSTRAINT fk_folder_saves_folder_id
            FOREIGN KEY (folder_id) REFERENCES folders (id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS user_follows (
        id INT NOT NULL AUTO_INCREMENT,
        follower_user_id INT NOT NULL,
        followed_user_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_user_follows_follower_user_id (follower_user_id),
        KEY ix_user_follows_followed_user_id (followed_user_id),
        UNIQUE KEY uq_user_follows_follower_followed (follower_user_id, followed_user_id),
        CONSTRAINT fk_user_follows_follower_user_id
            FOREIGN KEY (follower_user_id) REFERENCES users (id)
            ON DELETE CASCADE,
        CONSTRAINT fk_user_follows_followed_user_id
            FOREIGN KEY (followed_user_id) REFERENCES users (id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
END//

DELIMITER ;

CALL prepare_frontend_social_state();

DROP PROCEDURE prepare_frontend_social_state;
