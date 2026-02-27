export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

export interface RoutingTokenPayload {
  exp: number;
  group_id: string;
  iat: number;
  role: string;
  user_id: string;
  jti: string;
}

export interface AppInfraTokenPayload {
  aud: "orchestrator";
  exp: number;
  iat: number;
  iss: "app";
  jti: string;
  method: string;
  org_id?: string;
  path: string;
  sub: string;
}

export interface AgentAccessTokenPayload {
  agent_id: string;
  exp: number;
  group_id: string;
  iat: number;
  jti: string;
  org_id: string;
  scope: "agent:invoke";
  sub: "group-controller";
}

// Check for global crypto availability
const cryptoAPI =
  (globalThis as any).crypto ||
  (typeof crypto !== "undefined" ? crypto : undefined);
if (!cryptoAPI) {
  throw new Error("Web Crypto API is not available.");
}

// --- Core Crypto ---

/**
 * Generates a new Ed25519 key pair.
 * Returns keys as base64-encoded strings (SPKI for public, PKCS#8 for private).
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = (await cryptoAPI.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;

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
export async function sign(
  privateKeyBase64: string,
  data: string
): Promise<string> {
  const key = await importPrivateKey(privateKeyBase64);
  const buf = await cryptoAPI.subtle.sign(
    "Ed25519",
    key,
    new TextEncoder().encode(data)
  );
  return arrayBufferToBase64(buf);
}

/**
 * Verifies a signature using a public key (SPKI base64).
 */
export async function verify(
  publicKeyBase64: string,
  data: string,
  signatureBase64: string
): Promise<boolean> {
  const key = await importPublicKey(publicKeyBase64);
  const sigBuf = base64ToArrayBuffer(signatureBase64);
  return await cryptoAPI.subtle.verify(
    "Ed25519",
    key,
    sigBuf,
    new TextEncoder().encode(data)
  );
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
    jti: crypto.randomUUID(),
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
  if (!(encodedPayload && signature)) {
    throw new Error("Invalid token format");
  }

  const isValid = await verify(
    orchestratorPublicKey,
    encodedPayload,
    signature
  );
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

// --- App -> Orchestrator Infra Token ---

export async function createAppInfraToken(
  appPrivateKey: string,
  claims: {
    method: string;
    path: string;
    org_id?: string;
    sub: string;
  },
  expiresInSeconds = 60
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AppInfraTokenPayload = {
    aud: "orchestrator",
    iss: "app",
    sub: claims.sub,
    method: claims.method.toUpperCase(),
    path: claims.path,
    org_id: claims.org_id,
    iat: now,
    exp: now + expiresInSeconds,
    jti: crypto.randomUUID(),
  };
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = await sign(appPrivateKey, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAppInfraToken(
  appPublicKey: string,
  token: string,
  expected: {
    method: string;
    path: string;
  }
): Promise<AppInfraTokenPayload> {
  const [encodedPayload, signature] = token.split(".");
  if (!(encodedPayload && signature)) {
    throw new Error("Invalid app token format");
  }

  const isValid = await verify(appPublicKey, encodedPayload, signature);
  if (!isValid) {
    throw new Error("Invalid app token signature");
  }

  const payload = JSON.parse(atob(encodedPayload)) as AppInfraTokenPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error("App token expired");
  }
  if (payload.aud !== "orchestrator" || payload.iss !== "app") {
    throw new Error("Invalid app token issuer/audience");
  }
  if (payload.method !== expected.method.toUpperCase()) {
    throw new Error("App token method mismatch");
  }
  if (payload.path !== expected.path) {
    throw new Error("App token path mismatch");
  }
  return payload;
}

// --- Group Controller -> Agents Worker Token ---

export async function createAgentAccessToken(
  gcPrivateKey: string,
  claims: {
    agent_id: string;
    group_id: string;
    org_id: string;
    scope?: "agent:invoke";
  },
  expiresInSeconds = 60
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AgentAccessTokenPayload = {
    sub: "group-controller",
    scope: claims.scope ?? "agent:invoke",
    agent_id: claims.agent_id,
    group_id: claims.group_id,
    org_id: claims.org_id,
    iat: now,
    exp: now + expiresInSeconds,
    jti: crypto.randomUUID(),
  };
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = await sign(gcPrivateKey, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAgentAccessToken(
  gcPublicKey: string,
  token: string,
  expected?: {
    group_id?: string;
    agent_id?: string;
  }
): Promise<AgentAccessTokenPayload> {
  const [encodedPayload, signature] = token.split(".");
  if (!(encodedPayload && signature)) {
    throw new Error("Invalid agent token format");
  }
  const isValid = await verify(gcPublicKey, encodedPayload, signature);
  if (!isValid) {
    throw new Error("Invalid agent token signature");
  }
  const payload = JSON.parse(atob(encodedPayload)) as AgentAccessTokenPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error("Agent token expired");
  }
  if (payload.sub !== "group-controller" || payload.scope !== "agent:invoke") {
    throw new Error("Invalid agent token scope");
  }
  if (expected?.group_id && expected.group_id !== payload.group_id) {
    throw new Error("Agent token group mismatch");
  }
  if (expected?.agent_id && expected.agent_id !== payload.agent_id) {
    throw new Error("Agent token agent mismatch");
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
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const standardBase64 = base64.replace(/-/g, "+").replace(/_/g, "/");
  // Pad if necessary
  const pad = standardBase64.length % 4;
  const paddedBase64 = pad
    ? standardBase64 + "=".repeat(4 - pad)
    : standardBase64;

  const binaryString = atob(paddedBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
