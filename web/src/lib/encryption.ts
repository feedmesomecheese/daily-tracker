/**
 * Token encryption utilities for storing OAuth tokens securely
 * Uses AES-256-GCM for authenticated encryption
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  // If key is hex-encoded, decode it
  if (key.length === 64) {
    return Buffer.from(key, "hex");
  }

  // If key is base64-encoded
  if (key.length === 44) {
    return Buffer.from(key, "base64");
  }

  // Hash a string key to get 32 bytes
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt a string value
 * Returns base64-encoded string: iv (12 bytes) + ciphertext + auth tag (16 bytes)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Combine: iv + encrypted + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Decrypt a previously encrypted string
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  // Extract parts
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Generate a new random encryption key (for initial setup)
 * Returns a 64-character hex string
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
