# A&B Systems Construction Company - Invoice Demo

Демо-приложение для распознавания счетов на оплату и ведения реестра.

## Стек

- React + Vite
- Node.js + Express
- PostgreSQL
- Gemini API
- Basic Auth для простой защиты страницы

## Что хранится в базе

Таблица `invoices` создается автоматически при старте сервера. Полный распознанный счет хранится в `JSONB`, поэтому можно без миграций сохранять все поля счета и список товаров.

## Локальный запуск

1. Установить зависимости:

```bash
npm install --cache .npm-cache
```

2. Создать `.env` из `.env.example` и заполнить:

```bash
PORT=3001
DATABASE_URL=postgresql://invoice_user:password@localhost:5432/invoice_demo
DATABASE_SSL=false
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
APP_USERNAME=admin
APP_PASSWORD=...
JSON_LIMIT=30mb
```

3. Запустить dev-режим:

```bash
npm run dev
```

Frontend будет на `http://localhost:3000`, API на `http://localhost:3001`.

## Production

```bash
npm run build
npm start
```

В production Express обслуживает `dist` и API из одного процесса. Домен `invoice-demo.absystems.kz` нужно проксировать на порт из `PORT` через Nginx/Plesk.

## Docker VPS

На VPS проект разворачивается через `docker-compose.prod.yml`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Приложение слушает `127.0.0.1:3011`, PostgreSQL работает отдельным контейнером с volume `invoice_demo_postgres_data`.

## Деплой-план для VPS

1. Создать PostgreSQL базу и пользователя.
2. Заполнить `.env` на сервере.
3. Загрузить проект в GitHub и склонировать на VPS.
4. Выполнить `npm ci --omit=dev` или `npm install --omit=dev`.
5. Выполнить `npm run build`.
6. Запустить `npm start` через PM2/systemd/Plesk Node.js.
7. Настроить reverse proxy для `invoice-demo.absystems.kz` на `127.0.0.1:3001`.
8. Проверить `/api/health`, затем открыть сайт и ввести Basic Auth логин/пароль.
