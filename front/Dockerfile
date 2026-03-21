# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Stage 2: Build (usa Node para evitar crash do Bun em Docker/cross-platform)
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application (next build roda estável com Node)
RUN npx next build

# Stage 3: Runner
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 nextjs

# Copy standalone build artifacts
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create uploads directory for persistent file storage
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

# Set permissions
USER nextjs

EXPOSE 3000

CMD ["bun", "run", "server.js"]
