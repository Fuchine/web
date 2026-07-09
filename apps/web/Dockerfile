# syntax=docker/dockerfile:1
# Web image: Next.js standalone output for a lean runtime. Built from the repo
# root as context (see .dockerignore) so the pnpm workspace resolves.
#   docker build -f apps/web/Dockerfile -t fuchine-web .

FROM node:22-alpine AS base
# libc6-compat: some native deps (sharp) expect glibc symbols on Alpine.
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# --- build: install the whole workspace and produce the standalone server ---
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fuchine/web build

# --- runner: only the standalone bundle + static assets ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# Standalone traces from the monorepo root (outputFileTracingRoot), so the
# bundle lays out as apps/web/server.js + node_modules + packages under /app.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
# The web runtime never tokenizes (that's the worker), so kuromoji's dictionary
# is intentionally not shipped here.
CMD ["node", "apps/web/server.js"]
