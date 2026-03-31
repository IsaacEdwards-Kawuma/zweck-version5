# Deploying ZweckOS: Neon + Render + Vercel

This guide runs **PostgreSQL on Neon**, the **Express API on Render**, and the **Vite React app on Vercel**.

## 1. Neon (PostgreSQL)

1. Create a project at [neon.tech](https://neon.tech) and a database.
2. Copy the **connection string** (use the **pooled** or **direct** URL — both work with Prisma).
3. Append SSL if not already present: `?sslmode=require`  
   Example:
   ```text
   postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
4. You will paste this as `DATABASE_URL` on Render (and locally for `prisma migrate` if you migrate from your machine).

## 2. Render (API)

### Option A — Blueprint (`render.yaml`)

1. Push this repo to GitHub/GitLab.
2. In Render: **New** → **Blueprint** → connect the repo.
3. Set **environment variables** on the `zweckos-api` service (do not commit secrets):

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | Neon connection string with `?sslmode=require` |
| `JWT_SECRET` | Long random string (e.g. `openssl rand -hex 32`) |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` (comma-separate multiple URLs) |
| `CLIENT_ORIGIN` | Optional; same as main Vercel URL if you prefer a single origin |
| `ALLOW_VERCEL_PREVIEWS` | `true` if you want all `*.vercel.app` preview URLs allowed |
| `FAILED_LOGIN_BURST_THRESHOLD` | Optional; default `5` failed attempts to trigger burst risk |
| `FAILED_LOGIN_BURST_WINDOW_MINUTES` | Optional; default `10` minute burst window |
| `NODE_ENV` | `production` |

4. **Build** runs: `npm install && npm run build && npx prisma migrate deploy` (from `server/` per `rootDir`).
5. **Start**: `npm start` → `node dist/index.js`.
6. Note your public API URL, e.g. `https://zweckos-api.onrender.com`.

### Option B — Manual Web Service

1. **New** → **Web Service** → connect repo.
2. **Root Directory**: `server`
3. **Build Command**: `npm install && npm run build && npx prisma migrate deploy`
4. **Start Command**: `npm start`
5. Same env vars as above.
6. Render sets `PORT`; the app reads `process.env.PORT` and binds to `0.0.0.0`.

### Health check

- `GET https://YOUR-RENDER-URL/api/health` → `{"ok":true}`

## 3. Vercel (frontend)

1. Import the repo in [vercel.com](https://vercel.com).
2. **Root Directory**: `client` (important — Vite app lives there).
3. **Framework Preset**: Vite (or use `client/vercel.json`).
4. **Environment Variables** (Production + Preview as needed):

| Variable | Value |
|----------|--------|
| `RENDER_API_URL` | `https://YOUR-RENDER-HOST` — Render **base URL only** (no `/api` suffix). Proxies `https://your-app.vercel.app/api/*` → Render via `client/api/[...path].js`. |

Example: `https://zweckos-api.onrender.com`

**Optional:** `VITE_API_URL=https://YOUR-RENDER-HOST/api` to call Render **directly** (HTTPS) instead of the proxy. Remove `VITE_API_URL` from Vercel if it still points at `http://localhost:3001/api`.

5. Deploy. Open the Vercel URL and sign up/login.

**SPA routing:** Vercel must serve `index.html` for paths like `/login` (client-side routing). The repo includes `client/vercel.json` with a rewrite for that. If you still see 404 on `/login`, confirm **Root Directory** is `client` so this file is used.

**405 on `POST /api/...`:** Usually means the request hit the static SPA (`index.html`) instead of `client/api/[...path].js`. Fix: **Root Directory** must be **`client`** (so `api/` is deployed). The proxy uses the **Node.js** runtime, not Edge. Ensure **`RENDER_API_URL`** is set on Vercel and redeploy.

**Render Static Site (client on Render):** Production installs skip `devDependencies`, so **`vite: not found`** happens if Vite only lived in devDependencies. This repo lists **Vite**, **@vitejs/plugin-react**, **Tailwind**, and **PostCSS** under **`dependencies`** in `client/package.json`. From the **repo root**, run `npm install` and commit **`package-lock.json`** so workspace installs stay consistent.

**Build command for Static Site:** **`npm install && sh render-build.sh`** — use the **`render-build.sh` at the repository root** (it `cd`s into `client/` and runs Vite). **Publish directory:** **`client/dist`**. Leave **Root Directory** **empty** (repo root) so the root script is found. **Do not** append **`npx prisma migrate deploy`**. See **`client/RENDER_STATIC_SITE_BUILD.txt`**.

If **Root Directory** is **`client`**, publish **`dist`** and the **`client/render-build.sh`** script runs instead (same build command line).

### CORS

The API only allows:

- Local dev: `http://localhost:*` and `http://127.0.0.1:*`
- Production: origins listed in `ALLOWED_ORIGINS` / `CLIENT_ORIGIN`, and optionally all `*.vercel.app` if `ALLOW_VERCEL_PREVIEWS=true`

After changing Vercel domains, update `ALLOWED_ORIGINS` on Render and redeploy the API if needed.

## 4. Migrations

- **Local (dev)**: `npm run db:migrate` (from repo root).
- **Production**: migrations run during Render **build** via `npx prisma migrate deploy` (see `render.yaml` / manual build command).

If you add migrations locally, push to Git and redeploy Render so the new migration runs on build.

If deployment fails with `P3009`/`P3018`, use:

- **[PRISMA_MIGRATION_RECOVERY.md](./PRISMA_MIGRATION_RECOVERY.md)**

## 4b. Cron jobs (Render/Neon production)

The API exposes cron-only endpoints under `POST /api/jobs/*` and secures them with `CRON_SECRET`.

### Required env

- `CRON_SECRET`: strong random string

### Endpoints to schedule

- `POST /api/jobs/meeting-reminders` (suggested: daily)
- `POST /api/jobs/invoices/flag-overdue` (suggested: daily)
- `POST /api/jobs/monthly-statement-reminders` (suggested: monthly, 1st day UTC)
- `POST /api/jobs/director-receipts/generate-pdfs` (suggested: every 5-15 minutes)

### How to call

Provide either:

- Header `X-Cron-Secret: <CRON_SECRET>`, or
- Header `Authorization: Bearer <CRON_SECRET>`

### Scheduler options

- **Render Cron Jobs**: recommended if available on your plan.
- If you cannot use Render shell/cron (free plan), use an external scheduler (e.g. GitHub Actions, cron-job.org, UptimeRobot) that can call HTTPS endpoints with headers.

## 5. Local `.env` parity

**`server/.env`**

```env
DATABASE_URL="postgresql://...neon...?sslmode=require"
JWT_SECRET="..."
PORT=3001
ALLOWED_ORIGINS="http://localhost:5173"
# Password reset links in emails (production): your Vercel app URL
# PUBLIC_APP_URL=https://your-app.vercel.app
# SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... SMTP_FROM="ZweckOS <noreply@...>"
# SENTRY_DSN=https://...@sentry.io/...
# FAILED_LOGIN_BURST_THRESHOLD=5
# FAILED_LOGIN_BURST_WINDOW_MINUTES=10
```

**`client/.env`** (optional locally)

```env
# Default: same-origin /api → Vite proxies to localhost:3001
# VITE_API_URL=https://your-api.onrender.com/api
# VITE_SENTRY_DSN=...   # optional; same pattern on Vercel for client error reporting
```

On **Vercel**, set **`RENDER_API_URL`** (see section 3). You do not need `VITE_API_URL` unless you want the browser to hit Render directly.

**API docs:** `https://YOUR-RENDER-HOST/api/docs` (OpenAPI UI). **Health:** `GET /api/health`.

## 6. Director avatars (production)

The API stores uploaded images either on **local disk** (`server/uploads/`) or in **S3-compatible** object storage.

- **Render (default disk)**: the filesystem is often **ephemeral** — avatars can disappear on redeploy. Either attach a **persistent disk** and mount it so `server/uploads` (or `process.cwd()/uploads`) survives, **or** use object storage.
- **S3 / Cloudflare R2 / MinIO**: set `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and **`S3_PUBLIC_BASE_URL`** to the HTTPS base where objects are publicly readable (bucket website URL, R2 public URL, or CloudFront). For R2/MinIO, set `S3_ENDPOINT` as well. See `server/.env.example`.

`GET /api/health` returns `"avatarStorage": "s3"` or `"local"` so you can verify which mode is active.

## 7. Database backups

Enable **automatic backups** in Neon (or your Postgres provider). Periodically verify you can restore a backup to a scratch database. The app does not replace provider-level backup/restore.

## 8. Docker Postgres (optional, local only)

`docker-compose.yml` in the repo is for **local** PostgreSQL; production DB is Neon.
