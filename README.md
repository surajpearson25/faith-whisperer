# Faith Whisperer (Volunteer Prayer App MVP)

Production-ready Node.js MVP where all users are volunteers who can submit prayer requests and pray for others.

## Tech Stack

- Node.js + Express API
- PostgreSQL (via `pg`)
- JWT auth + `bcryptjs` password hashing
- In-app notifications persisted in DB
- Minimal SPA frontend (vanilla JS + static assets)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Initialize database schema:

```bash
npm run db:init
```

4. Start app:

```bash
npm run dev
```

Open `http://localhost:3000`.

5. (Optional) Seed demo data:

```bash
npm run db:seed
```

Demo login password for seeded users: `Password123!`

`db:seed` inserts core demo data plus 5 randomized prayer requests each run.

## Logo Asset

The UI now renders a logo from:

- `public/logo.png`

It also auto-detects these filenames if present:

- `public/logo.jpg`
- `public/logo.jpeg`
- `public/logo.webp`
- `public/logo.svg`
- `public/faith-whisperer-logo.png`
- `public/faith-whisperer.png`

Place your attached Faith Whisperer logo there to display it on login and top navigation.

## Required Environment Variables

- `DATABASE_URL` (PostgreSQL connection string)
- `JWT_SECRET` (long random secret)
- `PORT` (optional, default `3000`)

## API Endpoints

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`

### User

- `GET /me`
- `PATCH /me` (`volunteeredToPray: boolean`)

### Prayer Requests

- `POST /prayers`
- `GET /prayers?includeClosed=true|false`
- `GET /prayers/:id`
- `POST /prayers/:id/respond`
- `POST /prayers/:id/updates`
- `POST /prayers/:id/close`

### Notifications

- `GET /notifications`
- `POST /notifications/:id/read`

## Business Rules Implemented

- Login required for all app features.
- New prayer requests start in `OPEN` status.
- Global volunteer opt-in (`volunteeredToPray`) controls new-request notifications.
- One prayer response per `(prayerRequestId, fromUserId)` enforced in DB and API.
- Duplicate response attempts return `409`.
- Users cannot respond to their own request.
- Requester-only actions: post update, close request.
- Closed requests block responses, updates, and close/edit operations.
- Update/close notifications are sent to subscribers (users who responded "I am praying for you").
- Notification recipients exclude actor when appropriate.
- Praying count is unique-user count from `prayer_responses`.

## Database Schema

SQL schema is in `sql/schema.sql` and includes:

- Tables: `users`, `prayer_requests`, `prayer_responses`, `prayer_updates`, `notifications`
- Integrity constraints and foreign keys
- Uniqueness on `prayer_responses(prayer_request_id, from_user_id)`
- Indexes for feeds and notification lookup performance
