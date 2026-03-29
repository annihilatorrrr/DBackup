# PostgreSQL

Configure PostgreSQL databases for backup.

## Supported Versions

| Versions |
| :--- |
| 12, 13, 14, 15, 16, 17, 18 |

DBackup uses `pg_dump` from PostgreSQL 18 client, which is backward compatible with older server versions.

## Connection Modes

| Mode | Description |
| :--- | :--- |
| **Direct** | DBackup connects via TCP and runs `pg_dump` locally |
| **SSH** | DBackup connects via SSH and runs `pg_dump` on the remote host |

## Configuration

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **Connection Mode** | Direct (TCP) or SSH | `Direct` | ✅ |
| **Host** | Database server hostname | `localhost` | ✅ |
| **Port** | PostgreSQL port | `5432` | ✅ |
| **User** | Database username | — | ✅ |
| **Password** | Database password | — | ❌ |
| **Database** | Database name(s) to backup | All databases | ❌ |
| **Additional Options** | Extra `pg_dump` flags | — | ❌ |

### SSH Mode Fields

These fields appear when **Connection Mode** is set to **SSH**:

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **SSH Host** | SSH server hostname or IP | — | ✅ |
| **SSH Port** | SSH server port | `22` | ❌ |
| **SSH Username** | SSH login username | — | ✅ |
| **SSH Auth Type** | Password, Private Key, or Agent | `Password` | ✅ |
| **SSH Password** | SSH password | — | ❌ |
| **SSH Private Key** | PEM-formatted private key | — | ❌ |
| **SSH Passphrase** | Passphrase for encrypted key | — | ❌ |

## Prerequisites

### Direct Mode

The DBackup server needs `psql`, `pg_dump`, and `pg_restore` CLI tools installed.

**Docker**: Already included in the DBackup image.

### SSH Mode

The **remote SSH server** must have the following tools installed:

```bash
# Required for backup
pg_dump

# Required for restore
pg_restore
psql          # Used for connection testing and database listing

# Required for database listing
psql
```

**Install on the remote host:**
```bash
# Ubuntu/Debian
apt-get install postgresql-client

# RHEL/CentOS/Fedora
dnf install postgresql

# Alpine
apk add postgresql-client

# macOS
brew install libpq
```

::: danger Important
In SSH mode, the database tools must be installed on the remote server. DBackup executes them remotely via SSH and streams the output back. The version on the remote server determines compatibility.
:::

## Setting Up a Backup User

Create a dedicated user with minimal permissions:

```sql
-- Create backup user
CREATE USER dbackup WITH PASSWORD 'secure_password_here';

-- Grant connect permission
GRANT CONNECT ON DATABASE mydb TO dbackup;

-- Grant read access to all tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dbackup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO dbackup;

-- Grant access to future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO dbackup;
```

For backing up **all databases**, the user needs:

```sql
-- Superuser or these permissions:
ALTER USER dbackup WITH SUPERUSER;
-- Or grant pg_read_all_data role (PostgreSQL 14+)
GRANT pg_read_all_data TO dbackup;
```

## Backup Process

### Direct Mode

DBackup uses `pg_dump` with these default options:

- `--format=plain`: SQL text format
- `--no-owner`: Don't output ownership commands
- `--no-acl`: Don't output access privilege commands

### SSH Mode

In SSH mode, DBackup:

1. Connects to the remote server via SSH
2. Checks that `pg_dump` and `psql` are available on the remote host
3. Executes `pg_dump` remotely (custom format with compression: `-F c -Z 6`)
4. Streams the dump output back over the SSH connection
5. Applies additional compression/encryption locally
6. Uploads to the configured storage destination

The password is passed securely via the `PGPASSWORD` environment variable in the remote session.

::: tip Host in SSH Mode
The **Host** field refers to the database hostname **as seen from the SSH server**. If PostgreSQL runs on the same machine as the SSH server, use `127.0.0.1` or `localhost`.
:::

### Output Format

The backup creates a `.sql` file containing:
- `CREATE TABLE` statements
- `COPY` statements with data
- Index definitions
- Constraints and triggers
- Sequences

## Additional Options Examples

```bash
# Custom output format (compressed)
--format=custom

# Include large objects (BLOBs)
--blobs

# Exclude specific tables
--exclude-table=logs --exclude-table=sessions

# Only schema (no data)
--schema-only

# Only data (no schema)
--data-only

# Specific schemas
--schema=public --schema=app
```

## Multi-Database Backups

When backing up multiple databases, DBackup creates a **TAR archive** containing individual `pg_dump -Fc` (custom format) dumps:

```
backup.tar
├── manifest.json    # Metadata about contained databases
├── database1.dump   # PostgreSQL custom format (compressed)
├── database2.dump
└── ...
```

### Benefits

- **Custom Format**: Each database uses PostgreSQL's efficient custom format with built-in compression
- **Selective Restore**: Choose which databases to restore
- **Database Renaming**: Restore to different names
- **Parallel-Ready**: Individual dumps enable future parallel restore support

::: warning Breaking Change (v0.9.1)
Multi-DB backups created before v0.9.1 used `pg_dumpall` and cannot be restored with newer versions.
:::

## Connection Security

### SSL Connection

PostgreSQL connections can use SSL:

```bash
# Additional Options for SSL
sslmode=require
```

Or configure in `pg_hba.conf`:
```
hostssl all all 0.0.0.0/0 scram-sha-256
```

### pg_hba.conf Configuration

Ensure DBackup can connect:

```
# Allow backup user from Docker network
host    all    dbackup    172.17.0.0/16    scram-sha-256
```

## Docker Network Configuration

### Database on Host Machine

```yaml
environment:
  - DB_HOST=host.docker.internal
```

### Database in Same Docker Network

```yaml
services:
  dbackup:
    networks:
      - backend

  postgres:
    image: postgres:16
    networks:
      - backend

networks:
  backend:
```

## Multi-Database Backup

PostgreSQL supports backing up multiple databases in a single job:

1. In the source configuration, select multiple databases
2. Each database is dumped separately
3. All dumps are combined into a single backup archive

## Troubleshooting

### Connection Refused

```
could not connect to server: Connection refused
```

**Solutions**:
1. Check PostgreSQL is listening on correct interface:
   ```ini
   # postgresql.conf
   listen_addresses = '*'
   ```
2. Check `pg_hba.conf` allows connections from Docker
3. Verify firewall rules

### Permission Denied

```
permission denied for table users
```

**Solution**: Grant SELECT permission:
```sql
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dbackup;
```

### Large Object Permission

```
permission denied for large object
```

**Solution**: Grant large object access:
```sql
GRANT SELECT ON LARGE OBJECTS TO dbackup;
-- Or use superuser for backup
```

### SSH: Binary Not Found

```
Required binary not found on remote server. Tried: pg_dump
```

**Solution:** Install the PostgreSQL client package on the remote server:
```bash
# Ubuntu/Debian
apt-get install postgresql-client

# RHEL/CentOS
dnf install postgresql
```

### SSH: Connection Refused

**Solution:**
1. Verify SSH is running: `systemctl status sshd`
2. Check SSH port and firewall rules
3. Test manually: `ssh user@host`

## Restore

To restore a PostgreSQL backup:

1. Go to **Storage Explorer**
2. Find your backup file
3. Click **Restore**
4. Select target database
5. Optionally provide privileged credentials for `CREATE DATABASE`
6. Confirm and monitor progress

### Restore to New Database

The restore process can:
- Create a new database (requires `CREATE DATABASE` permission)
- Restore to an existing database
- Map database names (restore `prod` to `staging`)

## Next Steps

- [Create a Backup Job](/user-guide/jobs/)
- [Enable Encryption](/user-guide/security/encryption)
- [Configure Retention](/user-guide/jobs/retention)
