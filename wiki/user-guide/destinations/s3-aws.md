# Amazon S3

Store backups in AWS S3 with support for storage classes, lifecycle policies, and multi-region durability.

## Configuration

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **Name** | Friendly name for this destination | — | ✅ |
| **Region** | AWS region (e.g. `us-east-1`, `eu-central-1`) | `us-east-1` | ✅ |
| **Bucket** | S3 bucket name | — | ✅ |
| **Access Key ID** | AWS access key | — | ✅ |
| **Secret Access Key** | AWS secret key | — | ✅ |
| **Path Prefix** | Folder path within the bucket | — | ❌ |
| **Storage Class** | S3 storage class for uploaded objects | `STANDARD` | ❌ |

### Storage Classes

| Class | Use Case |
| :--- | :--- |
| `STANDARD` | Frequent access (default) |
| `STANDARD_IA` | Infrequent access, lower cost |
| `GLACIER` | Long-term archive (retrieval in minutes to hours) |
| `DEEP_ARCHIVE` | Cheapest storage, retrieval in 12+ hours |

## Setup Guide

1. **Create an S3 bucket** in your preferred region via the [AWS Console](https://s3.console.aws.amazon.com/)
2. **Create an IAM user** with programmatic access:
   - Go to [IAM Console](https://console.aws.amazon.com/iam/) → **Users** → **Create user**
   - Attach the `AmazonS3FullAccess` policy (or a scoped policy — see below)
   - Create an **Access Key** (use case: "Application outside AWS") and copy both keys
3. Go to **Destinations** → **Add Destination** → **Amazon S3**
4. Enter your Region, Bucket, Access Key ID, and Secret Access Key
5. (Optional) Set a **Path Prefix** to organize backups in a subfolder
6. (Optional) Select a **Storage Class** for cost optimization
7. Click **Test** to verify the connection

<details>
<summary>Minimal IAM Policy (recommended)</summary>

Instead of `AmazonS3FullAccess`, scope permissions to a single bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

</details>

## How It Works

- Backups upload via the AWS SDK using multipart upload for large files
- All credentials are stored AES-256-GCM encrypted in the database
- Storage class is set per-object at upload time
- The Path Prefix creates a virtual folder structure within your bucket

## Troubleshooting

### AccessDenied

```
Access Denied (403)
```

**Solution:** Verify the IAM user has `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` permissions on the correct bucket ARN.

### NoSuchBucket

```
The specified bucket does not exist
```

**Solution:** Check bucket name spelling. S3 bucket names are globally unique and case-sensitive.

### InvalidAccessKeyId

```
The AWS Access Key Id you provided does not exist in our records
```

**Solution:** Regenerate the access key in IAM Console. Ensure there are no leading/trailing spaces when pasting.

### Slow Uploads / Timeout

**Solution:** Choose a region geographically close to your DBackup server. For large backups, ensure your server has sufficient upload bandwidth.

## Next Steps

- [Enable Encryption](/user-guide/security/encryption)
- [Configure Retention](/user-guide/jobs/retention)
- [Storage Explorer](/user-guide/features/storage-explorer)
