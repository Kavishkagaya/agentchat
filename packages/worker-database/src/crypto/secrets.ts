import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "SECRETS_ENCRYPTION_KEY";
const VERSION_PREFIX = "v1:";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const HEX_REGEX = /^[0-9a-fA-F]+$/;

function parseKey(raw: string): Buffer {
  let key: Buffer;
  if (HEX_REGEX.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes`);
  }

  return key;
}

function loadKey(explicitKey?: string): Buffer {
  const raw = explicitKey ?? process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not configured`);
  }
  return parseKey(raw);
}

export function encryptSecretValue(value: string, encryptionKey?: string): string {
  const key = loadKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ciphertext]).toString("base64");
  return `${VERSION_PREFIX}${payload}`;
}

export function decryptSecretValue(ciphertext: string, encryptionKey?: string): string {
  if (!ciphertext.startsWith(VERSION_PREFIX)) {
    throw new Error("Unsupported secret ciphertext format");
  }

  const key = loadKey(encryptionKey);
  const payload = Buffer.from(
    ciphertext.slice(VERSION_PREFIX.length),
    "base64"
  );
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}
