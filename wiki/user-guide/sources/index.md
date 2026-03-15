# Database Sources

DBackup supports a wide variety of database engines.

## Supported Databases

| Database | Supported Versions | Backup Method |
| :--- | :--- | :--- |
| [MySQL](/user-guide/sources/mysql) | 5.7, 8.x, 9.x | `mysqldump` |
| [MariaDB](/user-guide/sources/mysql) | 10.x, 11.x | `mariadb-dump` |
| [PostgreSQL](/user-guide/sources/postgresql) | 12 – 18 | `pg_dump` |
| [MongoDB](/user-guide/sources/mongodb) | 4.x – 8.x | `mongodump` |
| [Redis](/user-guide/sources/redis) | 6.x, 7.x, 8.x | `redis-cli --rdb` |
| [SQLite](/user-guide/sources/sqlite) | 3.x | `.dump` command |
| [MSSQL](/user-guide/sources/mssql) | 2017, 2019, 2022 | `BACKUP DATABASE` |

## Adding a Source

1. Navigate to **Sources** → **Add Source**
2. Select the database type
3. Fill in connection details (host, port, credentials)
4. Click **Test Connection** to verify
5. Click **Fetch Databases** to list available databases
6. Select which databases to backup → **Save**

## Connection from Docker

When DBackup runs in Docker and your database is on the host:

| Platform | Host Address |
| :--- | :--- |
| Linux / macOS / Windows | `host.docker.internal` |

For Docker Compose networks, use the service name as hostname.
