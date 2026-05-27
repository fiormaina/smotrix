# Smotrix

`Smotrix` - это сервис для отслеживания фильмов, сериалов и другого видеоконтента. Проект помогает сохранять историю просмотров, возвращаться к незавершенным материалам, собирать собственные папки с подборками, делиться ими и вести профиль пользователя.

Репозиторий состоит из двух частей:

- `backend/` - API на `FastAPI` и `MySQL`
- `pwa/` - PWA-фронтенд на `HTML`, `CSS` и `Vanilla JavaScript`

## Что умеет проект

- регистрация и вход по почте или логину
- история просмотра с поиском, фильтрами и оценками
- ручное добавление фильмов и сериалов
- личные и публичные папки с подборками
- профили пользователей и подписки
- установка фронтенда как PWA

## Структура репозитория

```text
.
|-- backend/   # FastAPI backend, бизнес-логика, модели, тесты, миграции
`-- pwa/       # статический PWA frontend
```

## Стек

### Backend

- Python 3.10+
- FastAPI
- SQLAlchemy
- MySQL
- PyMySQL

### Frontend

- HTML
- CSS
- Vanilla JavaScript
- Service Worker
- Web App Manifest

## Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/fiormaina/smotrix.git
cd smotrix
```

### 2. Запуск backend

Создайте виртуальное окружение:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Установите зависимости:

```powershell
pip install -r requirements.txt
```

Настройте подключение к MySQL через `.env`. Минимально нужны такие переменные:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=12345
MYSQL_DATABASE=movie_tracker
AUTH_SECRET_KEY=movie-tracker-local-secret
```

Если база создается с нуля, примените миграции:

```powershell
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/001_create_users.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/002_add_user_login.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/003_add_profile_fields.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/004_regenerate_extension_codes.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/005_create_library_tables.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/006_add_watch_item_source_url.sql
mysql -h localhost -P 3306 -u root -p movie_tracker < migrations/007_persist_frontend_social_state.sql
```

Запустите API:

```powershell
uvicorn app.main:app --reload
```

После запуска backend будет доступен по адресу:

```text
http://127.0.0.1:8000
```

### 3. Запуск frontend

Перейдите в папку фронтенда:

```powershell
cd ..\pwa
```

Укажите адрес backend в `pwa/runtime-config.js`:

```js
window.__MOVIE_TRACKER_CONFIG__ = Object.assign({}, window.__MOVIE_TRACKER_CONFIG__, {
  apiBaseUrl: "http://127.0.0.1:8000",
});
```

Запустите фронтенд через любой статический сервер.

Пример с Node.js:

```bash
npx serve .
```

Пример с Python:

```bash
python -m http.server 4173
```

Откройте приложение в браузере:

```text
http://127.0.0.1:4173
```

## Быстрый старт

После запуска backend и frontend:

1. откройте лендинг
2. зарегистрируйте нового пользователя
3. войдите в систему
4. перейдите в историю просмотра, папки и профиль
5. при желании установите приложение как PWA

## Тесты backend

Запуск тестов:

```powershell
cd backend
python scripts/run_tests.py
```

Запуск тестов с coverage:

```powershell
python scripts/run_tests.py --coverage
```

## Дополнительно

- Подробности по backend находятся в [backend/README.md](./backend/README.md).
- README фронтенда находится в [pwa/README.md](./pwa/README.md).
- Для корректной работы PWA фронтенд нужно открывать через `http://` или `https://`, а не напрямую как файл.
