# Rsync

Store backups on a remote server via rsync over SSH. Ideal for efficient incremental transfers and Unix/Linux servers.

## Prerequisites

- `rsync` must be installed on **both** the DBackup server and the remote target
- SSH access to the remote server

::: warning Docker Users
The default DBackup Docker image includes rsync. If you're running DBackup outside Docker, ensure rsync is installed: `which rsync`
:::

## Configuration

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **Name** | Friendly name for this destination | — | ✅ |
| **Host** | Hostname or IP of the remote server | — | ✅ |
| **Port** | SSH port | `22` | ❌ |
| **Username** | SSH username | — | ✅ |
| **Auth Type** | Authentication method | `password` | ❌ |
| **Password** | User password (when Auth Type = `password`) | — | ❌ |
| **Private Key** | PEM-encoded private key (when Auth Type = `privateKey`) | — | ❌ |
| **Passphrase** | Passphrase for encrypted private keys | — | ❌ |
| **Path Prefix** | Remote directory for backups | — | ✅ |
| **Options** | Additional rsync flags (e.g. `--bwlimit=1000`) | — | ❌ |

### Authentication Methods

| Auth Type | Description |
| :--- | :--- |
| `password` | Username + password via sshpass (default) |
| `privateKey` | SSH private key (paste PEM content directly) |
| `agent` | Use the host's SSH agent (keys loaded via `ssh-add`) |

## Setup Guide

1. Ensure the target server has rsync and SSH installed
2. Create a dedicated user with write access to the backup directory:
   ```bash
   sudo useradd -m dbackup
   sudo mkdir -p /backups/dbackup
   sudo chown dbackup: /backups/dbackup
   ```
3. Go to **Destinations** → **Add Destination** → **Rsync**
4. Enter Host, Username, and select your Auth Type
5. Enter credentials (password or private key)
6. Set **Path Prefix** to the remote directory (e.g. `/backups/dbackup`)
7. (Optional) Add custom **Options** for bandwidth limiting or other flags
8. Click **Test** to verify the connection

## How It Works

- DBackup invokes `rsync -az` over SSH to transfer backup files
- All transfers are encrypted in transit via SSH
- Custom options are appended to the rsync command
- All credentials (passwords, private keys) are stored AES-256-GCM encrypted in the database

## Troubleshooting

### rsync: command not found

```
rsync: command not found
```

**Solution:** Install rsync on both servers. On Debian/Ubuntu: `apt install rsync`. On the remote server, rsync must be in the default PATH.

### Connection Refused

```
ssh: connect to host ... port 22: Connection refused
```

**Solution:** Verify the host and port. Ensure SSH is running and the firewall allows the connection.

### Permission Denied

```
rsync: mkstemp failed: Permission denied (13)
```

**Solution:** Ensure the SSH user has write access to the Path Prefix directory on the remote server.

### Bandwidth Limiting

To limit transfer speed, add `--bwlimit=1000` (KB/s) in the **Options** field. Useful for avoiding bandwidth saturation on shared connections.

## Next Steps

- [Enable Encryption](/user-guide/security/encryption)
- [Configure Retention](/user-guide/jobs/retention)
- [Storage Explorer](/user-guide/features/storage-explorer)
