
export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface SessionCertPayload {
  group_id: string; // "chat" mapped to group_id
  session_public_key: string; 
  capabilities?: string[];
  exp: number;
  iat: number;
}

export interface RoutingTokenPayload {
  user_id: string;
  group_id: string;
  role: string;
  exp: number;
  iat: number;
}

// Check for global crypto availability
const cryptoAPI = globalThis.crypto;
if (!cryptoAPI) {
  throw new Error("Web Crypto API is not available.");
}

// --- Core Crypto ---

/**
 * Generates a new Ed25519 key pair.
 * Returns keys as base64-encoded strings (SPKI for public, PKCS#8 for private).
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await cryptoAPI.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  const pubBuf = await cryptoAPI.subtle.exportKey("spki", keyPair.publicKey);
  const privBuf = await cryptoAPI.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(pubBuf),
    privateKey: arrayBufferToBase64(privBuf),
  };
}

/**
 * Signs a string payload using a private key (PKCS#8 base64).
 */
export async function sign(privateKeyBase64: string, data: string): Promise<string> {
  const key = await importPrivateKey(privateKeyBase64);
  const buf = await cryptoAPI.subtle.sign("Ed25519", key, new TextEncoder().encode(data));
  return arrayBufferToBase64(buf);
}

/**
 * Verifies a signature using a public key (SPKI base64).
 */
export async function verify(publicKeyBase64: string, data: string, signatureBase64: string): Promise<boolean> {
  const key = await importPublicKey(publicKeyBase64);
  const sigBuf = base64ToArrayBuffer(signatureBase64);
  return await cryptoAPI.subtle.verify("Ed25519", key, sigBuf, new TextEncoder().encode(data));
}

// --- Session Certificate (Group Controller -> Agents Worker) ---

export async function createSessionCert(
  orchestratorPrivateKey: string,
  groupId: string,
  sessionPublicKey: string,
  expiresInSeconds = 3600
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionCertPayload = {
    group_id: groupId,
    session_public_key: sessionPublicKey,
    exp: now + expiresInSeconds,
    iat: now,
  };

  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = await sign(orchestratorPrivateKey, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionCert(
  orchestratorPublicKey: string,
  cert: string
): Promise<SessionCertPayload> {
  const [encodedPayload, signature] = cert.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid certificate format");
  }

  const isValid = await verify(orchestratorPublicKey, encodedPayload, signature);
  if (!isValid) {
    throw new Error("Invalid certificate signature");
  }

  const payload = JSON.parse(atob(encodedPayload)) as SessionCertPayload;
  const now = Math.floor(Date.now() / 1000);
  
  if (payload.exp < now) {
    throw new Error("Certificate expired");
  }

  return payload;
}

// --- Routing Token (User -> Orchestrator) ---

export async function createRoutingToken(
  orchestratorPrivateKey: string,
  userId: string,
  groupId: string,
  role: string,
  expiresInSeconds = 300 // Short lived (5 mins)
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: RoutingTokenPayload = {
    user_id: userId,
    group_id: groupId,
    role,
    exp: now + expiresInSeconds,
    iat: now,
  };

  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = await sign(orchestratorPrivateKey, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyRoutingToken(
  orchestratorPublicKey: string,
  token: string
): Promise<RoutingTokenPayload> {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid token format");
  }

  const isValid = await verify(orchestratorPublicKey, encodedPayload, signature);
  if (!isValid) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(atob(encodedPayload)) as RoutingTokenPayload;
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp < now) {
    throw new Error("Token expired");
  }

  return payload;
}

// --- Internal Helpers ---

async function importPrivateKey(base64: string): Promise<CryptoKey> {
  return await cryptoAPI.subtle.importKey(
    "pkcs8",
    base64ToArrayBuffer(base64),
    { name: "Ed25519" },
    false,
    ["sign"]
  );
}

async function importPublicKey(base64: string): Promise<CryptoKey> {
  return await cryptoAPI.subtle.importKey(
    "spki",
    base64ToArrayBuffer(base64),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  // Pad if necessary
  const pad = standardBase64.length % 4;
  const paddedBase64 = pad ? standardBase64 + '='.repeat(4 - pad) : standardBase64;
  
  const binaryString = atob(paddedBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
