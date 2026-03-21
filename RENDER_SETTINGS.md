# Render — Web Service settings for ZweckOS API

Use these when you create a **Web Service** (or Blueprint) on [Render](https://render.com).

## Connect

| Field | Value |
|--------|--------|
| **Repository** | `https://github.com/IsaacEdwards-Kawuma/Zweck-V5` (or your fork) |
| **Branch** | `master` or `main` (match your default branch) |
| **Root Directory** | `server` |

## Build & start

| Field | Value |
|--------|--------|
| **Runtime** | `Node` |
| **Build Command** | `npm install && npm run build && npx prisma migrate deploy` |
| **Start Command** | `npm start` |

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
| `JWT_SECRET` | Yes | Long random string (e.g. run `openssl rand -hex 32` locally). |
| `ALLOWED_ORIGINS` | Yes* | Your Vercel site(s), comma-separated: `https://your-app.vercel.app` |
| `CLIENT_ORIGIN` | No | Optional single URL if you prefer: `https://your-app.vercel.app` |
| `ALLOW_VERCEL_PREVIEWS` | No | `true` to allow any `https://*.vercel.app` (preview deployments). |
| `HOST` | No | Default `0.0.0.0` (already in code). |

\*Required for the browser app to call the API without CORS errors. Use your **exact** Vercel production URL(s).

### Do **not** commit these to Git

Set them only in the **Render dashboard** (or linked secret store).  
Local copies go in `server/.env` (gitignored) — see `server/.env.example`.

## After deploy

- **API URL:** `https://<your-service-name>.onrender.com`
- **Health check:** `GET https://<your-service-name>.onrender.com/api/health` → `{"ok":true}`
- **Vercel `RENDER_API_URL`:** `https://<your-service-name>.onrender.com` (no `/api` — used by the Edge proxy in `client/api/`)
- **Optional Vercel `VITE_API_URL`:** `https://<your-service-name>.onrender.com/api` only if you skip the proxy and call the API directly from the browser

## Blueprint file

This repo includes `render.yaml` at the root. You can use **New → Blueprint** and connect the repo; then add the **secret** variables (`DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, etc.) in the dashboard after the service is created.
