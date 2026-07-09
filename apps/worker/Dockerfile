# syntax=docker/dockerfile:1
# Worker image: runs the BullMQ consumers with tsx directly against source. It
# keeps the full node_modules (unlike the web standalone bundle) because it
# tokenizes with kuromoji — whose dictionary (.dat.gz) ships inside the package
# and must stay on disk. Built from the repo root as context.
#   docker build -f apps/worker/Dockerfile -t fuchine-worker .

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS runner
ENV NODE_ENV=production
# tsx (a devDependency) is present because pnpm installs dev deps regardless of
# NODE_ENV; the worker entrypoint runs the TypeScript source through it.
CMD ["pnpm", "--filter", "@fuchine/worker", "start"]
