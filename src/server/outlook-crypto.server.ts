import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Derive a fixed 32-byte AES key from an arbitrary-length secret string.
function derive(raw: string): Buffer {
  return createHash("sha256").update(raw, "utf8").digest();
}

function key(): Buffer {
  const raw = process.env["OUTLOOK_TOKEN_ENC_KEY"];
  if (!raw) throw new Error("OUTLOOK_TOKEN_ENC_KEY is not set");
  return derive(raw);
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

function stateSecret(): string {
  const secret = process.env["OUTLOOK_STATE_SECRET"];
  if (!secret) throw new Error("OUTLOOK_STATE_SECRET is not set");
  return secret;
}

function mac(payloadB64: string): string {
  return createHmac("sha256", stateSecret()).update(payloadB64).digest("base64url");
}

export function signState(payload: string): string {
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  return `${payloadB64}.${mac(payloadB64)}`;
}

export function verifyState(signed: string): string | null {
  try {
    const [payloadB64, sig] = signed.split(".");
    if (!payloadB64 || !sig) return null;
    const expected = Buffer.from(mac(payloadB64));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

