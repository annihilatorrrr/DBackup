import { createReadStream } from "fs";
import { Transform } from "stream";
import { createDecryptionStream } from "@/lib/crypto-stream";
import { getDecompressionStream, CompressionType } from "@/lib/compression";
import { getProfileMasterKey, getEncryptionProfiles } from "@/services/encryption-service";
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

        for (const profile of allProfiles) {
            try {
                const candidateKey = await getProfileMasterKey(profile.id);
                const isMatch = await checkKeyCandidate(candidateKey, encryptionMeta, tempFile, compressionMeta);
                if (isMatch) {
                    log(`Smart Recovery Successful: Matched key from profile '${profile.name}'.`, 'success');
                    return candidateKey;
                }
            } catch (_e) { /* ignore */ }
        }

        throw new Error(`Profile ${encryptionMeta.profileId} missing, and no other profile could decrypt this file.`);
    }
}

/**
 * Heuristic check whether a candidate key successfully decrypts the first KB of the file.
 * - With compression: a successful decompress 'data' event proves the key is correct.
 * - Without compression: a high ratio of printable bytes indicates valid SQL/text dump.
 */
function checkKeyCandidate(
    candidateKey: Buffer,
    encryptionMeta: NonNullable<BackupMetadata['encryption']>,
    tempFile: string,
    compressionMeta: CompressionType | undefined,
): Promise<boolean> {
    return new Promise((resolve) => {
        const iv = Buffer.from(encryptionMeta.iv, 'hex');
        const authTag = Buffer.from(encryptionMeta.authTag, 'hex');

        try {
            const decipher = createDecryptionStream(candidateKey, iv, authTag);
            const input = createReadStream(tempFile, { start: 0, end: 1024 }); // Check first 1KB

            let isValid = true;

            if (compressionMeta && compressionMeta !== 'NONE') {
                // With compression: Decrypt -> Decompress -> Error?
                const decompressor = getDecompressionStream(compressionMeta);
                if (!decompressor) return resolve(false);

                decipher.on('error', () => { isValid = false; resolve(false); });
                decompressor.on('error', () => { isValid = false; resolve(false); });

                // If we get 'data' from decompressor, it means header was valid!
                decompressor.on('data', () => {
                    resolve(true);
                    input.destroy(); // Stop reading
                });

                input.pipe(decipher).pipe(decompressor);
            } else {
                // No compression: Decrypt -> Check for text/magic bytes
                decipher.on('error', () => { isValid = false; resolve(false); });
                decipher.on('data', (chunk: Buffer) => {
                    const printable = chunk.toString('utf8').replace(/[^\x20-\x7E]/g, '').length;
                    const ratio = printable / chunk.length;
                    if (ratio > 0.7) { // 70% printable
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                    input.destroy();
                });
                input.pipe(decipher);
            }

            input.on('end', () => {
                if (isValid) resolve(true);
            });
        } catch (_e) {
            resolve(false);
        }
    });
}

// Re-export Transform for places that import it alongside this module
export { Transform };
