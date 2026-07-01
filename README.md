# Fade & Fortune — Barbershop Booking & CRM

A full-stack booking and CRM system for a multi-barber barbershop: per-barber
calendars, walk-in intake, a public booking page, and an owner dashboard with
revenue/performance reporting.

## Stack

- **Frontend:** React + TypeScript (Vite) + Tailwind CSS
- **Backend:** Node.js + TypeScript (Fastify)
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT (access + refresh), role-based (`OWNER`, `ADMIN`, `BARBER`, `FRONT_DESK`)

## Repo structure

```
apps/
  api/            Fastify backend
    prisma/       schema.prisma, migrations, seed.ts
    src/
      modules/    one folder per resource (auth, barbers, services, clients,
                  appointments, timeblocks, dashboard, public)
      lib/        availability engine, auth helpers, notifications, csv
      plugins/    fastify plugins (prisma, jwt auth)
  web/            React frontend
    src/
      pages/barber/   mobile-first barber schedule
      pages/admin/    desktop admin/front-desk dashboard
      pages/public/   public booking + manage-appointment pages
packages/
  shared/         TypeScript types shared between api and web
```

## How scheduling works

- Each barber has their own `BarberWorkingHours` (per weekday) and an optional
  `bufferMinutesOverride`. `ShopSettings` holds the shop-wide defaults that get
  copied onto a barber when they're created — hours/buffer are then edited
  per-barber from there.
- Services have a fixed shop-wide `durationMinutes` (this drives slot math) and
  a `basePrice`; a barber can offer a subset of services with an optional
  `priceOverride` via `BarberService`.
- Availability (`GET /api/appointments/availability`, `GET
  /api/public/availability`) computes open slots from working hours minus
  existing `BOOKED` appointments and `TimeBlock`s, expanded by the buffer.
  Booking "any available barber" picks whichever qualifying barber has the
  earliest open slot that day.
- Every booking/reschedule re-validates the slot immediately before writing,
  so two people booking the same slot at once can't both win.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (or Docker, see below)

## Environment variables

Copy the example env files and fill in secrets:

```bash
cp apps/api/.env.example apps/api/.env
```

See `apps/api/.env.example` for the full list (`DATABASE_URL`,
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, `WEB_BASE_URL`,
`NOTIFICATION_PROVIDER`, and Twilio/SendGrid credentials for when you're
ready to go live with real SMS/email).

`NOTIFICATION_PROVIDER=console` (the default) logs booking confirmations,
cancellations, and 24hr reminders to the API console instead of sending them
— useful for local dev without real Twilio/SendGrid accounts.

## Running locally (without Docker)

```bash
npm install

# create a database and point DATABASE_URL at it in apps/api/.env
npm run prisma:migrate     # applies migrations
npm run prisma:seed        # seeds demo data (barbers, services, clients, appointments)

npm run dev:api            # http://localhost:4000
npm run dev:web            # http://localhost:5173 (proxies /api to the api dev server)
```

## Running locally with Docker Compose

```bash
cp .env.example .env       # fill in real JWT secrets before anything but local dev
docker compose up --build
```

This starts Postgres, the API (migrations run automatically on container
start), and the web app served behind nginx on `http://localhost:5173`
(nginx proxies `/api` to the `api` container).

Seed the database once the containers are up:

```bash
docker compose exec api npm run prisma:seed
```

> Note: building the images requires pulling `node:20-alpine`,
> `postgres:16-alpine`, and `nginx:alpine` from Docker Hub. If you're behind a
> corporate proxy or restrictive egress policy, make sure Docker itself is
> configured to reach Docker Hub (this is separate from any HTTP proxy your
> shell uses) — `docker pull node:20-alpine` should succeed on its own before
> `docker compose up --build` will.

## Demo login credentials

After seeding, all accounts share the password `password123`:

| Role | Email |
| --- | --- |
| Owner | owner@shop.test |
| Admin | admin@shop.test |
| Front desk | frontdesk@shop.test |
| Barber | barber1@shop.test … barber5@shop.test |

The public booking page is at `/book` (no login required).

## Useful scripts

Run from the repo root (they delegate to the right workspace):

- `npm run dev:api` / `npm run dev:web` — start each app in dev mode
- `npm run prisma:migrate` — run Prisma migrations (dev)
- `npm run prisma:seed` — reset and reseed demo data
- `npm run prisma:studio` — open Prisma Studio to browse the database
- `npm run build` — production build of shared, api, and web

## Extending this later

The schema and code were kept intentionally simple but were written with these
in mind:

- **Real SMS/email:** implement `NotificationProvider` in
  `apps/api/src/lib/notifications.ts` for a real Twilio/SendGrid call (stubs
  already exist there) and flip `NOTIFICATION_PROVIDER`. No other code needs
  to change — routes and the reminder job (`apps/api/src/jobs/reminders.ts`)
  call the same `notifications.send()` interface either way.
- **Online payments/deposits:** `Appointment.priceCharged` already snapshots
  the charge amount; add a `Payment`/`Deposit` model referencing
  `Appointment.id` and hook it into the booking flow without touching
  scheduling logic.
- **Loyalty/rewards:** `Client.tags` and visit history (`Appointment` rows)
  already give you segmentation and visit counts to build a points system on
  top of, without schema changes to the booking core.
- **Multi-location:** every scheduling-relevant model (`Barber`, `Service`,
  `Appointment`, `TimeBlock`, `ShopSettings`) is a natural place to add a
  `locationId` foreign key; `ShopSettings` would become one row per location
  instead of a singleton.

## Known limitations

- Access/refresh tokens are stored in `localStorage` rather than httpOnly
  cookies — fine for an internal staff tool on trusted devices, but worth
  revisiting before wider deployment.
- Double-booking prevention re-checks availability at write time but doesn't
  use a database-level exclusion constraint; for very high write concurrency,
  consider a Postgres `EXCLUDE USING gist` constraint on `(barberId,
  during)` as a second line of defense.
