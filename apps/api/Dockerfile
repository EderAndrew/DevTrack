# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/api/Dockerfile .

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter api...
RUN pnpm --filter api exec prisma generate && pnpm --filter api build
RUN pnpm deploy --filter api --prod /out \
 && cp -r apps/api/dist /out/dist \
 && cp -r apps/api/prisma apps/api/prisma.config.ts apps/api/assets /out/

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]

# One-off migration image: docker build -f apps/api/Dockerfile --target migrate .
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
