# FTP

Store backups on a remote FTP server. Supports plain FTP and explicit FTPS (FTP over TLS).

## Configuration

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **Name** | Friendly name for this destination | — | ✅ |
| **Host** | Hostname or IP of the FTP server | — | ✅ |
| **Port** | FTP port | `21` | ❌ |
| **Username** | FTP username | `anonymous` | ❌ |
| **Password** | FTP password | — | ❌ |
| **TLS** | Enable explicit FTPS (FTP over TLS) | `false` | ❌ |
| **Path Prefix** | Remote directory for backups | — | ❌ |

## Setup Guide

1. Ensure an FTP server is running on the target host
2. Create a dedicated user with write access to the backup directory
3. Go to **Destinations** → **Add Destination** → **FTP**
4. Enter Host, Username, and Password
5. Enable **TLS** if your server supports FTPS (recommended)
6. (Optional) Set a **Path Prefix** to specify the remote directory
7. Click **Test** to verify the connection

::: warning Security
Plain FTP transfers credentials and data unencrypted. **Always enable TLS** when possible, or consider [SFTP](/user-guide/destinations/sftp) as a more secure alternative.
:::

## How It Works

- When TLS is enabled, DBackup uses explicit FTPS (AUTH TLS) — the connection upgrades from plain to encrypted
- DBackup creates subdirectories per job within the Path Prefix automatically
- All credentials are stored AES-256-GCM encrypted in the database

## Troubleshooting

### Connection Refused

```
connect ECONNREFUSED
```

**Solution:** Verify the host and port. Ensure the FTP service is running and the firewall allows the FTP port and passive port range.

### Login Failed

```
530 Login authentication failed
```

**Solution:** Verify username and password. Check the FTP server logs for more detail.

### TLS Handshake Error

```
SSL routines / handshake failure
```

**Solution:** Ensure the server supports explicit FTPS (AUTH TLS). Implicit FTPS (port 990) is not supported — use explicit mode on port 21.

### Passive Mode Issues

```
ETIMEDOUT after PASV
```

**Solution:** Ensure the server's passive port range is open in the firewall. In Docker, the FTP data ports also need to be forwarded.

## Next Steps

- [Enable Encryption](/user-guide/security/encryption)
- [Configure Retention](/user-guide/jobs/retention)
- [Storage Explorer](/user-guide/features/storage-explorer)
