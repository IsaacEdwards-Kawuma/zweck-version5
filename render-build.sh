#!/usr/bin/env sh
# Render Static Site — run from REPO ROOT (Root Directory empty or ".")
# Only builds client/ with Vite. Prisma is server/ only — never add prisma to this script.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/client"
exec npx vite build
