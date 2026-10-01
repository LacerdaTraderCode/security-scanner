import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Token encryption (GitHub OAuth access_token, manually pasted Personal
 * Access Tokens) at rest. Credentials are never stored in plaintext in the
 * database — see User.githubTokenEnc in the Prisma schema.
 *
 * Requires ENCRYPTION_SECRET in the environment (32+ characters, generated
 * once and kept stable — rotating it invalidates every token already stored).
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ENCRYPTION_SECRET is missing or too short — set a random 32+ character string in .env");
  }
  return scryptSync(secret, "security-scanner-salt", 32);
}

export async function encryptToken(plainText: string): Promise<string> {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv.authTag.ciphertext, all base64-encoded
  return [iv, authTag, encrypted].map((b) => b.toString("base64")).join(".");
}

export async function decryptToken(encoded: string): Promise<string> {
  const [ivB64, authTagB64, cipherB64] = encoded.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const cipherText = Buffer.from(cipherB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString("utf-8");
}
