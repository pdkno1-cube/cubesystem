import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Returns the 32-byte encryption key derived from the VAULT_ENCRYPTION_KEY env var.
 * The env var must be a 64-character hex string (32 bytes).
 * @throws {Error} if the key is missing or malformed
 */
function getEncryptionKey(): Buffer {
  const hex = process.env.VAULT_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'VAULT_ENCRYPTION_KEY environment variable is not set. ' +
        'Provide a 64-character hex string (32 bytes).',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'VAULT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).',
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @returns A colon-delimited string in the format `iv:authTag:ciphertext`
 *          where each segment is base64-encoded.
 */
export function encrypt(plaintext: string): {
  encryptedValue: string;
  iv: string;
  authTag: string;
} {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted value.
 *
 * @param encryptedValue - base64-encoded ciphertext
 * @param iv - base64-encoded initialization vector
 * @param authTag - base64-encoded authentication tag
 * @returns The original plaintext string
 */
export function decrypt(
  encryptedValue: string,
  iv: string,
  authTag: string,
): string {
  const key = getEncryptionKey();

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
