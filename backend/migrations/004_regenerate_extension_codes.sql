SET @has_extension_code := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'extension_code'
);

SET @sql := IF(
  @has_extension_code = 0,
  'SELECT 1',
  "UPDATE users
   SET extension_code = CONCAT(
     'MT-',
     UPPER(SUBSTRING(SHA2(CONCAT(UUID(), id, RAND()), 256), 1, 4)),
     '-',
     UPPER(SUBSTRING(SHA2(CONCAT(id, RAND(), UUID()), 256), 1, 4))
   )"
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
