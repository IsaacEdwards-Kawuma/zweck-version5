# Prisma Migration Recovery (Render + Neon)

Use this when Render deploy fails with:

- `P3009 migrate found failed migrations...`
- `P3018 A migration failed to apply... already exists`

This means DB schema objects already exist, but `_prisma_migrations` state is out of sync.

## 1) Identify failing migration

From Render logs, copy the migration name shown in the error, e.g.

- `20260321133910_add_director_avatar`

## 2) Mark that migration as finished

Open Neon SQL Editor and run:

```sql
UPDATE "_prisma_migrations"
SET "finished_at" = NOW(),
    "logs" = NULL
WHERE "migration_name" = 'REPLACE_WITH_MIGRATION_NAME'
  AND "finished_at" IS NULL
  AND "rolled_back_at" IS NULL;
```

Run this for one failing migration at a time.

### If the migration is marked FAILED (P3009) and you want Prisma to retry it

If the migration file in Git was fixed and you want the next deploy to re-run it, mark it as rolled back instead:

```sql
UPDATE "_prisma_migrations"
SET "rolled_back_at" = NOW()
WHERE "migration_name" = 'REPLACE_WITH_MIGRATION_NAME'
  AND "rolled_back_at" IS NULL;
```

Notes:
- Use **rolled back** when you want Prisma to attempt applying the migration again.
- Use **finished_at** when schema objects already exist and you just need Prisma to stop treating it as failed.

### No Render shell? (Free Render plan)

You can do all recovery steps via **Neon SQL Editor** + **Render manual redeploy**. You do not need SSH/shell access on Render.

## 3) Redeploy Render API

- Render → API service → **Manual Deploy**
- Prefer **Clear build cache & deploy**

## 4) Repeat if next migration fails

If another migration fails, repeat steps 1-3 using that new migration name.

## 5) Validate when deploy succeeds

- `GET /api/health` returns `{"ok":true}`
- App login/signup works
- Admin pages load without `500`

## Important

- Do **not** drop tables in production unless you explicitly want data loss.
- Keep `DIRECT_URL` set to Neon **non-pooler** URL for reliable migration locking.
- `DATABASE_URL` can remain pooled for runtime traffic.

