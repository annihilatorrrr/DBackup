# MySQL / MariaDB

Configure MySQL or MariaDB databases for backup using `mysqldump` / `mariadb-dump`.

## Supported Versions

| Engine | Versions |
| :--- | :--- |
| **MySQL** | 5.7, 8.0, 8.4, 9.0 |
| **MariaDB** | 10.x, 11.x |

## Configuration

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **Host** | Database server hostname | `localhost` | ✅ |
| **Port** | MySQL port | `3306` | ✅ |
| **User** | Database username | — | ✅ |
| **Password** | Database password | — | ❌ |
| **Database** | Database name(s) to backup | All databases | ❌ |
| **Additional Options** | Extra `mysqldump` flags | — | ❌ |
| **Disable SSL** | Disable SSL for self-signed certificates | `false` | ❌ |

## Setup Guide

### 1. Create a Backup User

```sql
CREATE USER 'dbackup'@'%' IDENTIFIED BY 'secure_password_here';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON *.* TO 'dbackup'@'%';
FLUSH PRIVILEGES;

-- For restore operations (optional):
GRANT CREATE, DROP, ALTER, INSERT, DELETE, UPDATE ON *.* TO 'dbackup'@'%';
```

::: tip Minimal Permissions
For backup-only operations, `SELECT`, `SHOW VIEW`, `TRIGGER`, and `LOCK TABLES` are sufficient.
:::

### 2. Configure in DBackup

1. Go to **Sources** → **Add Source**
2. Select **MySQL** or **MariaDB**
3. Enter connection details
4. Click **Test Connection**
5. Click **Fetch Databases** and select databases
6. Save

### 3. Docker Network

<details>
<summary>Database on host machine</summary>

```yaml
environment:
  - DB_HOST=host.docker.internal
```

</details>

<details>
<summary>Database in same Docker network</summary>

```yaml
services:
  dbackup:
    networks: [backend]
  mysql:
    image: mysql:8
    networks: [backend]
networks:
  backend:
```

Use `mysql` as the hostname in DBackup.

</details>

## How It Works

DBackup uses `mysqldump` (or `mariadb-dump` for MariaDB) with these default flags:

- `--single-transaction` — Consistent backup without locking (InnoDB)
- `--routines` — Includes stored procedures and functions
- `--triggers` — Includes triggers
- `--events` — Includes scheduled events

Output: `.sql` file with `CREATE` and `INSERT` statements.

### Multi-Database Backups

When backing up multiple databases, DBackup creates a **TAR archive**:

```
backup.tar
├── manifest.json
├── database1.sql
├── database2.sql
└── ...
```

From a multi-DB backup you can restore individual databases and rename them during restore.

::: warning Breaking Change (v0.9.1)
Multi-DB backups before v0.9.1 use a different format and cannot be restored with newer versions.
:::

### Additional Options Examples

<details>
<summary>Common mysqldump flags</summary>

```bash
# Skip specific tables
--ignore-table=mydb.logs --ignore-table=mydb.sessions

# Extended insert for faster restore
--extended-insert

# Set maximum packet size
--max-allowed-packet=1G
```

</details>

## Troubleshooting

### Access Denied

```
ERROR 1045 (28000): Access denied for user 'backup'@'172.17.0.1'
```

**Solution:** Grant access from Docker network:
```sql
CREATE USER 'dbackup'@'172.17.%' IDENTIFIED BY 'password';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES ON *.* TO 'dbackup'@'172.17.%';
```

### Connection Timeout

**Solution:** Ensure MySQL listens on all interfaces:
```ini
# my.cnf
[mysqld]
bind-address = 0.0.0.0
```

### SSL Certificate Error

**Solution:** Enable **Disable SSL** in the source config, or pass custom SSL flags:
```bash
--ssl-mode=REQUIRED --ssl-ca=/path/to/ca.pem
```

## Next Steps

- [Create a Backup Job](/user-guide/jobs/)
- [Enable Encryption](/user-guide/security/encryption)
- [Configure Retention](/user-guide/jobs/retention)
