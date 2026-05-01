import { describe, it, expect } from 'vitest';
import {
    getBackupFileExtension,
    getBackupFormatDescription,
} from '@/lib/backup-extensions';

describe('getBackupFileExtension', () => {
    it('returns sql for mysql', () => {
        expect(getBackupFileExtension('mysql')).toBe('sql');
    });

    it('returns sql for mariadb', () => {
        expect(getBackupFileExtension('mariadb')).toBe('sql');
    });

    it('returns sql for postgres', () => {
        expect(getBackupFileExtension('postgres')).toBe('sql');
    });

    it('returns bak for mssql', () => {
        expect(getBackupFileExtension('mssql')).toBe('bak');
    });

    it('returns archive for mongodb', () => {
        expect(getBackupFileExtension('mongodb')).toBe('archive');
    });

    it('returns rdb for redis', () => {
        expect(getBackupFileExtension('redis')).toBe('rdb');
    });

    it('returns db for sqlite', () => {
        expect(getBackupFileExtension('sqlite')).toBe('db');
    });

    it('returns sql as default for unknown adapters', () => {
        expect(getBackupFileExtension('unknown-db')).toBe('sql');
    });

    it('is case-insensitive', () => {
        expect(getBackupFileExtension('MySQL')).toBe('sql');
        expect(getBackupFileExtension('MSSQL')).toBe('bak');
    });
});

describe('getBackupFormatDescription', () => {
    it('returns correct description for mysql', () => {
        expect(getBackupFormatDescription('mysql')).toBe('MySQL SQL Dump');
    });

    it('returns correct description for mariadb', () => {
        expect(getBackupFormatDescription('mariadb')).toBe('MariaDB SQL Dump');
    });

    it('returns correct description for postgres', () => {
        expect(getBackupFormatDescription('postgres')).toBe('PostgreSQL SQL Dump');
    });

    it('returns correct description for mssql', () => {
        expect(getBackupFormatDescription('mssql')).toBe('SQL Server Native Backup');
    });

    it('returns correct description for mongodb', () => {
        expect(getBackupFormatDescription('mongodb')).toBe('MongoDB Archive');
    });

    it('returns correct description for redis', () => {
        expect(getBackupFormatDescription('redis')).toBe('Redis RDB Snapshot');
    });

    it('returns correct description for sqlite', () => {
        expect(getBackupFormatDescription('sqlite')).toBe('SQLite Database Copy');
    });

    it('returns fallback description for unknown adapters', () => {
        expect(getBackupFormatDescription('unknown-db')).toBe('Database Backup');
    });

    it('is case-insensitive', () => {
        expect(getBackupFormatDescription('MySQL')).toBe('MySQL SQL Dump');
    });
});
