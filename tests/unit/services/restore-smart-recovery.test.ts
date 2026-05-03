import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDecryptionKey } from '@/services/restore/smart-recovery';
import * as encryptionService from '@/services/backup/encryption-service';
import * as cryptoStream from '@/lib/crypto/stream';
import * as compression from '@/lib/crypto/compression';
import { PassThrough } from 'stream';

// Hoisted so the same vi.fn() instance is used in both the mock factory and test assertions.
const mockCreateReadStream = vi.hoisted(() => vi.fn());

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
        default: { ...actual, createReadStream: mockCreateReadStream },
        createReadStream: mockCreateReadStream,
    };
});

// --- Helpers ---

function makeEncryptionMeta(overrides = {}) {
    return {
        enabled: true as const,
        algorithm: "aes-256-gcm" as const,
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

// --- checkKeyCandidate coverage ---
// These tests drive the private checkKeyCandidate function via resolveDecryptionKey's
// smart-recovery loop: original profile fails, one candidate profile is provided,
// and the candidate key is tested against the file.

describe('checkKeyCandidate (via resolveDecryptionKey)', () => {
    const candidateProfile = { id: 'cand-1', name: 'Candidate' };
    const candidateKey = Buffer.alloc(32, 0x42);

    function setupSmartRecovery() {
        (encryptionService.getProfileMasterKey as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('Profile not found'))  // original profile
            .mockResolvedValueOnce(candidateKey);                   // candidate profile
        (encryptionService.getEncryptionProfiles as ReturnType<typeof vi.fn>)
            .mockResolvedValue([candidateProfile]);
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves false when compressionMeta is set but getDecompressionStream returns null', async () => {
        setupSmartRecovery();
        vi.mocked(cryptoStream.createDecryptionStream).mockReturnValue(new PassThrough() as any);
        vi.mocked(compression.getDecompressionStream).mockReturnValue(null);
        mockCreateReadStream.mockReturnValue(new PassThrough());

        // Since decompressor is null, checkKeyCandidate resolves false for the candidate.
        // All candidates fail, so resolveDecryptionKey should throw.
        await expect(
            resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', 'GZIP', noop),
        ).rejects.toThrow('missing, and no other profile could decrypt this file');
    });

    it('resolves true via decompressor data event when candidate key matches', async () => {
        setupSmartRecovery();

        const decipher = new PassThrough();
        const decompressor = new PassThrough();

        vi.mocked(cryptoStream.createDecryptionStream).mockReturnValue(decipher as any);
        vi.mocked(compression.getDecompressionStream).mockReturnValue(decompressor as any);

        const input = new PassThrough();
        mockCreateReadStream.mockReturnValue(input);

        // Start the key resolution (async - sets up pipe and listeners)
        const promise = resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', 'GZIP', noop);

        // Simulate compressed data arriving at the decompressor
        setTimeout(() => decompressor.emit('data', Buffer.from('data')), 10);

        const result = await promise;
        expect(result).toBe(candidateKey);
    });

    it('resolves false via decompressor error event when candidate key is wrong', async () => {
        setupSmartRecovery();

        const decipher = new PassThrough();
        const decompressor = new PassThrough();

        vi.mocked(cryptoStream.createDecryptionStream).mockReturnValue(decipher as any);
        vi.mocked(compression.getDecompressionStream).mockReturnValue(decompressor as any);

        const input = new PassThrough();
        mockCreateReadStream.mockReturnValue(input);

        const promise = resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', 'GZIP', noop);

        // Simulate decryption producing garbled data (wrong key -> decompressor error)
        setTimeout(() => decompressor.emit('error', new Error('incorrect header check')), 10);

        await expect(promise).rejects.toThrow('missing, and no other profile could decrypt this file');
    });

    it('resolves true via input end event when no-compression stream ends cleanly', async () => {
        setupSmartRecovery();

        const decipher = new PassThrough();
        vi.mocked(cryptoStream.createDecryptionStream).mockReturnValue(decipher as any);
        vi.mocked(compression.getDecompressionStream).mockReturnValue(null);

        const input = new PassThrough();
        mockCreateReadStream.mockReturnValue(input);

        const promise = resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', undefined, noop);

        // End the stream before any data is emitted - isValid remains true
        setTimeout(() => input.push(null), 10);

        const result = await promise;
        expect(result).toBe(candidateKey);
    });

    it('resolves false via outer catch when createDecryptionStream throws', async () => {
        setupSmartRecovery();

        vi.mocked(cryptoStream.createDecryptionStream).mockImplementation(() => {
            throw new Error('GCM tag mismatch');
        });
        mockCreateReadStream.mockReturnValue(new PassThrough());

        // checkKeyCandidate resolves false, all candidates fail, resolveDecryptionKey throws
        await expect(
            resolveDecryptionKey(makeEncryptionMeta(), '/tmp/backup.sql', undefined, noop),
        ).rejects.toThrow('missing, and no other profile could decrypt this file');
    });
});
