FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NODE_ENV=development

# Native build toolchain for better-sqlite3 fallback compilation
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm_config_engine_strict=false npm ci --include=dev

COPY . .
RUN mkdir -p data \
  && npm run lint \
  && NODE_OPTIONS="--max-old-space-size=1536" npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
