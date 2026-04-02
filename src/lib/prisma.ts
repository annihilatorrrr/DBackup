import { PrismaClient } from '@prisma/client'

// Add BigInt serialization support for JSON
// This prevents "TypeError: Do not know how to serialize a BigInt" when passing data to client components
// @ts-expect-error - BigInt toJSON is not in standard types
BigInt.prototype.toJSON = function () {
  return this.toString()
}

const prismaClientSingleton = () => {
  const baseClient = new PrismaClient()

  // ── Transparent SSO Secret Decryption ────────────────────────
  // SSO clientId/clientSecret and oidcConfig are stored encrypted in the DB.
  // This extension transparently decrypts them on read so that better-auth
  // and all other consumers get plaintext credentials without explicit calls.
  const client = baseClient.$extends({
    query: {
      ssoProvider: {
        async $allOperations({ args, query, operation }) {
          const result = await query(args);

          const readActions = ['findUnique', 'findFirst', 'findMany'];
          if (!readActions.includes(operation) || !result) return result;

          // Lazy import to avoid circular dependency (crypto.ts does not import prisma.ts)
          const { decrypt } = await import('./crypto');

          const decryptSsoRecord = (record: any) => {
            if (!record) return record;
            try {
              if (record.clientId) record.clientId = decrypt(record.clientId);
            } catch { /* Not encrypted or wrong key - return as-is */ }
            try {
              if (record.clientSecret) record.clientSecret = decrypt(record.clientSecret);
            } catch { /* Not encrypted or wrong key - return as-is */ }
            try {
              if (record.oidcConfig) {
                const parsed = JSON.parse(record.oidcConfig);
                let changed = false;
                if (parsed.clientId) { try { parsed.clientId = decrypt(parsed.clientId); changed = true; } catch {} }
                if (parsed.clientSecret) { try { parsed.clientSecret = decrypt(parsed.clientSecret); changed = true; } catch {} }
                if (changed) record.oidcConfig = JSON.stringify(parsed);
              }
            } catch { /* Parse error or not encrypted - return as-is */ }
            return record;
          };

          if (Array.isArray(result)) {
            return result.map(decryptSsoRecord);
          }
          return decryptSsoRecord(result);
        },
      },
    },
  });

  return client;
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
