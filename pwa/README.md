# Smotrix PWA

`Smotrix` - это PWA-фронтенд для отслеживания фильмов и сериалов. Приложение помогает хранить историю просмотров, создавать собственные папки с подборками, открывать публичные списки, вести профиль и быстро возвращаться к тому, что вы смотрели раньше.

Проект собран как статическое веб-приложение на `HTML`, `CSS` и `Vanilla JavaScript`. Он работает в режиме `online-first`, подключается к backend API по `/api/v1` и может устанавливаться на телефон или компьютер как обычное приложение.

## Возможности

- регистрация и вход с лендинга
- история просмотра с поиском, фильтрами и оценками
- ручное добавление фильмов и сериалов
- страницы фильма, профиля и папок
- личные и публичные подборки
- установка как PWA
- service worker и кэширование оболочки приложения
- настройка адреса backend через `runtime-config.js`

## Стек

- HTML
- CSS
- Vanilla JavaScript
- PWA: `manifest.webmanifest` и `service-worker.js`
- статический деплой, в том числе на Vercel

## Структура проекта

```text
.
|-- assets/                  # logos, backgrounds, icons, placeholders
|-- pages/                   # application pages
|-- src/
|   |-- scripts/
|   |   |-- core/            # config, routes, api client
|   |   |-- pages/           # page scripts
|   |   |-- services/        # API wrappers
|   |   |-- stores/          # folders/profile data layer
|   |   `-- pwa/             # network status, SW init, sync queue
|   `-- styles/              # base styles, layouts, page styles, components
|-- index.html               # landing page
|-- runtime-config.js        # runtime backend configuration
|-- manifest.webmanifest     # PWA manifest
|-- service-worker.js        # service worker
`-- vercel.json              # deployment headers
```

## Что нужно для запуска

Перед запуском понадобится:

- работающий backend Smotrix с доступными `/api/v1` endpoint
- любой статический веб-сервер для локального запуска фронтенда
- современный браузер с поддержкой Service Worker

## Установка и запуск локально

1. Склонируйте репозиторий:

```bash
git clone https://github.com/fiormaina/smotrix.git
cd smotrix/pwa
```

2. Укажите адрес backend в `runtime-config.js`:

```js
window.__MOVIE_TRACKER_CONFIG__ = Object.assign({}, window.__MOVIE_TRACKER_CONFIG__, {
  apiBaseUrl: "http://127.0.0.1:8000",
});
```

3. Запустите проект через любой статический сервер.

Пример с Node.js:

```bash
npx serve .
```

Пример с Python:

```bash
python -m http.server 4173
```

4. Откройте приложение в браузере:

```text
http://127.0.0.1:4173
```

Если сервер использует другой порт, откройте соответствующий адрес.

## Деплой

Для продакшн-развертывания:

1. Загрузите содержимое папки `pwa/` как статический сайт.
2. В `runtime-config.js` укажите адрес production-backend:

```js
window.__MOVIE_TRACKER_CONFIG__ = Object.assign({}, window.__MOVIE_TRACKER_CONFIG__, {
  apiBaseUrl: "https://your-backend.example.com",
});
```

3. Убедитесь, что backend разрешает запросы с домена фронтенда.
4. Разверните проект на Vercel, GitHub Pages, Nginx или любом другом статическом хостинге.

Файл `vercel.json` уже содержит заголовки кэширования для `runtime-config.js` и `service-worker.js`, поэтому проект можно деплоить на Vercel без дополнительной настройки.

## Как настраивается backend URL

Фронтенд определяет адрес API в таком порядке:

1. query-параметр `apiBaseUrl`
2. `window.__MOVIE_TRACKER_CONFIG__.apiBaseUrl`
3. сохраненное значение в `localStorage`
4. локальный адрес по умолчанию `http://127.0.0.1:8000`

За счет этого один и тот же фронтенд удобно использовать локально, в preview-окружении и в production.

## Установка как PWA

После открытия сайта в поддерживаемом браузере:

- войдите в аккаунт или зарегистрируйтесь
- дождитесь появления предложения установить приложение
- установите Smotrix на устройство

В проект уже входят:

- `manifest.webmanifest`
- интерфейс install prompt
- регистрация service worker
- кэширование оболочки приложения для более быстрых повторных запусков

## Основные страницы

- `/index.html` - лендинг, вход и регистрация
- `/pages/watch-history.html` - история просмотра
- `/pages/folders.html` - библиотека папок
- `/pages/folder-detail.html` - страница папки
- `/pages/folder-create.html` - создание папки
- `/pages/movie-detail.html` - карточка фильма или сериала
- `/pages/profile.html` - профиль пользователя
- `/pages/about.html` - страница о проекте
- `/pages/contacts.html` - контакты

## Примечания

- Проект статический и не требует сборки.
- Главная точка интеграции - backend API.
- Для корректной работы PWA открывайте проект через `http://` или `https://`, а не напрямую через локальный файл `index.html`.
