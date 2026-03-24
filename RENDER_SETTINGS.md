# Render — Web Service & Static Site (ZweckOS)

## Static Site (React / Vite frontend)

Use **Static Site** (or **Web Service** with static hosting) **only** if you host the client on Render instead of Vercel.

| Field | Value |
|--------|--------|
| **Root Directory** | *(empty — repo root)* |
| **Build Command** | `npm install && sh render-build.sh` |
| **Publish Directory** | `client/dist` |

The repo includes **`render-build.sh` at the repository root** — it only runs Vite in `client/`. **Do not** append `npx prisma migrate deploy` (API only). If you set **Root Directory** to `client` instead, use publish directory **`dist`**.

**If you see `cannot open render-build.sh`:** you were building from repo root but only had `client/render-build.sh` — pull latest and use the **root** `render-build.sh`, or set **Root Directory** to **`client`**.

---

## Web Service (API) — Express + Prisma

Use these when you create a **Web Service** (or Blueprint) on [Render](https://render.com).

### Connect

| Field | Value |
|--------|--------|
| **Repository** | `https://github.com/IsaacEdwards-Kawuma/zweck-version5.git` (or your fork) |
| **Branch** | `master` or `main` (match your default branch) |
| **Root Directory** | `server` |

## Build & start

| Field | Value |
|--------|--------|
| **Runtime** | `Node` |
| **Build Command** | `npm install && npm run build:render` |
| **Start Command** | `npm start` |

`build:render` runs `npm run build` then `sh scripts/migrate-deploy.sh`. The script sets **`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`** for the migrate step (Prisma’s supported workaround when `pg_advisory_lock` cannot be acquired in time on Neon/serverless). It also retries up to five times with backoff. Do **not** run two API deploys at the same time if you rely on this. To force the default locking instead, set **`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=0`** in Render (only if you know migrations still work).

Still set **`DIRECT_URL`** to Neon’s **direct** URL — the app and Prisma expect it in `schema.prisma`.

> Render sets **`PORT`** automatically — do **not** set `PORT` in the dashboard unless you know you need a fixed value. The app uses `process.env.PORT`.

## Instance (typical)

| Field | Suggested |
|--------|-----------|
| **Plan** | Free (or paid for always-on) |
| **Region** | Closest to Neon / your users |

## Environment variables (copy into Render → Environment)

**Quick copy files in this repo:**

| File | Use |
|------|-----|
| **`render-environment-variables.txt`** | Instructions + placeholder values (edit then copy each key/value). |
| **`render-environment-variables.BULK.txt`** | **Only** `KEY=value` lines (no comments). Fill in the empty values, then paste into Render if your UI supports bulk / “.env” import. |

Add **each row** as a separate variable if you add manually. Values below are **placeholders** — replace with your real secrets.

| Key | Required | Example / notes |
|-----|----------|-----------------|
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Neon connection string; must include `?sslmode=require` at the end if Neon asks for SSL. |
| `DIRECT_URL` | Yes* | Neon **non-pooler** (“direct”) connection URL for Prisma Migrate. Without it, migrate may use the pooler and hit **P1002** advisory lock timeouts. Copy from Neon → Connection string → **Direct**. |
| `JWT_SECRET` | Yes | Long random string (e.g. run `openssl rand -hex 32` locally). |
| `ALLOWED_ORIGINS` | Yes* | Your Vercel site(s), comma-separated: `https://your-app.vercel.app` |
| `CLIENT_ORIGIN` | No | Optional single URL if you prefer: `https://your-app.vercel.app` |
| `ALLOW_VERCEL_PREVIEWS` | No | `true` to allow any `https://*.vercel.app` (preview deployments). |
| `HOST` | No | Default `0.0.0.0` (already in code). |
| `CRON_SECRET` | No† | Long random string (e.g. `openssl rand -hex 32`). Without it, `POST /api/jobs/meeting-reminders` returns 503. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Needed to send reminder emails (same as password reset). |
| `PUBLIC_APP_URL` or `CLIENT_ORIGIN` | No | Used in email links to the app. |

\*Required for the browser app to call the API without CORS errors. Use your **exact** Vercel production URL(s).

\*\*Set `DIRECT_URL` on Render to Neon’s **direct** (non-pooler) connection string (Neon dashboard → **Connection details** → **Direct**). `schema.prisma` uses it for `migrate deploy`; if it is unset or still points at a pooler, builds often fail with **P1002** (advisory lock timeout). The retry script helps, but `DIRECT_URL` is the real fix.

†Optional unless you schedule meeting reminders: set `CRON_SECRET`, configure SMTP, then call the job daily (see **Meeting reminder cron** below).

### Do **not** commit these to Git

Set them only in the **Render dashboard** (or linked secret store).  
Local copies go in `server/.env` (gitignored) — see `server/.env.example`.

## After deploy

- **API URL:** `https://<your-service-name>.onrender.com`
- **Health check:** `GET https://<your-service-name>.onrender.com/api/health` → `{"ok":true}`
- **Vercel `RENDER_API_URL`:** `https://<your-service-name>.onrender.com` (no `/api` — used by the Edge proxy in `client/api/`)
- **Optional Vercel `VITE_API_URL`:** `https://<your-service-name>.onrender.com/api` only if you skip the proxy and call the API directly from the browser

If **`prisma migrate deploy` fails with P1002**: add **`DIRECT_URL`** (Neon direct URL), ensure only **one** deploy runs at a time, and use the repo’s **`migrate-deploy.sh`** (it sets `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` automatically). If you previously set `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=0` in Render, remove it or the script will respect `0` and locks may time out again.

If build fails with Prisma migration state errors (`P3009`, `P3018`), follow:

- **[PRISMA_MIGRATION_RECOVERY.md](./PRISMA_MIGRATION_RECOVERY.md)**

## Meeting reminder cron

The API exposes **`POST /api/jobs/meeting-reminders`** (not JWT-protected). Send the same value as **`CRON_SECRET`** in the **`X-Cron-Secret`** header or as **`Authorization: Bearer <secret>`**.

Schedule it **once per day** (UTC) from Render **Cron Jobs**, GitHub Actions, or another scheduler hitting your API origin, for example:

`curl -X POST -H "X-Cron-Secret: $CRON_SECRET" "https://<your-service-name>.onrender.com/api/jobs/meeting-reminders"`

Users can opt out under **Settings → Notifications** in the app (`emailMeetingReminders`).

## Sentry alerts and incident runbook (optional env checklist)

The API does **not** send Sentry notifications by itself. You configure alerting **in Sentry**, then store the same destinations in Render so **Settings → Production readiness** can show the monitoring dots as configured.

### 1. Error reporting (`SENTRY_DSN`)

1. In [Sentry](https://sentry.io): **Settings → Projects → [your project] → Client Keys (DSN)**.
2. Copy the **DSN** and set **`SENTRY_DSN`** on Render (and in `server/.env` locally if you test Sentry in dev).

Without `SENTRY_DSN`, the server does not report errors to Sentry.

### 2. Email alerts (`SENTRY_ALERT_EMAIL`)

1. In Sentry: **Alerts → Create Alert** (or edit an existing rule).
2. Under **THEN** / actions, add **Send a notification via Email** (or use a Sentry integration that delivers to an inbox).
3. Note the **email address** you use for ops/on-call (e.g. `alerts@yourdomain.com` or a Google Group).
4. Set **`SENTRY_ALERT_EMAIL`** on Render to that **same** address string. It is only a **readiness flag** in this app (so admins see “Sentry alerts configured” in Settings).

### 3. Webhook alerts (`SENTRY_ALERT_WEBHOOK`)

1. In Sentry: **Settings → Integrations** (or **Alerts** on your rule) and add **Slack**, **Discord**, **Microsoft Teams**, or a **custom webhook** action.
2. Complete the integration so Sentry can POST to your channel or URL.
3. Set **`SENTRY_ALERT_WEBHOOK`** on Render to the **webhook URL** you configured (e.g. Slack Incoming Webhook URL, Discord webhook URL, or your custom HTTPS endpoint). Again, this value is stored for **readiness display**; Sentry performs the actual delivery.

You can set **either** `SENTRY_ALERT_EMAIL` **or** `SENTRY_ALERT_WEBHOOK` (or both) for the readiness check to pass.

### 4. Incident runbook (`INCIDENT_RUNBOOK_URL`)

1. Create a short runbook page (Notion, Confluence, Google Doc, GitHub wiki) describing: who is on-call, how to triage ZweckOS/API errors, rollback steps, and links to Render/Neon/Vercel dashboards.
2. Set **`INCIDENT_RUNBOOK_URL`** on Render to that page’s **https** URL.

### 5. Apply on Render

**Dashboard → your Web Service → Environment →** add or edit:

| Variable | Example |
|----------|---------|
| `SENTRY_DSN` | `https://xxx@xxx.ingest.sentry.io/xxx` |
| `SENTRY_ALERT_EMAIL` | `alerts@yourdomain.com` |
| `SENTRY_ALERT_WEBHOOK` | `https://hooks.slack.com/services/...` |
| `INCIDENT_RUNBOOK_URL` | `https://notion.so/your-runbook` |

Redeploy or restart the service so the process picks up new variables. Admins can confirm under **Settings → Production readiness** in the app.

## Blueprint file

This repo includes `render.yaml` at the root. You can use **New → Blueprint** and connect the repo; then add the **secret** variables (`DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, etc.) in the dashboard after the service is created.
