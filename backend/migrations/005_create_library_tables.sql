CREATE TABLE IF NOT EXISTS folders (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT NULL,
    access VARCHAR(20) NOT NULL DEFAULT 'private',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    system_key VARCHAR(40) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_folders_user_id (user_id),
    UNIQUE KEY uq_folders_user_system_key (user_id, system_key),
    CONSTRAINT fk_folders_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS watch_items (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    system_folder_id INT NOT NULL,
    custom_folder_id INT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'manual',
    content_type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    year INT NULL,
    genres JSON NOT NULL,
    duration_text VARCHAR(80) NULL,
    description TEXT NULL,
    imdb_rating DOUBLE NULL,
    user_rating INT NULL,
    comment TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    progress_percent INT NOT NULL DEFAULT 0,
    progress_seconds INT NULL,
    duration_seconds INT NULL,
    season INT NULL,
    episode INT NULL,
    watched_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_watch_items_user_id (user_id),
    KEY ix_watch_items_system_folder_id (system_folder_id),
    KEY ix_watch_items_custom_folder_id (custom_folder_id),
    CONSTRAINT fk_watch_items_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_watch_items_system_folder_id
        FOREIGN KEY (system_folder_id) REFERENCES folders (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_watch_items_custom_folder_id
        FOREIGN KEY (custom_folder_id) REFERENCES folders (id)
        ON DELETE SET NULL,
    CONSTRAINT chk_watch_items_source
        CHECK (source IN ('manual', 'extension')),
    CONSTRAINT chk_watch_items_content_type
        CHECK (content_type IN ('movie', 'series')),
    CONSTRAINT chk_watch_items_status
        CHECK (status IN ('planned', 'watching', 'completed')),
    CONSTRAINT chk_watch_items_progress_percent
        CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT chk_watch_items_rating
        CHECK (user_rating IS NULL OR user_rating BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO folders (user_id, title, description, access, is_system, system_key)
SELECT users.id, 'Продолжить просмотр', 'Фильмы и сериалы, которые пользователь смотрит сейчас', 'private', TRUE, 'continue_watching'
FROM users
LEFT JOIN folders AS existing_folders
    ON existing_folders.user_id = users.id
    AND existing_folders.system_key = 'continue_watching'
WHERE existing_folders.id IS NULL;

INSERT INTO folders (user_id, title, description, access, is_system, system_key)
SELECT users.id, 'Просмотрено', 'Контент, который пользователь уже посмотрел', 'private', TRUE, 'watched'
FROM users
LEFT JOIN folders AS existing_folders
    ON existing_folders.user_id = users.id
    AND existing_folders.system_key = 'watched'
WHERE existing_folders.id IS NULL;

INSERT INTO folders (user_id, title, description, access, is_system, system_key)
SELECT users.id, 'Буду смотреть', 'Контент, который пользователь отложил на будущее', 'private', TRUE, 'will_watch'
FROM users
LEFT JOIN folders AS existing_folders
    ON existing_folders.user_id = users.id
    AND existing_folders.system_key = 'will_watch'
WHERE existing_folders.id IS NULL;
