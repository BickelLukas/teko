#!/bin/sh

echo "[INFO] Starting Teko..."

export NODE_ENV=production
export PORT=3000
export DATABASE_PATH=/data/teko.db

cd /app

echo "[INFO] Running database migrations..."
if ! node backend/dist/scripts/migrate.js; then
  echo "[FATAL] Migration failed — refusing to start server"
  exit 1
fi

echo "[INFO] Migrations complete. Starting server..."
exec node backend/dist/index.js
