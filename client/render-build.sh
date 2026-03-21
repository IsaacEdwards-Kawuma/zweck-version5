#!/usr/bin/env sh
# Used when Render Root Directory = "client" (cwd is client/). Repo root uses ../render-build.sh
# ONLY Vite — Prisma is under ../server/prisma (API service only).
set -e
cd "$(dirname "$0")"
exec npx vite build
