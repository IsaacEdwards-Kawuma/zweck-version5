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

5. Deploy. Open the Vercel URL and use **First Admin Setup** or login.

**SPA routing:** Vercel must serve `index.html` for paths like `/login` (client-side routing). The repo includes `client/vercel.json` with a rewrite for that. If you still see 404 on `/login`, confirm **Root Directory** is `client` so this file is used.

### CORS

The API only allows:

- Local dev: `http://localhost:*` and `http://127.0.0.1:*`
- Production: origins listed in `ALLOWED_ORIGINS` / `CLIENT_ORIGIN`, and optionally all `*.vercel.app` if `ALLOW_VERCEL_PREVIEWS=true`

After changing Vercel domains, update `ALLOWED_ORIGINS` on Render and redeploy the API if needed.

## 4. Migrations

- **Local (dev)**: `npm run db:migrate` (from repo root).
- **Production**: migrations run during Render **build** via `npx prisma migrate deploy` (see `render.yaml` / manual build command).

If you add migrations locally, push to Git and redeploy Render so the new migration runs on build.

## 5. Local `.env` parity

**`server/.env`**

```env
DATABASE_URL="postgresql://...neon...?sslmode=require"
JWT_SECRET="..."
PORT=3001
ALLOWED_ORIGINS="http://localhost:5173"
```

**`client/.env`** (optional locally)

```env
# Default: same-origin /api → Vite proxies to localhost:3001
# VITE_API_URL=https://your-api.onrender.com/api
```

On **Vercel**, set **`RENDER_API_URL`** (see section 3). You do not need `VITE_API_URL` unless you want the browser to hit Render directly.

## 6. Docker Postgres (optional, local only)

`docker-compose.yml` in the repo is for **local** PostgreSQL; production DB is Neon.
