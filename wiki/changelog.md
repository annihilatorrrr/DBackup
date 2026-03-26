# Changelog

All notable changes to DBackup are documented here.

## v1.2.1
*Released: March 26, 2026*

### ✨ Features

- **execution**: Cancel running or pending executions from the live log dialog - a "Cancel" button now appears in the execution header when a backup or restore is in progress
- **execution**: New `Cancelled` status for executions - cancelled jobs are cleanly marked with proper log entries instead of showing as failed

### 🐛 Bug Fixes

- **mssql**: Fixed Database Explorer and Restore page showing 0 databases for MSSQL sources - replaced global singleton connection pool (`sql.connect()`) with independent per-operation pools (`new ConnectionPool()`) to prevent concurrent requests from closing each other's connections
- **mssql**: Fixed large database backups/restores hanging and timing out - `BACKUP DATABASE` and `RESTORE DATABASE` queries now run without request timeout (previously limited to 5 minutes, causing failures on databases >5 GB)
- **explorer**: Fixed Database Explorer not displaying server version - removed broken parallel `test-connection` call and now uses version info returned by `database-stats` endpoint

### 🎨 Improvements

- **mssql**: SQL Server progress messages (e.g. "10 percent processed") are now streamed to the execution log in real-time instead of only appearing after the backup/restore completes
- **dashboard**: All dashboard widgets (activity chart, job status donut, latest jobs list) now display the `Cancelled` status with a neutral gray color

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.2.1`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64


## v1.2.0 - HTTPS by Default, Certificate Management & Per-Adapter Health Notifications
*Released: March 25, 2026*

> ⚠️ **Breaking:** Volume mounts have changed. Replace `./db:/app/db` and `./storage:/app/storage` with a single `./data:/data` mount. Then move the current data to the new structure after first startup. Update `BETTER_AUTH_URL` to `https://` - HTTPS is now the default protocol. Set `DISABLE_HTTPS=true` if you use a TLS-terminating reverse proxy but its not recommended in terms of security.

### ✨ Features

- **notifications**: Per-adapter health check notification opt-out - sources and destinations can individually disable offline/recovery alerts via a toggle in the Configuration tab while health checks continue running
- **security**: Built-in HTTPS support - DBackup now defaults to HTTPS with an auto-generated self-signed certificate on first start, protecting all traffic including database passwords, encryption keys, and session cookies
- **security**: Certificate management UI - new "Certificate" tab in System Settings to view certificate details (issuer, expiry, fingerprint), upload custom PEM certificates, or regenerate self-signed certs
- **security**: HSTS header - when accessed via HTTPS, DBackup now sends `Strict-Transport-Security` to enforce future HTTPS connections in the browser
- **security**: Auto-renewal for self-signed certificates - expired self-signed certs are automatically regenerated on container start; custom certificates are never replaced, only a warning is logged

### 🔄 Changed

- **server**: Default protocol changed from HTTP to HTTPS - set `DISABLE_HTTPS=true` to use plain HTTP (e.g. behind a TLS-terminating reverse proxy)
- **docker**: Consolidated volume mounts into single `/data` directory - replaces separate `/app/db`, `/app/storage` mounts with one `./data:/data` mount containing `db/`, `storage/`, and `certs/` subdirectories. `/backups` remains a separate optional mount for local backups

### 🎨 Improvements

- **ui**: Edit Configuration dialog now uses Shadcn ScrollArea instead of native browser overflow for consistent scrollbar styling

### 🧪 Tests

- **security**: Added 21 unit tests for `certificate-service` covering certificate info parsing, upload validation (PEM format, cert-key matching, temp file cleanup), self-signed regeneration, and HTTPS toggle

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.2.0`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64


## v1.1.0 - Notification System Expansion & UI Improvements
*Released: March 24, 2026*

### ✨ Features

- **notifications**: New "Connection Offline" system notification event - sends an alert when a source or destination becomes unreachable after repeated health check failures, with configurable repeat reminder (default 24h)
- **notifications**: New "Connection Recovered" system notification event - sends an alert when a previously offline source or destination becomes reachable again, including downtime duration

### 🎨 Improvements

- **ui**: Empty state on Settings → Notifications now links directly to the Notifications page to create an adapter
- **ui**: Redesigned permission picker for API Key and Group dialogs - replaced cramped scroll area with a spacious 3-column category card grid, global select/deselect all, and per-category count badges for much better overview

### 📝 Documentation

- **docs**: Added "No Vendor Lock-In" messaging to README and Wiki - highlights that backups are standard dumps, decryptable offline with the Recovery Kit and a standalone script

### 🧪 Tests

- **notifications**: Updated event count assertions to match new health check events (14 event types, 12 system event definitions, added `health` category)
- **runner**: Fixed "Closing rpc while fetch was pending" CI failure in notification-logic tests - added missing mocks for `dashboard-service` and `notification-log-service` to prevent unresolved dynamic imports during test teardown

### 🔧 CI/CD

- **pipeline**: Added Wiki Build stage to validate workflow - ensures the VitePress documentation builds without errors on every PR

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.1.0`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64


## v1.0.7 - PostgreSQL Version Mismatch Fix & Docker Build Validation
*Released: March 22, 2026*

### 🐛 Bug Fixes

- **PostgreSQL**: Fixed pg_dump version mismatch in Docker container - PostgreSQL 17 backups failed because `postgresql17-client` and `postgresql18-client` were not installed, causing fallback to pg_dump 16

### 🔧 CI/CD

- **Docker**: Added build-time validation for all pg_dump versions - Docker build now fails immediately if any PostgreSQL client binary is missing or has the wrong version

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.7`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64


## v1.0.6 - Quick Setup fix & Developer Tooling
*Released: March 22, 2026*

### ✨ Features

- **UI**: Documentation menu in the profile dropdown now expands into a submenu with three options: Dokumentation (external docs), API Docs Local (`/docs/api`), and API Docs Remote (`api.dbackup.app`)

### 🐛 Bug Fixes

- **quick-setup**: Added missing database selection picker to the job step for adapters that support it (MySQL, MariaDB, PostgreSQL, MongoDB, MSSQL)

### 📝 Documentation

- **README**: Replaced static dashboard screenshot with demo video showcasing backup and restore workflow
- **README**: Redesigned Features section with categorized subsections, icons, and unique selling points (selective DB backup, live progress, system notifications, UI simplicity)
- **wiki**: Added demo video to the documentation homepage
- **API Docs**: Fixed DBackup Support link - now points to community support page instead of non-functional email

### 🔧 CI/CD

- **scripts**: Added `sync-version.sh` script and `pnpm version:sync` / `pnpm version:bump <patch|minor|major>` commands to sync version across all files automatically

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.6`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64

## v1.0.5 - Docker Permissions & Environment Variables
*Released: March 20, 2026*

### ✨ Features

- **Docker**: Configurable `PUID`/`PGID` environment variables (default: `1001`) - the entrypoint adjusts the runtime user at startup to match host volume permissions

### 🎨 Improvements

- **Dockerfile**: Dedicated `docker-entrypoint.sh` replaces inline CMD - validates `PUID`/`PGID`, conditionally chowns `/pnpm` only when ownership differs, and runs `node` as PID 1 for proper signal handling
- **Dockerfile**: Global Prisma CLI pinned to exact version (`5.22.0`) matching `package.json` to prevent version drift
- **Dockerfile**: Merged Prisma generate and Next.js build into a single layer, consistent `--chown=1001:1001` on all COPY directives

### 📝 Documentation

- **wiki**: Documented `PUID`/`PGID` environment variables in the environment reference

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.5`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64

## v1.0.4 - Hotfix Release
*Released: March 20, 2026*

### 🐛 Bug Fixes

- **Dockerfile**: Fixed container crash on startup (`Can't write to @prisma/engines`) caused by globally installed Prisma being owned by root instead of the runtime user

### 🔧 CI/CD

- **pipeline**: Added build verification job to release workflow - starts the built image and polls `/api/health` before publishing, catching runtime permission and startup failures

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.4`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64

## v1.0.3 - Docker Optimization & MSSQL Improvements
*Released: March 19, 2026*

### 🐛 Bug Fixes

- **MSSQL**: Backup and restore errors now show the actual SQL Server cause instead of only "terminating abnormally" by extracting preceding error messages
- **MSSQL**: Database Explorer now correctly shows table counts by querying each database individually instead of using a broken cross-database `INFORMATION_SCHEMA` subquery

### 🎨 Improvements

- **Dockerfile**: Global Prisma install switched from `npm` to `pnpm` for consistency and smaller image size
- **Dockerfile**: corepack activated in the base stage so all build stages inherit pnpm without reinstalling
- **Dockerfile**: Build now uses `pnpm run build` and `pnpm prisma generate` consistently instead of `npm`/`npx`
- **Dockerfile**: Combined base-stage RUN layers (corepack + PG symlinks), added `COPY --link` for layer-independent caching, merged runner RUN layers, and added pnpm store mount-cache for faster dependency installs
- **Dockerfile**: `.dockerignore` extended to exclude `wiki/`, `api-docs/`, `README.md`, and `LICENSE` to reduce build context size

### 🛠 CI/CD

- **pipeline**: GitHub Releases are now auto-generated from `wiki/changelog.md` on every version tag push - no manual copy-paste required
- **pipeline**: Removed QEMU from Docker builds - amd64 and arm64 now build natively on their respective GitHub runners
- **pipeline**: Switched Docker layer cache from GHCR registry to GitHub Actions cache for faster cache hits
- **Dockerfile**: Fixed ARM64 build failure (`invalid user index: -1`) by using numeric UID/GID (`1001:1001`) instead of user/group names in `COPY --link --chown` directives

### 📝 Documentation

- **wiki**: New user guide article - [Encryption Key](https://dbackup.app/user-guide/security/encryption-key): explains what `ENCRYPTION_KEY` protects, what happens when the key is lost or mismatched, and recovery options

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.3`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64

## v1.0.2 - Cleanup & File Extension Fix
*Released: March 17, 2026*

### 🐛 Bug Fixes

- **backup**: Backup files now use adapter-specific extensions (`.bak`, `.archive`, `.rdb`, `.db`) instead of always `.sql`
- **restore**: "Existing Databases" panel now scrolls correctly when the target server has many databases

### 🎨 Improvements

- **codebase**: Removed unused components, dead exports, stale commented-out code, and empty directories
- **codebase**: Removed unused `ServiceResult` pattern file and its advisory lint test
- **ui**: API Trigger dialog "Overview" tab now shows the correct `success` field in the trigger and poll JSON examples

### 🛠 CI/CD

- **pipeline**: Migrated CI/CD from GitLab CI to GitHub Actions with parallel lint, type-check, and unit test jobs
- **pipeline**: Multi-arch Docker builds (amd64/arm64) now push to GHCR and Docker Hub with identical tag strategy
- **GitLab**: Added GitHub Action to mirror all branches and tags to GitLab for commit activity sync

### 📝 Documentation

- **wiki**: Complete overhaul of all adapter guides - unified structure, 4-column config tables verified against code, and collapsible provider examples
- **wiki**: Rewrote all 13 destination guides, 6 source guides, and 9 notification guides with accurate default values and required fields

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.2`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64


## v1.0.1 - Hotfix Release & API Documentation
*Released: March 14, 2026*

### 🐛 Bug Fixes

- **ui**: Mouse wheel now works in all `CommandList`-based dropdowns (Radix ScrollArea bypass)
- **MSSQL**: Backup failures now include actual SQL Server error messages instead of only "terminating abnormally"
- **performance**: Resolved multiple patterns causing app hangs - parallel health checks with 15s timeout, async MySQL CLI detection, async file I/O, adaptive history polling

### 🔧 CI/CD

- **pipeline**: Added `validate` stage running lint, type-check, and tests in parallel before Docker builds
- **pipeline**: Split single `docker buildx` into parallel amd64/arm64 jobs, combined via `imagetools create`
- **Docker Hub**: Automatically pushes README to Docker Hub on release with absolute image URLs

### 📝 Documentation

- **API**: Full OpenAPI 3.1 spec with interactive Scalar reference at `/docs/api` and [api.dbackup.app](https://api.dbackup.app)
- **user guide**: Getting Started rewritten and expanded into multi-page User Guide (Getting Started, First Steps, First Backup)
- **README**: Revised feature list, added Community & Support section with Discord, GitLab Issues, and contact emails

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.1`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64


## v1.0.0 - First Stable Release
*Released: March 10, 2026*

🎉 **DBackup 1.0.0 - the first stable release.** Stabilizes the platform after the beta phase with quality-of-life fixes, stale execution recovery, update notifications, and dashboard polish.

> ⚠️ **Breaking:** All Prisma migrations squashed into a single `0_init` migration. Existing beta databases are **not compatible**. Export your config via Settings → Config Backup before upgrading, then re-import after `npx prisma migrate deploy`.

### ✨ Features

- **sessions**: Configurable session lifetime (1h–90d), sessions tab in profile with browser/OS icons, revoke individual or all other sessions
- **backup**: Stale execution recovery - on startup, detects executions stuck in `Running`/`Pending` and marks them as `Failed`
- **notifications**: Update notifications when a new version is detected, with deduplication and configurable reminder intervals (default: 7 days)
- **notifications**: Storage alerts and update notifications support repeat intervals (Disabled / 6h / 12h / 24h / 2d / 7d / 14d)
- **jobs**: Multi-destination fan-out - upload to unlimited storage destinations per job with per-destination retention policies and `Partial` status
- **jobs**: Database selection moved from Source config to Job form with multi-select `DatabasePicker`
- **config backup**: Enhanced import with statistics toggle, smart encryption recovery, name-based deduplication, and FK remapping
- **validation**: Sources, Jobs, Encryption Profiles, and Groups enforce unique names with HTTP 409 and descriptive toasts

### 🔒 Security

- **auth**: Fixed middleware matcher to correctly apply rate limiting to authentication endpoints
- **adapters**: Strict Zod schemas reject shell metacharacters in adapter config fields (command injection prevention)
- **MSSQL**: Database name identifiers now properly escaped with bracket notation (SQL injection prevention)
- **SSO**: `clientId` and `clientSecret` encrypted at rest with AES-256-GCM

### 🎨 Improvements

- **scheduler**: New dual-mode schedule picker with Simple Mode (frequency pills + dropdowns) and Cron Mode with human-readable descriptions
- **jobs**: Form restructured into 4 tabs (General, Destinations, Security, Notify) with database picker and inline retention
- **ui**: Replaced orange pulsing update indicator with muted blue styling

### 🐛 Bug Fixes

- **Redis**: Replaced incorrect multi-select database picker with 0–15 dropdown
- **ui**: Fixed database icon showing red instead of yellow for `Pending` executions
- **API**: Bash trigger script checks `success: true` before parsing; documented `history:read` requirement
- **auth**: Split rate limit module into Edge-safe and server-only to avoid `node:crypto` import in Edge Runtime
- **config backup**: Fixed 7 issues including missing Zod field, download crash, meta format detection, and FK violations

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.0.0`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.9-beta - Storage Alerts, Notification Logs & Restore Improvements
*Released: February 22, 2026*

### ✨ Features

- **restore**: Backup compatibility matrix - pre-restore version check with green/orange/red banners and MSSQL edition guard
- **MSSQL**: SSH test button - tests SSH connectivity, backup path access, and write permissions
- **restore**: Dedicated restore page with 2-column layout, file details, database mapping, privileged auth, and version checks
- **storage**: Explorer with tabs (Explorer, History, Settings), side-by-side charts, and trend indicators
- **storage**: Three alert types (Usage Spike, Storage Limit, Missing Backup) with per-destination config and notification integration
- **settings**: Data retention settings - separate retention periods for Audit Logs and Storage Snapshots (7d–5y)
- **notifications**: Notification log history with adapter-specific previews (Discord, Email, Slack, Telegram, Teams) and filterable table

### 🎨 Improvements

- **email**: Template redesign - Shadcn/UI style card layout with zinc palette, color-coded status badges, and dark mode support
- **restore**: Rich notification context with database type, storage name, backup filename, duration, and failure details
- **backup**: Selective TAR extraction - multi-database restores extract only selected databases, reducing I/O
- **ui**: Skeleton loading placeholders across Storage Explorer, History, and Database Explorer
- **storage**: Tab-aware refresh - refresh button reloads the active tab instead of always refreshing the file list
- **ui**: Database Explorer matches Storage Explorer's visual style with empty state cards

### 🔄 Changed

- **ui**: Replaced Radix ScrollArea with native browser scrollbars across all components

### 🐛 Bug Fixes

- **setup**: Fixed "Please select an adapter type first" error in Quick Setup adapter selection
- **setup**: Test Connection button now works in all Quick Setup steps

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.9-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.8-beta - Notification Adapters Expansion & Quick Setup Wizard
*Released: February 20, 2026*

### ✨ Features

- **Slack**: Incoming Webhooks with Block Kit formatting, color-coded attachments, channel override, and custom bot identity
- **Teams**: Power Automate Workflows with Adaptive Cards v1.4 and color mapping
- **webhook**: Generic webhook adapter - universal HTTP POST/PUT/PATCH with custom JSON templates, auth headers, and custom headers
- **Gotify**: Self-hosted push notifications with configurable priority levels and Markdown formatting
- **ntfy**: Topic-based push notifications (public or self-hosted) with priority escalation and emoji tags
- **Telegram**: Bot API with HTML formatting, flexible targets (chats, groups, channels), and silent mode
- **Twilio**: SMS alerts with concise formatting optimized for message length and E.164 phone numbers
- **setup**: Quick Setup Wizard - 7-step guided first-run (Source → Destination → Vault → Notification → Job → Run)
- **navigation**: Grouped sidebar organized into General, Backup, Explorer, and Administration groups

### 📝 Documentation

- **notifications**: Per-channel setup guides for all 9 notification channels

### 🐛 Bug Fixes

- **scheduler**: Enabling/disabling automated config backup now takes effect immediately without restart
- **ui**: Storage History button and Health History popover now respect user permissions
- **API**: Health History endpoint accepts either `sources:read` or `destinations:read`

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.8-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.7-beta - API Keys, Webhook Triggers, Adapter Picker & Brand Icons
*Released: February 20, 2026*

### ✨ Features

- **ui**: Visual adapter picker - two-step create flow with card grid, search bar, and category tabs
- **ui**: Brand icons - multi-colored SVG logos via Iconify for all adapters, bundled offline for self-hosted deployments
- **MSSQL**: SSH/SFTP file transfer for accessing `.bak` files on remote SQL Server hosts with automatic cleanup
- **MSSQL**: Encryption and self-signed certificate toggles exposed in the UI
- **restore**: Database stats section showing target server databases with sizes, table counts, and conflict detection
- **explorer**: Database Explorer - standalone page to browse databases on any source with server overview and sortable stats
- **auth**: API key management - fine-grained permissions, expiration dates, secure storage, full lifecycle
- **API**: Webhook triggers - trigger backups via `POST /api/jobs/:id/run` with cURL, Bash, and Ansible examples
- **auth**: Unified auth system - all API routes support both session cookies and API key Bearer tokens
- **Docker**: Health check - polls `/api/health` every 30s returning app status, DB connectivity, and memory usage
- **auth**: Configurable rate limits - per-category limits (Auth, API Read, API Write) with auto-save UI
- **backup**: Graceful shutdown - waits for running backups, freezes queue, stops scheduler, cleans up pending jobs
- **storage**: Grouped destination selector - adapters grouped into Local, Cloud Storage, Cloud Drives, and Network categories
- **adapters**: `getDatabasesWithStats()` - all adapters expose database size and table/collection count
- **ui**: Default port placeholders for MSSQL (1433), Redis (6379), and MariaDB (3306)
- **config**: Zod-based startup validation for environment variables with clear error messages

### 🐛 Bug Fixes

- **ui**: Fixed `cmdk` intercepting mouse wheel scroll events in dropdowns
- **ui**: Fixed conditional form fields appearing before their controlling dropdown is selected

### 📝 Documentation

- **wiki**: API Reference, API Keys, Webhook Triggers, and Rate Limits guides

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.7-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.6-beta - Cloud Storage, Rsync & Notification System
*Released: February 15, 2026*

### ✨ Features

- **notifications**: System notification framework for user logins, account creation, restore results, and system errors with per-event toggles
- **email**: Multi-recipient tag/chip input with paste support for comma/semicolon-separated lists
- **Google Drive**: OAuth 2.0 with encrypted refresh tokens, visual folder browser, and resumable uploads
- **Dropbox**: OAuth 2.0 with visual folder browser and chunked uploads for files > 150 MB
- **OneDrive**: OAuth 2.0 for personal and organizational accounts with smart upload strategy
- **rsync**: Delta transfer via rsync over SSH with Password, Private Key, or SSH Agent auth
- **storage**: Usage history - area charts showing storage size over time (7d–1y) with automatic hourly snapshots

### 🔒 Security

- **OAuth**: Refresh tokens and client secrets encrypted at rest with AES-256-GCM
- **rsync**: Passwords passed via `SSHPASS` env var, never as CLI arguments

### 🎨 Improvements

- **dashboard**: Cached storage statistics served from DB cache instead of live API calls, auto-refreshed hourly
- **storage**: All storage adapters queried in parallel instead of sequentially

### 🐛 Bug Fixes

- **dashboard**: Fixed Job Status chart stretching when many destinations are configured
- **ui**: Fixed missing adapter details for OneDrive, MariaDB, and MSSQL in tables

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.6-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.5-beta - Dashboard Overhaul, Checksums & Visual Analytics
*Released: February 13, 2026*

### ✨ Features

- **backup**: SHA-256 checksum verification - end-to-end integrity with checksums on backup, verification on restore, and optional weekly integrity check
- **dashboard**: Interactive dashboard with activity chart, job status donut, 7 KPI cards, latest jobs widget, and smart auto-refresh
- **ui**: Smart type filters - faceted filters on Sources, Destinations, and Notifications pages
- **WebDAV**: Nextcloud, ownCloud, Synology, and any WebDAV server support
- **SMB**: Windows servers and NAS devices with configurable protocol version and domain auth
- **FTP**: FTP/FTPS servers with optional TLS encryption
- **storage**: Per-destination overview widget with backup count and total size from live file scanning

### 🐛 Bug Fixes

- **backup**: File size now reflects actual compressed/encrypted size instead of raw dump size
- **ui**: Fixed crash with relative date formatting in DateDisplay component

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.5-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.4-beta - Universal Download Links & Logging System
*Released: February 6, 2026*

### ✨ Features

- **backup**: wget/curl download links - temporary links with countdown timer, encrypted/decrypted format selection
- **logging**: Centralized logger with child loggers, `LOG_LEVEL` env control, colored dev output (JSON in production)
- **errors**: Custom error class hierarchy (`DBackupError`, `AdapterError`, `ServiceError`, etc.) with `wrapError()` utilities
- **logging**: API request middleware logging with method, path, duration, and anonymized IP

### 🎨 Improvements

- **adapters**: Type-safe adapter configs - all adapters use exported TypeScript types instead of `config: any`
- **MongoDB**: Connection test uses native `mongodb` npm package instead of `mongosh` (Docker compatibility)

### 🗑️ Removed

- **backup**: Legacy multi-DB code - removed `pg_dumpall`, MySQL `--all-databases`, and MongoDB multi-DB parsing (replaced by TAR in v0.9.1)

### 📝 Documentation

- **wiki**: Download tokens, Storage Explorer, and Logging System developer documentation

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.4-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.3-beta - Redis Support, Restore UX & Smart File Extensions
*Released: February 2, 2026*

### ✨ Features

- **Redis**: RDB snapshot backups for Redis 6/7/8 with Standalone & Sentinel mode, ACL auth, TLS, and database index selection
- **Redis**: 6-step restore wizard with secure download links (5-min expiry) and platform-specific instructions
- **backup**: Smart file extensions - adapter-specific extensions: `.sql`, `.bak`, `.archive`, `.rdb`, `.db`
- **backup**: Token-based downloads - secure, single-use download links (5-min expiry) for wget/curl without session cookies
- **settings**: User preferences - auto-redirect toggle for disabling automatic History page redirection on job start
- **Docker Hub**: Published at `skyfay/dbackup` with sensible `DATABASE_URL` default, `TZ` and `TMPDIR` support
- **config**: `TRUSTED_ORIGINS` env var for multiple access URLs (comma-separated)

### 🐛 Bug Fixes

- **auth**: Auth client correctly uses browser origin instead of hardcoded URL

### 📝 Documentation

- **wiki**: Consolidated installation guide with Docker Compose/Run tab switcher and environment variables audit

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.3-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.2-beta - Branding & Documentation
*Released: February 1, 2026*

### ✨ Features

- **branding**: Official DBackup logo with multi-resolution favicon support and brand integration (login, sidebar, browser tab)
- **docs**: Documentation portal launched at [dbackup.app](https://dbackup.app) with in-app link and Discord community
- **SEO**: Meta tags, Open Graph, Twitter Cards, and structured data

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.2-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.1-beta - Unified Multi-DB TAR Architecture
*Released: February 1, 2026*

> ⚠️ **Breaking:** Multi-database backups now use TAR archives instead of inline SQL/dump streams. **Old multi-DB backups cannot be restored with v0.9.1+.** Single-database backups are not affected.

### ✨ Features

- **backup**: Unified TAR multi-DB format - all adapters use the same TAR format with `manifest.json`, enabling selective restore and database renaming

### 🎨 Improvements

- **PostgreSQL**: Uses `pg_dump -Fc` per database instead of `pg_dumpall` for smaller, parallel-ready backups
- **MongoDB**: True multi-DB support with `--nsFrom/--nsTo` renaming on restore

### 🧪 Tests

- **integration**: 84 integration tests - multi-DB tests, MSSQL test setup, Azure SQL Edge ARM64 skip

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.1-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.9.0-beta - Microsoft SQL Server & Self-Service Security
*Released: January 31, 2026*

### ✨ Features

- **MSSQL**: Full adapter with auto-detection of edition/version, multi-DB TAR backups, server-side compression, and parameterized queries
- **auth**: Password change from profile settings with audit logging

### 🧪 Tests

- **testing**: Stress test data generator, dedicated `testdb` container, and MSSQL `/tmp` cleanup

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.9.0-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.8.3-beta - Meta-Backups & System Task Control
*Released: January 30, 2026*

### ✨ Features

- **config backup**: Self-backup of app configuration (Users, Jobs, Settings) to storage adapters with full restore flow
- **encryption**: Profile portability - export/import secret keys for server migration with Smart Recovery
- **settings**: System task management - admins can enable/disable background tasks; config backup moved into standard scheduler

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.8.3-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.8.2-beta - Keycloak, Encryption Imports & Database Reset
*Released: January 29, 2026*

> ⚠️ **Breaking:** Database schema consolidated into a single init migration. **Delete existing `dev.db` and let the app re-initialize.** Data cannot be migrated automatically.

### ✨ Features

- **SSO**: Keycloak adapter - dedicated OIDC adapter with HTTPS enforcement
- **encryption**: Profile import for disaster recovery on fresh instances

### 🎨 Improvements

- **auth**: 2-step email-first login flow with tabbed SSO configuration UI

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.8.2-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.8.1-beta - SQLite Support & Remote File Browsing
*Released: January 26, 2026*

### ✨ Features

- **SQLite**: Backup local and remote (via SSH tunnel) SQLite databases with safe restore cleanup
- **ui**: Remote file browser for browsing local and SSH filesystems, integrated into adapter forms
- **SFTP**: Distinct Password and Private Key authentication options

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.8.1-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.8.0-beta - The First Beta
*Released: January 25, 2026*

🚀 First official Beta with enterprise-ready features.

### ✨ Features

- **SSO**: Full OpenID Connect with Authentik, PocketID, and Generic providers including account linking and auto-provisioning
- **S3**: AWS S3 and compatible providers (MinIO, R2, etc.) via AWS SDK
- **SFTP**: Secure backup offloading to remote servers with connection testing
- **audit**: Comprehensive action tracking with IP, User Agent, change diffs, configurable retention, and faceted filtering
- **MariaDB**: Dedicated adapter with dialect handling
- **adapters**: Auto-detection of database version and dialect (MySQL 5.7 vs 8.0, etc.)
- **system**: Update checker - notifies admins when new versions are available
- **adapters**: Visual health history grid and badges for all adapters

### 🔒 Security

- **MySQL**: Password handling switched to `MYSQL_PWD` environment variable

### 🧪 Tests

- **testing**: Unit and integration tests for backup/restore pipelines, storage, notifications, and scheduler

### 🐳 Docker

- **Image**: `skyfay/dbackup:v0.8.0-beta`
- **Also tagged as**: `beta`
- **Platforms**: linux/amd64, linux/arm64


## v0.5.0-dev - RBAC System, Encryption Vault & Core Overhaul
*Released: January 24, 2026*

### ✨ Features

- **auth**: RBAC system - user groups with granular permissions, management UI, and protected SuperAdmin group
- **encryption**: Recovery kits - offline recovery kits for emergency decryption with master key reveal dialog
- **backup**: Native compression support integrated into UI and pipeline
- **backup**: Live progress tracking with indeterminate progress bars for streaming
- **auth**: API and authentication endpoint rate limiting
- **auth**: 2FA administration - admins can reset 2FA for locked-out users

### 🎨 Improvements

- **backup**: Pipeline architecture - job runner refactored into modular steps with dedicated service layer
- **queue**: Max 10 concurrent jobs with optimized MySQL/PostgreSQL streaming
- **ui**: DataTables with faceted filtering, Command-based Popovers, and Recovery Kit card UI
