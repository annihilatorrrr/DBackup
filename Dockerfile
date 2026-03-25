# Base Image: Node.js 24 on Alpine Linux (small & secure)
FROM node:24-alpine AS base

# Install necessary system tools for backups
# mysql-client -> mysqldump
# mongodb-tools -> mongodump
# redis -> redis-cli (for Redis backups)
# samba-client -> smbclient (for SMB/CIFS storage)
# PostgreSQL Versions Strategy (all versioned explicitly):
# - postgresql14-client (from Alpine 3.17 repo) -> handles PG 12, 13, 14
# - postgresql16-client (from Alpine 3.23 repo) -> handles PG 15, 16
# - postgresql17-client (from Alpine 3.23 repo) -> handles PG 17
# - postgresql18-client (from Alpine 3.23 repo) -> handles PG 18+

RUN echo 'http://dl-cdn.alpinelinux.org/alpine/v3.17/main' >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache \
    mysql-client \
    postgresql14-client \
    postgresql16-client \
    postgresql17-client \
    postgresql18-client \
    mongodb-tools \
    redis \
    samba-client \
    rsync \
    sshpass \
    openssh-client \
    openssl \
    curl \
    zip \
    su-exec

# Enable corepack for pnpm support and create PostgreSQL symlinks
# All versioned: postgresql14-client (v3.17), postgresql16/17/18-client (v3.23)
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate && \
    mkdir -p /opt/pg14/bin /opt/pg16/bin /opt/pg17/bin /opt/pg18/bin && \
    ln -sf /usr/libexec/postgresql14/pg_dump /opt/pg14/bin/pg_dump && \
    ln -sf /usr/libexec/postgresql14/pg_restore /opt/pg14/bin/pg_restore && \
    ln -sf /usr/libexec/postgresql14/psql /opt/pg14/bin/psql && \
    ln -sf /usr/libexec/postgresql16/pg_dump /opt/pg16/bin/pg_dump && \
    ln -sf /usr/libexec/postgresql16/pg_restore /opt/pg16/bin/pg_restore && \
    ln -sf /usr/libexec/postgresql16/psql /opt/pg16/bin/psql && \
    ln -sf /usr/libexec/postgresql17/pg_dump /opt/pg17/bin/pg_dump && \
    ln -sf /usr/libexec/postgresql17/pg_restore /opt/pg17/bin/pg_restore && \
    ln -sf /usr/libexec/postgresql17/psql /opt/pg17/bin/psql && \
    ln -sf /usr/libexec/postgresql18/pg_dump /opt/pg18/bin/pg_dump && \
    ln -sf /usr/libexec/postgresql18/pg_restore /opt/pg18/bin/pg_restore && \
    ln -sf /usr/libexec/postgresql18/psql /opt/pg18/bin/psql

# Validate all pg_dump versions resolve correctly (fail-fast on broken symlinks/packages)
RUN /opt/pg14/bin/pg_dump --version | grep -q 'PostgreSQL) 14\.' && \
    /opt/pg16/bin/pg_dump --version | grep -q 'PostgreSQL) 16\.' && \
    /opt/pg17/bin/pg_dump --version | grep -q 'PostgreSQL) 17\.' && \
    /opt/pg18/bin/pg_dump --version | grep -q 'PostgreSQL) 18\.' || \
    (echo "ERROR: pg_dump version validation failed! Check PostgreSQL client packages." && exit 1)

# 1. Install Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 2. Builder Phase
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Generate Prisma Client and build Next.js app
RUN pnpm prisma generate && pnpm run build

# 3. Runner Phase (The actual image)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Default environment variables (can be overridden at runtime)
ENV DATABASE_URL="file:/app/db/dbackup.db"
ENV TZ="UTC"
ENV LOG_LEVEL="info"
ENV PUID=1001
ENV PGID=1001

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built files (--link for better layer caching)
COPY --from=builder --link --chown=1001:1001 /app/public ./public
COPY --from=builder --link --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --link --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=builder --link --chown=1001:1001 /app/prisma ./prisma

# Create runtime dirs + install Prisma CLI for migrations
# Note: pnpm add -g runs as root, so we must chown /pnpm to the runtime user
# to avoid "Can't write to @prisma/engines" errors at container startup
RUN mkdir -p /app/storage/avatars /app/db /app/certs && \
    chown -R 1001:1001 /app/storage /app/db /app/certs && \
    pnpm add -g prisma@5.22.0 && \
    chown -R 1001:1001 /pnpm

# Copy custom HTTPS server (replaces default Next.js server entry point)
COPY --chown=1001:1001 custom-server.js ./custom-server.js

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Health check: verify app + database are reachable
# Uses --insecure for self-signed certs; falls back to http if DISABLE_HTTPS=true
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -fk https://localhost:3000/api/health 2>/dev/null || curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DISABLE_HTTPS="false"

ENTRYPOINT ["docker-entrypoint.sh"]
