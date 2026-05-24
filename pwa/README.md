# Movie Tracker PWA

Рабочая копия фронтенда для старта PWA-версии Movie Tracker.

## Основа

- backend-источник: `C:\movie-tracker-backend-work\movie-tracker-back`
- frontend-источник: `C:\Apache24\htdocs\movie-tracker\movie-tracker-front`

## Текущий фокус

- online-first работа через существующий FastAPI backend
- установка как PWA
- кэширование оболочки приложения и ключевых экранов
- подготовка инфраструктуры под будущий офлайн-режим без включения офлайн-записи уже сейчас

## Что уже добавлено

- `manifest.webmanifest`
- `service-worker.js`
- `src/scripts/pwa/network.js` для статуса сети и доступности backend
- `src/scripts/pwa/sync-queue.js` как заготовка под отложенную синхронизацию
- `src/scripts/pwa/init.js` для регистрации service worker и install UX
