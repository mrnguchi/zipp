ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --no-fund --no-audit

FROM dependencies AS build
COPY . .
RUN npm run prisma:generate && npm run build

FROM build AS test
CMD ["npm", "run", "test:ci"]

FROM dependencies AS migration
COPY prisma ./prisma
COPY prisma.config.ts ./
USER node
CMD ["npm", "run", "prisma:migrate:deploy"]

FROM dependencies AS production-dependencies
# Prune a separate copy of the frozen install; avoid a second concurrent installation.
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts/read-local-otp.mjs ./scripts/read-local-otp.mjs
COPY --chown=node:node scripts/read-local-delivery-code.mjs ./scripts/read-local-delivery-code.mjs
RUN mkdir -p /var/lib/zipp/documents /var/lib/zipp/delivery-photos /var/lib/zipp/notification-captures && chown node:node /var/lib/zipp/documents /var/lib/zipp/delivery-photos /var/lib/zipp/notification-captures && chmod 700 /var/lib/zipp/documents /var/lib/zipp/delivery-photos /var/lib/zipp/notification-captures
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=10s --timeout=4s --start-period=20s --retries=5 CMD ["node", "--input-type=module", "-e", "const r=await fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||3000)+'/health/ready',{signal:AbortSignal.timeout(3000)});process.exit(r.ok?0:1)"]
CMD ["node", "dist/main.js"]
