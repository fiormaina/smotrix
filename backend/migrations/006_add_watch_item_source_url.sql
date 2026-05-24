SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'watch_items'
      AND COLUMN_NAME = 'source_url'
);

SET @statement = IF(
    @column_exists = 0,
    'ALTER TABLE watch_items ADD COLUMN source_url TEXT NULL AFTER title',
    'SELECT 1'
);

PREPARE add_source_url_column FROM @statement;
EXECUTE add_source_url_column;
DEALLOCATE PREPARE add_source_url_column;
