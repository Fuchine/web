# syntax=docker/dockerfile:1
# Worker image: runs the BullMQ consumers with tsx directly against source. It
# keeps a real node_modules (unlike the web standalone bundle) because it
# tokenizes with kuromoji — whose dictionary (.dat.gz) ships inside the package
# and must stay on disk. Built from the repo root as context.
#   docker build -f apps/worker/Dockerfile -t fuchine-worker .
#
# Hardening (backlog C5):
#   - Only the worker's slice of the workspace is installed
#     (`--filter @fuchine/worker...` = worker + db/jobs/llm/nlp), so Next.js,
#     React, Storybook and the web/ui sources are not in the image.
#   - Runs as the unprivileged `node` user. Code and node_modules stay owned by
#     root (read-only to the process); the only writable path under /app is
#     packages/db/seeds/data, where `seed:jmdict` unzips the dictionary.
#   - tsx and drizzle-kit (devDependencies) stay on purpose: the worker runs TS
#     source through tsx, and this image doubles as the `migrate` one-shot in
#     docker-compose.release.yml (`pnpm --filter @fuchine/db migrate`).

FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat
# Shared, root-owned corepack cache: pnpm is fetched once at build time and is
# then readable by the `node` user (the default ~/.cache would be root's).
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- deps: install only the worker and its workspace dependencies ---
FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile --filter "@fuchine/worker..."
# Sources of workspace projects the worker never loads (their deps were not
# installed above). pnpm tolerates missing workspace directories at run time.
RUN rm -rf apps/web packages/ui packages/core

# --- runner: same tree, unprivileged user ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /opt/corepack /opt/corepack
COPY --from=deps /app /app
RUN install -d -o node -g node /app/packages/db/seeds/data
USER node
WORKDIR /app/apps/worker
# node is PID 1 (no pnpm wrapper), so SIGTERM reaches the worker's graceful
# shutdown handler directly. One-off CLIs still work through pnpm, e.g.
#   docker compose run --rm worker pnpm --filter @fuchine/worker invite list
CMD ["node", "--import", "tsx", "src/index.ts"]
