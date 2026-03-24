#!/usr/bin/env sh
# Runs prisma migrate deploy with retries. Neon/Render often hit P1002 (advisory lock timeout).
#
# Prisma supports PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK for DBs where locks are unreliable (see Prisma docs).
# Disabling the lock is safe when only one migration runs at a time (normal single-branch deploy).
# To keep advisory locking (e.g. debugging), set in Render: PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=0
#
# Usage (from server/): sh scripts/migrate-deploy.sh

case "${PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK}" in
  0 | false | FALSE)
    unset PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK
    echo "[migrate-deploy] advisory locking enabled (PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=0)"
    ;;
  *)
    export PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1
    echo "[migrate-deploy] PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 (Neon/Render P1002 workaround)"
    ;;
esac

attempt=1
max=5
while [ "$attempt" -le "$max" ]; do
  echo "[migrate-deploy] attempt $attempt of $max"
  if npx prisma migrate deploy; then
    exit 0
  fi
  echo "[migrate-deploy] migrate deploy failed (see logs above)"
  if [ "$attempt" -eq "$max" ]; then
    exit 1
  fi
  wait_sec=$((attempt * 20))
  echo "[migrate-deploy] waiting ${wait_sec}s before retry..."
  sleep "$wait_sec"
  attempt=$((attempt + 1))
done
exit 1
