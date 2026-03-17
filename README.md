<div align="center">
  <img src="https://raw.githubusercontent.com/Skyfay/DBackup/main/wiki/public/logo.svg" alt="DBackup Logo" width="120">
</div>

<h1 align="center">DBackup</h1>

<p align="center">
  <strong>Self-hosted database backup automation with encryption, compression, and smart retention.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white" alt="MySQL">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white" alt="Redis">
  <img src="https://custom-icon-badges.demolab.com/badge/Microsoft%20SQL%20Server-CC2927?logo=mssqlserver-white&logoColor=white" alt="MSSQL">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License">
  <img src="https://img.shields.io/docker/pulls/skyfay/dbackup?logo=docker&logoColor=white" alt="Docker Pulls">
  <img src="https://img.shields.io/badge/docker-multi--arch-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/self--hosted-yes-brightgreen" alt="Self-hosted">
  <img src="https://img.shields.io/badge/open_source-%E2%9D%A4%EF%B8%8F-red" alt="Open Source">
</p>

<p align="center">
  <a href="https://dbackup.app">Documentation</a> •
  <a href="https://dbackup.app/user-guide/getting-started">Quick Start</a> •
  <a href="https://api.dbackup.app">API Reference</a> •
  <a href="https://dbackup.app/changelog">Changelog</a> •
  <a href="https://dbackup.app/roadmap">Roadmap</a>
</p>


### What is DBackup?

DBackup is a comprehensive, self-hosted backup solution designed to automate and secure your database backups. It provides enterprise-grade encryption (AES-256-GCM), flexible storage options, and intelligent retention policies to ensure your data is always protected and recoverable.

Whether you're running a single MySQL database or managing multiple PostgreSQL, MongoDB, and SQL Server instances, DBackup offers a unified interface with real-time monitoring, granular access control, and seamless restore capabilities.

![Dashboard Preview](https://raw.githubusercontent.com/Skyfay/DBackup/main/wiki/public/overview.png)

## ✨ Features

- **Multi-Database Support** — MySQL, MariaDB, PostgreSQL, MongoDB, SQLite, Redis, and Microsoft SQL Server
- **Backup Encryption** — AES-256-GCM encryption for backup files with an Encryption Vault, key rotation, and offline Recovery Kits
- **Compression** — Built-in GZIP and Brotli compression to reduce backup size and storage costs
- **Flexible Storage** — 13+ adapters: S3, Google Drive, Dropbox, OneDrive, SFTP, Rsync, WebDAV, SMB, FTP, and more
- **Multi-Destination Jobs** — Each backup job can target multiple storage destinations simultaneously — useful for redundancy or off-site copies
- **Scheduling & Retention** — Cron-based job scheduling with GVS (Grandfather-Father-Son) retention policies for automatic rotation
- **Notifications** — 9+ adapters including Discord, Slack, Teams, Telegram, Gotify, ntfy, Webhook, SMS, and Email (SMTP)
- **Restore** — Browse backup history, verify checksums, download files, or restore directly to a database — including database remapping
- **Storage Explorer** — Browse backup files across all destinations, inspect metadata, download files, or generate direct download links
- **Storage Monitoring & Alerts** — Per-destination monitoring with configurable alerts for usage spikes, storage limit warnings, and missing backups within a defined time window
- **SSO & RBAC** — OpenID Connect support (Authentik, PocketID, Generic), user groups, and granular permission system
- **API & Webhooks** — Trigger backups via REST API with fine-grained API keys — includes ready-made cURL, Bash, and Ansible examples
- **Dashboard & Analytics** — Interactive charts, real-time progress tracking, storage usage history, and auto-refreshing activity feeds
- **Configurable Rate Limits** — Per-category rate limiting (Auth, API Read, API Write) adjustable from the Settings UI
- **Docker** — Multi-arch images (AMD64/ARM64), built-in health checks, and graceful shutdown with backup-safe SIGTERM handling

## 🚀 Quick Start

**Supported Platforms**: AMD64 (x86_64) • ARM64 (aarch64)

```yaml
# docker-compose.yml
services:
  dbackup:
    image: skyfay/dbackup:latest
    container_name: dbackup
    restart: always
    ports:
      - "3000:3000"
    environment:
      - ENCRYPTION_KEY=       # openssl rand -hex 32
      - BETTER_AUTH_URL=http://localhost:3000
      - BETTER_AUTH_SECRET=   # openssl rand -base64 32
    volumes:
      - ./backups:/backups
      - ./db:/app/db
      - ./storage:/app/storage
```

```bash
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and create your admin account.

📖 **Full installation guide**: [dbackup.app/user-guide/getting-started](https://dbackup.app/user-guide/getting-started)

## 🗄️ Supported Databases

| Database | Versions |
| :--- | :--- |
| PostgreSQL | 12 – 18 |
| MySQL | 5.7, 8, 9 |
| MariaDB | 10, 11 |
| MongoDB | 4 – 8 |
| Redis | 6.x, 7.x, 8.x |
| SQLite | 3.x (Local & SSH) |
| Microsoft SQL Server | 2017, 2019, 2022 |

## ☁️ Supported Destinations

| Destination | Details |
| :--- | :--- |
| Local Filesystem | Store backups directly on the server |
| Amazon S3 | Native AWS S3 with storage class support (Standard, IA, Glacier, Deep Archive) |
| S3 Compatible | Any S3-compatible storage (MinIO, Wasabi, etc.) |
| Cloudflare R2 | Cloudflare R2 Object Storage |
| Hetzner Object Storage | Hetzner S3 storage (fsn1, nbg1, hel1, ash) |
| Google Drive | Google Drive via OAuth2 |
| Dropbox | Dropbox via OAuth2 with chunked upload support |
| Microsoft OneDrive | OneDrive via Microsoft Graph API / OAuth2 |
| SFTP | SSH/SFTP with password, private key, or SSH agent auth |
| FTP / FTPS | Classic FTP with optional TLS |
| WebDAV | WebDAV servers (Nextcloud, ownCloud, etc.) |
| SMB (Samba) | Windows/Samba network shares (SMB2, SMB3) |
| Rsync | File transfer via rsync over SSH |

## 🔔 Supported Notifications

| Channel | Details |
| :--- | :--- |
| Discord | Webhook-based notifications with rich embeds |
| Slack | Incoming webhook notifications with Block Kit formatting |
| Microsoft Teams | Adaptive Card notifications via Power Automate webhooks |
| Gotify | Self-hosted push notifications with priority levels |
| ntfy | Topic-based push notifications (self-hosted or ntfy.sh) |
| Generic Webhook | JSON payloads to any HTTP endpoint (PagerDuty, etc.) |
| Telegram | Bot API push notifications to chats, groups, and channels |
| SMS (Twilio) | SMS text message alerts via Twilio API |
| Email (SMTP) | SMTP with SSL/STARTTLS support, multiple recipients |

## 📚 Documentation

Full documentation is available at **[dbackup.app](https://dbackup.app)**:

- [User Guide](https://dbackup.app/user-guide/getting-started) — Installation, configuration, usage
- [API Reference](https://api.dbackup.app) — Interactive REST API documentation
- [Developer Guide](https://dbackup.app/developer-guide/) — Architecture, adapters, contributing
- [Changelog](https://dbackup.app/changelog) — Release history
- [Roadmap](https://dbackup.app/roadmap) — Planned features

## 🛠️ Development

```bash
# Clone & install
git clone https://github.com/Skyfay/DBackup.git && cd DBackup
pnpm install

# Configure environment
cp .env.example .env  # Edit with your secrets

# Initialize database
npx prisma db push

# Start dev server
pnpm dev
```

For testing infrastructure and contribution guidelines, see the [Developer Guide](https://dbackup.app/developer-guide/).

## 💬 Community & Support

- 💬 **Discord**: Join our community at [https://dc.skyfay.ch](https://dc.skyfay.ch)
- 📝 **Documentation**: Full guides and API reference at [dbackup.app](https://dbackup.app)
- 🐛 **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/Skyfay/DBackup/issues)
- 📧 **Support**: General questions and support via [support@dbackup.app](mailto:support@dbackup.app)
- 🔒 **Security**: Report vulnerabilities responsibly via [security@dbackup.app](mailto:security@dbackup.app) (please do **not** open public issues for security reports)

## 🤖 AI Development Transparency & Security Notice

### Architecture & Concept (Human-Led):

The system architecture, infrastructure design, strict technology stack selection, and feature specifications for DBackup were entirely conceptualized and directed by a human System Engineer to solve real-world infrastructure challenges.

### Code Generation (AI-Driven):

100% of the underlying application code, including the backend logic and frontend components, was written by advanced AI coding agents based on strict architectural prompts. No manual software coding was performed.

### Testing & Quality Assurance:

Manual Functional Testing: Every single feature has been extensively and manually tested by a human to ensure complete functional correctness, stability, and reliability in real-world scenarios.

Automated & Security Audits: Automated unit testing (Vitest) and initial static security audits were also conducted and implemented using AI agents.

### Community Call for Code Review:

While DBackup is functionally robust, heavily tested for daily use, and built on modern architectural best practices, the codebase has not yet undergone a manual security review by a human software developer. Due to the nature of AI-generated code and AI-driven audits, hidden structural vulnerabilities might still exist.

If you are a software developer or cybersecurity professional, your expertise is highly welcome! We invite the open-source community to review the code, submit PRs, and help us elevate DBackup to a fully verified, enterprise-ready standard.

> **Security Disclosure**: If you discover a security vulnerability, please **do not** open a public GitHub issue. Instead, report it responsibly via email to **[security@dbackup.app](mailto:security@dbackup.app)**.

## 📝 License

[GNU General Public License v3.0](LICENSE)
