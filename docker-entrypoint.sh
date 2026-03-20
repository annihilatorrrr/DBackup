#!/bin/sh
set -e

# ─── Configurable UID/GID ────────────────────────────────────
# Defaults match the build-time user (1001:1001).
# Override with PUID/PGID env vars to match host user permissions.
PUID=${PUID:-1001}
PGID=${PGID:-1001}

# Adjust group ID in /etc/group if changed
if [ "$PGID" != "1001" ]; then
  sed -i "s/^nodejs:x:1001:/nodejs:x:${PGID}:/" /etc/group
fi

# Adjust user ID and/or group reference in /etc/passwd if changed
if [ "$PUID" != "1001" ] || [ "$PGID" != "1001" ]; then
  sed -i "s/^nextjs:x:1001:1001:/nextjs:x:${PUID}:${PGID}:/" /etc/passwd
fi

# ─── Fix internal directory permissions ───────────────────────
# Only fix directories that are always part of the app.
# User-configured mount points (e.g. /backups) are managed by
# the host via PUID/PGID matching the host user.
mkdir -p /app/db /app/storage
chown -R "$PUID:$PGID" /app/db /app/storage /pnpm

# ─── Start application ───────────────────────────────────────
# Run database migrations, then start the Next.js server
exec su-exec "$PUID:$PGID" /bin/sh -c 'prisma migrate deploy && node server.js'
