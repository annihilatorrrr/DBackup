import { createReadStream } from "fs";
import crypto from "crypto";
import { CompressionType } from "@/lib/crypto/compression";
import { getProfileMasterKey, getEncryptionProfiles } from "@/services/backup/encryption-service";
import { BackupMetadata } from "@/lib/core/interfaces";

type LogFn = (msg: string, level?: 'info' | 'warning' | 'error' | 'success' | 'debug') => void;

/**
 * Resolves the master key for a given encrypted backup, attempting Smart Recovery
 * (trying every available profile) when the originally-referenced profile is missing.
 *
 * Returns the matching key. Throws if no profile can decrypt the file.
 */
export async function resolveDecryptionKey(
    encryptionMeta: NonNullable<BackupMetadata['encryption']>,
    tempFile: string,
    compressionMeta: CompressionType | undefined,
    log: LogFn,
): Promise<Buffer> {
    try {
        return await getProfileMasterKey(encryptionMeta.profileId);
    } catch (_keyError) {
        log(`Profile ${encryptionMeta.profileId} not found. Attempting Smart Recovery...`, 'warning');

        const allProfiles = await getEncryptionProfiles();
        log(`Smart Recovery: Found ${allProfiles.length} candidate profile(s).`, 'info');

        for (const profile of allProfiles) {
            log(`Smart Recovery: Testing profile '${profile.name}' (${profile.id})...`, 'info');
            try {
                const candidateKey = await getProfileMasterKey(profile.id);
                const isMatch = await checkKeyCandidate(candidateKey, encryptionMeta, tempFile, compressionMeta);
                if (isMatch) {
                    log(`Smart Recovery Successful: Matched key from profile '${profile.name}'.`, 'success');
                    return candidateKey;
                }
            } catch (e) {
                log(`Smart Recovery: Profile '${profile.name}' threw error: ${e instanceof Error ? e.message : String(e)}`, 'warning');
            }
        }

        throw new Error(`Profile ${encryptionMeta.profileId} missing, and no other profile could decrypt this file.`);
    }
}

/**
 * Heuristic check whether a candidate key successfully decrypts the first KB of the file.
 *
 * Strategy: Read the first 1 KB of the encrypted file, then call `crypto.Decipher.update()`
 * directly (NOT `final()`). This avoids AES-256-GCM auth-tag verification, which covers the
 * full ciphertext and always fails on a partial slice. The decrypted bytes are then checked
 * with content heuristics:
 *
 * - GZIP: valid decryption produces 0x1f 0x8b magic bytes.
 * - BROTLI / no compression: valid decryption produces >70% printable ASCII.
 */
function checkKeyCandidate(
    candidateKey: Buffer,
    encryptionMeta: NonNullable<BackupMetadata['encryption']>,
    tempFile: string,
    compressionMeta: CompressionType | undefined,
): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const iv = Buffer.from(encryptionMeta.iv, 'hex');
            const authTag = Buffer.from(encryptionMeta.authTag, 'hex');
            const chunks: Buffer[] = [];
            const input = createReadStream(tempFile, { start: 0, end: 1023 });

            input.on('error', () => resolve(false));
            input.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            input.on('end', () => {
                try {
                    const encrypted = Buffer.concat(chunks);
                    if (encrypted.length === 0) { resolve(false); return; }

                    // Use crypto.Decipher.update() directly.
                    // We intentionally skip final() so that auth-tag verification is never
                    // triggered on this partial 1 KB slice (the tag covers the full file).
                    const decipher = crypto.createDecipheriv('aes-256-gcm', candidateKey, iv);
                    decipher.setAuthTag(authTag);
                    const decrypted = decipher.update(encrypted);

                    resolve(isValidDecryptedContent(decrypted, compressionMeta));
                } catch (_e) {
                    resolve(false);
                }
            });
        } catch (_e) {
            resolve(false);
        }
    });
}

/**
 * Checks whether decrypted bytes look like valid backup content.
 * - GZIP: first two bytes must be the GZIP magic number (0x1f 0x8b).
 * - TAR: POSIX/GNU tar stores "ustar" at offset 257. Covers uncompressed TAR archives.
 * - BROTLI or no compression: >70% of bytes must be printable ASCII (plain SQL dumps).
 */
function isValidDecryptedContent(chunk: Buffer, compressionMeta: CompressionType | undefined): boolean {
    if (compressionMeta === 'GZIP') {
        return chunk.length >= 2 && chunk[0] === 0x1f && chunk[1] === 0x8b;
    }
    // TAR magic: POSIX/GNU tar writes "ustar" at header offset 257.
    // This catches uncompressed .tar.enc backups (multi-db format).
    if (chunk.length >= 262 && chunk.subarray(257, 262).toString('ascii') === 'ustar') {
        return true;
    }
    // For BROTLI or plain SQL dumps, check for printable ASCII ratio.
    const printable = chunk.filter(b => b >= 0x20 && b <= 0x7e).length;
    return printable / chunk.length > 0.7;
}
