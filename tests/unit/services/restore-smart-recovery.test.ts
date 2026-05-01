import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDecryptionKey } from '@/services/restore/smart-recovery';
import * as encryptionService from '@/services/backup/encryption-service';

// --- Mocks ---

vi.mock('@/lib/crypto/stream', () => ({
    createDecryptionStream: vi.fn(),
}));

vi.mock('@/lib/crypto/compression', () => ({
    getDecompressionStream: vi.fn().mockReturnValue(null),
}));

vi.mock('@/services/backup/encryption-service', () => ({
    getProfileMasterKey: vi.fn(),
    getEncryptionProfiles: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        default: { ...actual, createReadStream: vi.fn() },
        createReadStream: vi.fn(),
    };
});

// --- Helpers ---

function makeEncryptionMeta(overrides = {}) {
    return {
        profileId: 'profile-abc',
        iv: Buffer.alloc(12).toString('hex'),
        authTag: Buffer.alloc(16).toString('hex'),
        ...overrides,
    };
}

const mockKey = Buffer.from('a'.repeat(64), 'hex');
const noop = vi.fn();

describe('resolveDecryptionKey', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the key directly when the profile exists', async () => {
        (encryptionService.getProfileMasterKey as ReturnType<typeof vi.fn>).mockResolvedValue(mockKey);

        const result = await resolveDecryptionKey(
            makeEncryptionMeta(),
            '/tmp/backup.sql',
            undefined,
            noop,
        );

        expect(result).toBe(mockKey);
        expect(encryptionService.getProfileMasterKey).toHaveBeenCalledWith('profile-abc');
        expect(encryptionService.getEncryptionProfiles).not.toHaveBeenCalled();
    });

    it('throws when profile is missing and no other profile matches', async () => {
        (encryptionService.getProfileMasterKey as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Profile not found'),
        );
        (encryptionService.getEncryptionProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        await expect(
            resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', undefined, noop),
        ).rejects.toThrow('missing, and no other profile could decrypt this file');
    });

    it('logs a warning when attempting smart recovery', async () => {
        (encryptionService.getProfileMasterKey as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Profile not found'),
        );
        (encryptionService.getEncryptionProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const log = vi.fn();

        await expect(
            resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', undefined, log),
        ).rejects.toThrow();

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('Smart Recovery'),
            'warning',
        );
    });

    it('attempts all available profiles before throwing', async () => {
        (encryptionService.getProfileMasterKey as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Profile not found'),
        );
        (encryptionService.getEncryptionProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'profile-1', name: 'Profile 1' },
            { id: 'profile-2', name: 'Profile 2' },
            { id: 'profile-3', name: 'Profile 3' },
        ]);

        await expect(
            resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', undefined, noop),
        ).rejects.toThrow();

        // Called once for original + once per candidate profile
        expect(encryptionService.getProfileMasterKey).toHaveBeenCalledTimes(4);
    });
});
