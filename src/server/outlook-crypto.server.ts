import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const raw = process.env["OUTLOOK_TOKEN_ENC_KEY"];
  if (!raw) throw new Error("OUTLOOK_TOKEN_ENC_KEY is not set");
  return Buffer.from(raw, "base64");
}

export function encryptRefreshToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptRefreshToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString("utf8");
}

export function signState(payload: string): string {
  const secret = process.env["OUTLOOK_STATE_SECRET"];
  if (!secret) throw new Error("OUTLOOK_STATE_SECRET is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

export function verifyState(signed: string): string | null {
  try {
    const buf = Buffer.from(signed, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
