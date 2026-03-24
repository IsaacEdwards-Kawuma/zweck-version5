#!/usr/bin/env sh
# Retry prisma migrate deploy for transient P1002 (advisory lock timeout) on Neon/Render.
# Usage (from server/): sh scripts/migrate-deploy.sh
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
