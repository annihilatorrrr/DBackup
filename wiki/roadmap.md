# Roadmap

This page outlines planned features and improvements for DBackup. Features are subject to change based on community feedback and priorities.



## 🚀 Planned Features

### Runner Resilience
- **Retry Logic**: Exponential backoff for transient errors (network timeouts, storage hiccups)
- **Dead Letter Queue**: Move repeatedly failing jobs to a separate status for investigation

### Encryption Key Rotation
- Mechanism to rotate the `ENCRYPTION_KEY` without downtime
- Re-encrypt all stored secrets (DB passwords, SSO client secrets) with the new key
- Rotation guide in documentation

### User Invite Flow
- Email-based user invitations
- Force password change on first login
- Integration with SMTP notification adapter

### Backup Tags & Annotations
- Manually tag backups (e.g., "pre-migration", "before-upgrade")
- Pin backups to protect them from automatic retention policy deletion
- Filter and search by tags in Storage Explorer

### Backup Anomaly Detection
- Alert if backup size deviates significantly from previous runs
- Periodic "test restore" as a scheduled task



## 📊 Dashboard & Monitoring

### Backup Calendar View
- Visual overview of when backups ran (similar to GitHub contribution graph)
- Color-coded status (success, failed, skipped)

### Prometheus Metrics Endpoint
- Expose `/metrics` endpoint for Prometheus scraping
- Metrics: backup count, duration, size, success rate, queue depth
- Grafana dashboard template



## 📚 Documentation

### API Reference
- OpenAPI / Swagger documentation for all API endpoints
- Interactive API explorer



## 🧪 Testing & Quality

### End-to-End Test Suite
- Playwright or Cypress tests for critical user flows
- Login → Create job → Run backup → Restore → Verify
- Run in CI pipeline



## 🛠 Database Management & Playground

### Direct SQL Execution
- Connect directly to configured database sources
- Execute custom SQL queries from the web UI
- Query result visualization

### Query Library
- Pre-built templates for common tasks (user management, table maintenance)
- Quick-action buttons in the UI



## 🎨 Nice-to-Have

### Internationalization (i18n)
- Multi-language UI support
- Community-contributed translations

### Mobile Responsive UI
- Optimized layouts for tablet and mobile devices
- Status monitoring on the go

### Backup Size Limits & Alerts
- Warning when backups are unexpectedly large or small
- Configurable thresholds per job

### Dark Mode Refinement
- Systematic review of all components for dark mode consistency
- High-contrast accessibility mode



## ✅ Completed

For a full list of completed features, see the [Changelog](/changelog).

### v1.0.0
- ✅ Automatic database migrations (Prisma migrate on startup)
- ✅ Startup recovery (stale execution detection, temp file cleanup, queue re-init)
- ✅ Partial failure handling for multi-DB backups
- ✅ Configurable rate limiting (per-category, adjustable via Settings UI)
- ✅ Quick Setup Wizard (guided first-run experience)
- ✅ Self-service profile editing
- ✅ Backup integrity checks (SHA-256 checksums, scheduled verification)
- ✅ Disaster recovery documentation (Recovery Kit)
- ✅ Upgrade guide for v1.0.0 (config backup/restore)
- ✅ Audit log pagination with database indices
- ✅ Stress testing scripts for MySQL, PostgreSQL, MongoDB, MSSQL

### v0.9.5 – v0.9.9
- ✅ Interactive dashboard with charts and analytics (v0.9.5)
- ✅ SHA-256 checksum verification with integrity check system (v0.9.5)
- ✅ Storage usage analytics and per-destination breakdown (v0.9.5)
- ✅ Smart type filters for sources, destinations, and notifications (v0.9.5)
- ✅ Rsync, Google Drive, Dropbox & OneDrive storage adapters (v0.9.6)
- ✅ Notification system overhaul with event-based routing (v0.9.6)
- ✅ API keys with webhook triggers (v0.9.7)
- ✅ Graceful shutdown with backup-safe SIGTERM handling (v0.9.7)
- ✅ Robust health check endpoint (v0.9.7)
- ✅ Notification adapters: Slack, Teams, Gotify, ntfy, Telegram, Twilio SMS, Generic Webhook (v0.9.8)
- ✅ Storage alerts and notification logs (v0.9.9)

### Earlier Versions
- ✅ Multi-database support (MySQL, PostgreSQL, MongoDB, SQLite, MSSQL, Redis)
- ✅ AES-256-GCM backup encryption with Vault
- ✅ GZIP and Brotli compression
- ✅ S3, SFTP, Local, WebDAV, SMB, FTP/FTPS storage adapters
- ✅ Discord and Email notifications
- ✅ Cron-based scheduling with GVS retention
- ✅ RBAC permission system
- ✅ SSO/OIDC authentication (Authentik, PocketID, Generic)
- ✅ TOTP and Passkey 2FA
- ✅ Live backup progress monitoring
- ✅ System configuration backup & restore
- ✅ Audit logging
- ✅ Centralized logging system with custom error classes
- ✅ wget/curl download links & token-based public downloads
- ✅ Redis database support with restore wizard
- ✅ Type-safe adapter configurations
- ✅ User preferences system
- ✅ PostgreSQL TAR architecture with per-DB custom format dumps
- ✅ Microsoft SQL Server support with Azure SQL Edge compatibility



## 💡 Feature Requests

Have an idea for a new feature? Open an issue on [GitHub](https://github.com/Skyfay/DBackup/issues).
