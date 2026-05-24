# ── Stage 1: Build frontend ────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

RUN corepack enable

WORKDIR /workspace

COPY package.json yarn.lock .yarnrc.yml* ./
COPY src/frontend/package.json ./src/frontend/package.json
COPY src/shared/package.json ./src/shared/package.json

RUN yarn workspaces focus @teko/frontend

COPY src/frontend ./src/frontend
COPY src/shared ./src/shared
COPY tsconfig.base.json ./

RUN yarn workspace @teko/frontend build

# ── Stage 2: Build backend ─────────────────────────────────────────────────────
# python3/make/g++ are required to compile better-sqlite3 for Alpine.
FROM node:20-alpine AS backend-builder

RUN apk add --no-cache python3 make g++
RUN corepack enable

WORKDIR /workspace

COPY package.json yarn.lock .yarnrc.yml* ./
COPY src/backend/package.json ./src/backend/package.json
COPY src/shared/package.json ./src/shared/package.json

RUN yarn workspaces focus @teko/backend

COPY src/backend ./src/backend
COPY src/shared ./src/shared
COPY tsconfig.base.json ./

RUN yarn workspace @teko/backend build

# Prune dev deps so the runtime image is leaner.
# @teko/shared is bundled by tsup — its node_modules symlink is harmless if broken.
RUN yarn workspaces focus @teko/backend --production

# ── Stage 3: Runtime ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Production node_modules (Alpine-compiled, dev deps stripped).
# The @teko/shared symlink in node_modules may be dangling — that is fine
# because tsup has inlined all shared code into the bundle.
COPY --from=backend-builder /workspace/node_modules ./node_modules

# Compiled backend (server + migration runner)
COPY --from=backend-builder /workspace/src/backend/dist ./backend/dist

# SQL migrations adjacent to dist/ so path.join(__dirname, '../drizzle/migrations') resolves
COPY --from=backend-builder /workspace/src/backend/drizzle ./backend/drizzle

# Frontend SPA served as static files by Fastify
COPY --from=frontend-builder /workspace/src/frontend/dist ./backend/dist/public

COPY run.sh ./run.sh
RUN chmod +x ./run.sh

EXPOSE 3000

CMD ["/app/run.sh"]
