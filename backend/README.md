# Movie Tracker Backend

Backend платформы для отслеживания просмотренных фильмов и сериалов.

## Стек

- Python 3.10+
- FastAPI
- SQLAlchemy
- MySQL / PyMySQL
- cryptography (для MySQL auth `caching_sha2_password`)

## Быстрый старт

1. Создать виртуальное окружение:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Установить зависимости:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

3. Создать `.env` на основе `.env.example` и указать доступы к MySQL.

4. При первом запуске backend сам подтянет отсутствующие additive-изменения схемы для уже существующей базы.

Если нужно развернуть схему вручную с нуля, последовательно примените SQL-миграции:

```powershell
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/001_create_users.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/002_add_user_login.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/003_add_profile_fields.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/004_regenerate_extension_codes.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/005_create_library_tables.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/006_add_watch_item_source_url.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/007_persist_frontend_social_state.sql
```

5. Запустить API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

API будет доступно на `http://127.0.0.1:8000`.

Если запускать просто `pip` или `uvicorn`, PowerShell может взять глобальный Python вместо проектного `.venv`. Для MySQL-аутентификации `caching_sha2_password` это часто заканчивается ошибкой про отсутствующий пакет `cryptography` в другой среде.

## Регистрация

`POST /api/v1/auth/register`

```json
{
  "email": "user@example.com",
  "login": "user",
  "password": "password123"
}
```

Успешный ответ:

```json
{
  "id": 1,
  "email": "user@example.com",
  "login": "user",
  "created_at": "2026-04-23T12:00:00"
}
```

## Авторизация

`POST /api/v1/auth/login`

В `identifier` можно передать почту или логин.

```json
{
  "identifier": "test@mail.ru",
  "password": "qwerty12345"
}
```

Успешный ответ:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "test@mail.ru",
    "login": "test",
    "created_at": "2026-04-23T14:13:55"
  }
}
```

`GET /api/v1/auth/me` принимает заголовок:

```text
Authorization: Bearer <access_token>
```

## Что стоит добавить в схему БД

Для таблицы `users` обязательны уникальные индексы на `email` и `login`, иначе можно создать несколько аккаунтов с одинаковыми учетными данными.

Позже для полноценной авторизации пригодятся поля:

- `is_active BOOLEAN DEFAULT TRUE`
- `email_verified_at TIMESTAMP NULL`
- `last_login_at TIMESTAMP NULL`
- `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

## Тестовый пользователь

После установки зависимостей и настройки `.env` можно завести тестовый аккаунт:

```powershell
python scripts/seed_test_user.py
```

Будет создан или обновлен пользователь:

```text
email: test@mail.ru
login: test
password: qwerty12345
```

## Тесты

Для подробного отчета с `passed / failed / errors / skipped`:

```powershell
python scripts/run_tests.py
```

Для того же запуска с простым coverage-отчетом по папке `app/`:

```powershell
python scripts/run_tests.py --coverage
```

Если нужен стандартный `unittest`, лучше использовать verbose-режим вместо quiet:

```powershell
python -m unittest discover -s tests -v
```
