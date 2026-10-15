FROM ghcr.io/denoland/celld:0.6.2 AS celld
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:worker && npx esbuild backend/celld.ts --bundle --format=esm --platform=browser --target=es2022 --external:node:* --external:cloudflare:* --outfile=artifacts/celld-worker.mjs
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=celld /usr/local/bin/celld /usr/local/bin/celld
COPY --from=build /app/artifacts/celld-worker.mjs ./dist/backend-worker.mjs
COPY --from=build /app/.output/public ./.output/public
# celld 0.6.2 redirects directory indexes but does not serve their trailing-slash URL.
# Serve these client routes through its SPA fallback instead.
RUN rm -rf .output/public/create .output/public/login
COPY wrangler.celld.jsonc ./wrangler.jsonc
COPY scripts/start-celld.mjs ./scripts/start-celld.mjs
EXPOSE 9877
CMD ["node", "scripts/start-celld.mjs"]
