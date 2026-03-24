## ZweckOS

Production-ready internal web app for company management + double-entry accounting for **Zweck Co. Ltd (Kampala, Uganda)**.

### Key rule (single source of truth)

**All financial figures are derived from the `Transaction` table only.** No balances are stored anywhere.

### Tech

- **Client**: React + Vite + Tailwind + React Router + React Query + Axios
- **Server**: Node.js + Express (TypeScript) + Zod + JWT + bcrypt
- **DB**: PostgreSQL + Prisma

### Setup

1. Create env files.

- `server/.env`

```env
DATABASE_URL="postgresql://user:password@localhost:5432/zweckos"
JWT_SECRET="replace-this-with-a-strong-secret"
PORT=3001
```

- `client/.env` (optional — defaults to `/api`; Vite proxies to `http://localhost:3001`)

```env
# leave unset for local dev, or set to call Render over HTTPS from your machine:
# VITE_API_URL="https://your-api.onrender.com/api"
```

2. Install dependencies (from repo root).

```bash
npm install
```

3. Create DB tables (from repo root).

```bash
npm run db:migrate
```

4. Start dev servers (from repo root).

```bash
npm run dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:3001/api/health`

### Signup and first admin

The database starts completely empty. Current behavior:

- The **first** successful signup (`POST /api/auth/register`) becomes **ADMIN**.
- All **subsequent** signups become **USER**.
- Admins can change user roles later from **Settings → User role management**.

### Prisma Studio

```bash
npm run db:studio
```

### Deploy (Neon + Render + Vercel)

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — full flow (Neon, Render, Vercel).
- **[RENDER_SETTINGS.md](./RENDER_SETTINGS.md)** — Render dashboard fields and env var list.
- **`server/.env.render.example`** — variables to paste into Render (and mirror in `server/.env` for local prod tests only).

Production DB migrations (after changing schema locally):

```bash
npm run db:deploy
```

If Render/Neon reports failed migration history (`P3009`/`P3018`), follow the runbook:

- **[PRISMA_MIGRATION_RECOVERY.md](./PRISMA_MIGRATION_RECOVERY.md)**

### Quality checks (from repo root)

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

GitHub Actions runs lint, unit tests, and build on push/PR (see `.github/workflows/ci.yml`).

### Accounts & security

- **Password reset**: UI **Forgot password?** on the login screen. The API sends email when **SMTP** is configured (`SMTP_HOST`, etc. in `server/.env`). Without SMTP, the server logs the reset link to stdout (development). Set **`PUBLIC_APP_URL`** (or **`CLIENT_ORIGIN`**) so links point at your Vercel app in production.
- **Audit log** (admins): API `GET /api/audit`, UI **Audit** in the top bar next to **Users**.
- **Director profile photos** default to local disk (`server/uploads/`). For production without a persistent disk, configure **S3-compatible** storage — see `server/.env.example` and [DEPLOYMENT.md](./DEPLOYMENT.md).
- **Role matrix (summary)**:
  - `ADMIN`: full data entry and user/role management.
  - `DIRECTOR`: own profile/avatar self-management and normal app usage.
  - `USER`: standard app usage without admin actions.

### API documentation & monitoring

- **OpenAPI**: Interactive docs at **`/api/docs`** on the API host (e.g. `https://your-api.onrender.com/api/docs`). Raw spec: **`GET /api/openapi.json`**.
- **Sentry** (optional): set **`SENTRY_DSN`** on the server and **`VITE_SENTRY_DSN`** on the client build (Vercel) to capture errors in production.

### Operations

- **Logs**: JSON logs to stdout (`pino`); set `LOG_LEVEL` if needed.
- **Rate limits**: login and general API limits are configurable via env (see `server/.env.example`).
- **Failed-login burst detection**: configurable via `FAILED_LOGIN_BURST_THRESHOLD` and `FAILED_LOGIN_BURST_WINDOW_MINUTES`; used for admin login-risk scoring/alerts in **Settings → Login stamps**.
- **Database backups**: use Neon (or your host) scheduled backups; test restores periodically.

