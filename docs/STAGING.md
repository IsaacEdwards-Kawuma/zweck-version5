# Staging environment

Use a **separate** Neon (or Postgres) database and a **separate** Render service (or second instance) for staging so production data is never mixed with experiments.

## Recommended layout

| Piece | Production | Staging |
|-------|------------|---------|
| Database | `DATABASE_URL` prod | Another DB URL, e.g. `DATABASE_URL_STAGING` |
| API host | `api.example.com` | `api-staging.example.com` or Render preview |
| Client | Vercel production | Vercel preview branch or `staging.example.com` |

## Environment

- Copy `server/.env.example` and point `DATABASE_URL` at the staging database.
- Use a **different** `JWT_SECRET` from production (tokens must not be interchangeable).
- Set `ALLOWED_ORIGINS` / `CLIENT_ORIGIN` to your staging front-end URL only.

## Migrations

Run the same Prisma migrations against staging before production:

```bash
cd server && npx prisma migrate deploy
```

## Data

- Optionally **restore** a sanitized copy of prod into staging for realistic tests; never use staging credentials on production.
- The in-app **organisation backup** (admin JSON export) is not a full SQL dump; rely on **Neon scheduled backups** for disaster recovery.

## CI

GitHub Actions (see `.github/workflows/ci.yml`) runs on `master` / PRs; add a **branch deploy** (e.g. Vercel preview + Render preview) if you want automatic staging per PR.
