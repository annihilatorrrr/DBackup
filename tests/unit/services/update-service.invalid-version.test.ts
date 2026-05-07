/**
 * Coverage test for the invalid-version defensive guard in update-service.ts (lines 80-81).
 * Mocks package.json to return an invalid semver string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '@/lib/testing/prisma-mock';

vi.mock('@/lib/logging/logger', () => ({
    logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) },
}));
vi.mock('@/lib/logging/errors', () => ({
    wrapError: (e: unknown) => e,
}));

// Mock package.json to have an invalid version string
vi.mock('../../../package.json', () => ({
    default: { version: 'not-a-valid-semver' },
    version: 'not-a-valid-semver',
}));

const globalFetch = vi.fn();
vi.stubGlobal('fetch', globalFetch);

import { updateService } from '@/services/system/update-service';

describe('updateService.checkForUpdates() - invalid package.json version', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.systemSetting.findUnique.mockResolvedValue(null);
    });

    it('returns no update when package.json version is not valid semver', async () => {
        globalFetch.mockResolvedValue({
            ok: true,
            json: async () => [{ name: 'v3.0.0' }],
        });

        const result = await updateService.checkForUpdates();

        // parseVersion('not-a-valid-semver') returns null → early return with no update
        expect(result.updateAvailable).toBe(false);
        expect(result.currentVersion).toBe('not-a-valid-semver');
    });
});
