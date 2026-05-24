#!/usr/bin/with-contenv bashio

bashio::log.info "Starting Teko..."

export NODE_ENV=production
export PORT=3000
export DATABASE_PATH=/data/teko.db

cd /app

bashio::log.info "Running database migrations..."
if ! node backend/dist/scripts/migrate.js; then
  bashio::log.fatal "Migration failed — refusing to start server"
  exit 1
fi

bashio::log.info "Migrations complete. Starting server..."
exec node backend/dist/index.js
