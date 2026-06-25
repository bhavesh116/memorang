# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --frozen-lockfile

# Copy source and build
COPY . .
RUN npm run build

# Remove dev dependencies
RUN npm ci --frozen-lockfile --omit=dev

# ── Stage 2: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget ca-certificates && \
    wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add --no-cache doppler

# Create non-root user
RUN addgroup --system --gid 1001 nestjs && \
    adduser --system --uid 1001 --ingroup nestjs nestjs

# Copy built app + production node_modules
COPY --from=builder --chown=nestjs:nestjs /app/dist ./dist
COPY --from=builder --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nestjs /app/package.json ./package.json

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["doppler", "run", "--", "node", "dist/main"]
