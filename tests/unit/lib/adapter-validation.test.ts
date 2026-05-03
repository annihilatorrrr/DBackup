import { describe, it, expect } from 'vitest';
import {
    MySQLSchema,
    MariaDBSchema,
    PostgresSchema,
    MongoDBSchema,
    MSSQLSchema,
    SQLiteSchema,
} from '@/lib/adapters/definitions/database';
import {
    LocalStorageSchema,
    S3GenericSchema,
    S3AWSSchema,
    SFTPSchema,
} from '@/lib/adapters/definitions/storage';

// ── MySQL / MariaDB ──────────────────────────────────────────────────────────

describe('MySQLSchema', () => {
    it('accepts valid minimal config', () => {
        const result = MySQLSchema.safeParse({ user: 'root' });
        expect(result.success).toBe(true);
    });

    it('rejects when user is empty', () => {
        const result = MySQLSchema.safeParse({ user: '' });
        expect(result.success).toBe(false);
    });

    it('coerces port from string to number', () => {
        const result = MySQLSchema.safeParse({ user: 'root', port: '3306' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.port).toBe(3306);
    });

    it('applies default port 3306', () => {
        const result = MySQLSchema.safeParse({ user: 'root' });
        if (result.success) expect(result.data.port).toBe(3306);
    });

    it('applies default host localhost', () => {
        const result = MySQLSchema.safeParse({ user: 'root' });
        if (result.success) expect(result.data.host).toBe('localhost');
    });
});

describe('MariaDBSchema', () => {
    it('accepts valid minimal config', () => {
        const result = MariaDBSchema.safeParse({ user: 'root' });
        expect(result.success).toBe(true);
    });

    it('rejects missing user', () => {
        const result = MariaDBSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('defaults to port 3306', () => {
        const result = MariaDBSchema.safeParse({ user: 'admin' });
        if (result.success) expect(result.data.port).toBe(3306);
    });
});

// ── PostgreSQL ───────────────────────────────────────────────────────────────

describe('PostgresSchema', () => {
    it('accepts valid minimal config', () => {
        const result = PostgresSchema.safeParse({ user: 'postgres' });
        expect(result.success).toBe(true);
    });

    it('rejects when user is empty string', () => {
        const result = PostgresSchema.safeParse({ user: '' });
        expect(result.success).toBe(false);
    });

    it('defaults to port 5432', () => {
        const result = PostgresSchema.safeParse({ user: 'postgres' });
        if (result.success) expect(result.data.port).toBe(5432);
    });
});

// ── MongoDB ──────────────────────────────────────────────────────────────────

describe('MongoDBSchema', () => {
    it('accepts config with only defaults', () => {
        const result = MongoDBSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('accepts a URI override', () => {
        const result = MongoDBSchema.safeParse({ uri: 'mongodb://localhost:27017/mydb' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.uri).toBe('mongodb://localhost:27017/mydb');
    });

    it('defaults to port 27017', () => {
        const result = MongoDBSchema.safeParse({});
        if (result.success) expect(result.data.port).toBe(27017);
    });
});

// ── MSSQL ────────────────────────────────────────────────────────────────────

describe('MSSQLSchema', () => {
    it('accepts valid minimal config', () => {
        const result = MSSQLSchema.safeParse({ user: 'sa' });
        expect(result.success).toBe(true);
    });

    it('rejects when user is empty', () => {
        const result = MSSQLSchema.safeParse({ user: '' });
        expect(result.success).toBe(false);
    });

    it('defaults to port 1433', () => {
        const result = MSSQLSchema.safeParse({ user: 'sa' });
        if (result.success) expect(result.data.port).toBe(1433);
    });

    it('defaults encrypt to true', () => {
        const result = MSSQLSchema.safeParse({ user: 'sa' });
        if (result.success) expect(result.data.encrypt).toBe(true);
    });

    it('rejects backupPath containing a null byte', () => {
        const result = MSSQLSchema.safeParse({ user: 'sa', backupPath: '/path/to\x00/etc' });
        expect(result.success).toBe(false);
    });
});

// ── SQLite ───────────────────────────────────────────────────────────────────

describe('SQLiteSchema', () => {
    it('accepts local mode with a valid path', () => {
        const result = SQLiteSchema.safeParse({ mode: 'local', path: '/data/db.sqlite' });
        expect(result.success).toBe(true);
    });

    it('rejects unknown mode', () => {
        const result = SQLiteSchema.safeParse({ mode: 'ftp', path: '/db.sqlite' });
        expect(result.success).toBe(false);
    });

    it('rejects path containing a null byte', () => {
        const result = SQLiteSchema.safeParse({ mode: 'local', path: '/data/db\x00.sqlite' });
        expect(result.success).toBe(false);
    });
});

// ── Storage Schemas ──────────────────────────────────────────────────────────

describe('LocalStorageSchema', () => {
    it('accepts valid base path', () => {
        const result = LocalStorageSchema.safeParse({ basePath: '/backups' });
        expect(result.success).toBe(true);
    });

    it('rejects empty base path', () => {
        const result = LocalStorageSchema.safeParse({ basePath: '' });
        expect(result.success).toBe(false);
    });

    it('uses /backups as default', () => {
        const result = LocalStorageSchema.safeParse({});
        if (result.success) expect(result.data.basePath).toBe('/backups');
    });
});

describe('S3GenericSchema', () => {
    const validS3 = {
        endpoint: 'https://s3.example.com',
        bucket: 'my-bucket',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
    };

    it('accepts valid config', () => {
        const result = S3GenericSchema.safeParse(validS3);
        expect(result.success).toBe(true);
    });

    it('rejects missing endpoint', () => {
        const result = S3GenericSchema.safeParse({ ...validS3, endpoint: '' });
        expect(result.success).toBe(false);
    });

    it('rejects missing bucket', () => {
        const result = S3GenericSchema.safeParse({ ...validS3, bucket: '' });
        expect(result.success).toBe(false);
    });

    it('rejects missing accessKeyId', () => {
        const result = S3GenericSchema.safeParse({ ...validS3, accessKeyId: '' });
        expect(result.success).toBe(false);
    });

    it('defaults to forcePathStyle false', () => {
        const result = S3GenericSchema.safeParse(validS3);
        if (result.success) expect(result.data.forcePathStyle).toBe(false);
    });
});

describe('S3AWSSchema', () => {
    const validAWS = {
        region: 'us-east-1',
        bucket: 'my-bucket',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
    };

    it('accepts valid config', () => {
        const result = S3AWSSchema.safeParse(validAWS);
        expect(result.success).toBe(true);
    });

    it('rejects missing region', () => {
        const result = S3AWSSchema.safeParse({ ...validAWS, region: '' });
        expect(result.success).toBe(false);
    });

    it('defaults storageClass to STANDARD', () => {
        const result = S3AWSSchema.safeParse(validAWS);
        if (result.success) expect(result.data.storageClass).toBe('STANDARD');
    });
});

describe('SFTPSchema', () => {
    it('requires host', () => {
        const result = SFTPSchema.safeParse({ host: '', username: 'user' });
        expect(result.success).toBe(false);
    });

    it('requires username', () => {
        const result = SFTPSchema.safeParse({ host: 'sftp.example.com', username: '' });
        expect(result.success).toBe(false);
    });

    it('accepts valid config', () => {
        const result = SFTPSchema.safeParse({ host: 'sftp.example.com', username: 'admin', basePath: '/backups' });
        expect(result.success).toBe(true);
    });
});
