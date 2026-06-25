# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build

# ── Stage 2: Serve with nginx + Doppler runtime config ────────────────────────
FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache wget ca-certificates jq && \
    wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add --no-cache doppler

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/start-nginx-with-doppler.sh /usr/local/bin/start-nginx-with-doppler.sh
COPY --from=builder /app/dist /usr/share/nginx/html

RUN chmod +x /usr/local/bin/start-nginx-with-doppler.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["doppler", "run", "--", "/usr/local/bin/start-nginx-with-doppler.sh"]
