# OAuth 2.0 "Login Once" Flow for MCP Servers

## Overview

This document describes the complete OAuth 2.0 Authorization Code + PKCE flow for MCP (Model Context Protocol) servers. Users log in once to an OAuth provider, and the system stores a `refresh_token` to automatically obtain fresh `access_token`s whenever needed.

## Design Philosophy

- **One-time login**: User authenticates once via browser OAuth flow
- **Secure token storage**: `refresh_token` + `client_secret` stored as AES-256-GCM encrypted JSON in database
- **Fresh tokens on demand**: Worker always exchanges `refresh_token` for new `access_token` (never persists `access_token` to DB)
- **PKCE protection**: Authorization Code Flow with PKCE to prevent authorization code interception
- **Encrypted cookie**: OAuth state stored in AES-256-GCM encrypted HttpOnly cookie (10-min TTL, deleted after use)
- **Form persistence**: User's form input persists at page level—closing dialog doesn't lose data, only submission clears it

## HTTP Request Flow (3 Requests, Different Contexts)

```
┌─────────────────────────────────────────────────────────────┐
│ REQUEST 1: User clicks "Add OAuth Server" → tRPC Mutation   │
│ Context: Next.js Server (Clerk-authenticated)               │
└─────────────────────────────────────────────────────────────┘
                         ↓
   tRPC: mcp.initiateOAuth({
     name, url, clientId, clientSecret,
     tokenUrl, authUrl, scopes, enabledTools
   })

   ACTIONS:
   1. Generate state = randomBytes(32).hex() [CSRF protection]
   2. Generate codeVerifier = randomBytes(32).base64url() [PKCE]
   3. Generate codeChallenge = SHA256(codeVerifier).base64url() [PKCE]
   4. Validate offline_access in scopes (auto-append if missing)
   5. Build authorizationUrl with:
      - response_type=code
      - client_id, redirect_uri, scopes, state
      - code_challenge, code_challenge_method=S256 [PKCE]
   6. Encrypt pending OAuth config:
      pendingState = {
        orgId, userId, name, url, clientId, clientSecret,
        tokenUrl, authUrl, scopes, enabledTools, codeVerifier, state
      }
      encrypted = AES-256-GCM(JSON.stringify(pendingState))
   7. Set HttpOnly cookie:
      Cookie: mcp_oauth_pending = encrypted
      Flags: HttpOnly=true, Secure=(production), SameSite=Lax
      MaxAge: 600 (10 minutes)
      Path: /api/oauth/mcp/callback
   8. Return { authorizationUrl }

   UI RESPONSE:
   - Open authorizationUrl in new tab (OAuth provider login)
   - Switch dialog to "oauth_pending" step (spinner)


┌─────────────────────────────────────────────────────────────┐
│ REQUEST 2: OAuth Provider Redirects (External)              │
│ User authenticates with OAuth provider                      │
└─────────────────────────────────────────────────────────────┘
                         ↓
   OAuth Provider: GET /api/oauth/mcp/callback?code=AUTH_CODE&state=STATE_VALUE

   (mcp_oauth_pending cookie included automatically via SameSite=Lax)


┌─────────────────────────────────────────────────────────────┐
│ REQUEST 3: Callback Handler (Next.js Route Handler)         │
│ Context: No Clerk auth (state parameter is proof)           │
└─────────────────────────────────────────────────────────────┘
                         ↓
   Route: GET /api/oauth/mcp/callback

   ACTIONS:
   1. Parse URL params: code, state
   2. Read mcp_oauth_pending cookie value
   3. Decrypt: pendingState = AES-256-GCM.decrypt(cookieValue)
   4. Validate CSRF: assert pendingState.state === URL.state
   5. Exchange authorization code for tokens:
      POST pending.tokenUrl
      Body: {
        grant_type: "authorization_code",
        client_id, client_secret, code, code_verifier, redirect_uri
      }
      Response: { access_token, refresh_token, token_type, ... }
   6. Validate refresh_token present (requires offline_access scope)
   7. Test tool connectivity (optional):
      - POST pending.url with MCP "tools/list" request
      - Auth: Bearer <access_token>
      - Capture tool list for validation
   8. Create encrypted secret:
      credentials = { client_secret, refresh_token }
      secret = createSecret({
        orgId: pending.orgId,
        namespace: "mcp-oauth",
        name: "mcp-oauth:<server-name>",
        value: JSON.stringify(credentials),  // encrypted by createSecret
        createdBy: pending.userId
      })
   9. Build config JSONB (stored unencrypted, non-sensitive):
      config = {
        url: pending.url,
        auth: {
          type: "oauth2",
          client_id: pending.clientId,
          token_url: pending.tokenUrl,
          scopes: pending.scopes,
          credentials_ref: {
            secret_id: secret.secretId,
            version: "latest"
          }
        },
        masking: {
          enabledTools: pending.enabledTools
        }
      }
  10. Create MCP server:
      server = createMcpServer({
        orgId: pending.orgId,
        name: pending.name,
        url: pending.url,
        secretRef: secret.secretId,
        config,
        createdBy: pending.userId
      })
  11. Update server status (valid/error):
      updateMcpServerStatus({
        serverId: server.serverId,
        status: toolTest.ok ? "valid" : "error",
        errorMessage: toolTest.error?.message
      })
  12. Clear pending OAuth cookie:
      Set-Cookie: mcp_oauth_pending=; Max-Age=0; Path=/api/oauth/mcp/callback
  13. Redirect to:
      /dashboard/mcps?oauth=success&server=<serverId>
      OR on error:
      /dashboard/mcps?oauth=error&reason=<reason>

   UI RESPONSE:
   - Detect ?oauth=success in query params
   - Refetch MCP server list
   - Show toast notification
   - Reset form state
   - Close dialog
   - Remove query param from URL
```

## Key Components

### 1. Encryption (`apps/web/lib/oauth.ts`)

Uses AES-256-GCM with Node.js `crypto` module:

```typescript
// Load 32-byte key from environment
function loadEncryptionKey(): Buffer
  - Reads SECRETS_ENCRYPTION_KEY env var
  - Supports hex or base64 encoding
  - Must be exactly 32 bytes

// Encrypt data (used for cookie and secrets)
function encryptSecretValue(plaintext: string): string
  - Generate random 12-byte IV
  - Create AES-256-GCM cipher
  - Encrypt plaintext
  - Get authentication tag (16 bytes)
  - Return: "v1:" + base64(IV + tag + ciphertext)

// Decrypt (used when reading cookie or secrets)
function decryptSecretValue(ciphertext: string): string
  - Extract version prefix ("v1:")
  - Parse base64 payload
  - Extract IV (bytes 0-12)
  - Extract tag (bytes 12-28)
  - Extract ciphertext (bytes 28+)
  - Create AES-256-GCM decipher
  - Set auth tag and decrypt
  - Return plaintext
```

### 2. PKCE Helpers (`apps/web/lib/oauth.ts`)

```typescript
// Generate CSRF state token
function generateOAuthState(): string
  - Return: randomBytes(32).toString('hex')
  - Used: state parameter in authorizationUrl + in pending state
  - Purpose: Prevent CSRF attacks

// Generate code verifier (for PKCE)
function generateCodeVerifier(): string
  - Return: randomBytes(32).toString('base64url')
  - Used: Stored in pending state, sent to tokenUrl in code_verifier param
  - Purpose: First part of PKCE flow

// Generate code challenge (for PKCE)
function generateCodeChallenge(verifier: string): string
  - Return: SHA256(verifier).toString('base64url')
  - Used: Sent to OAuth provider in authorizationUrl
  - Purpose: Proof that we own the code_verifier
```

### 3. OAuth URL Builder (`apps/web/lib/oauth.ts`)

```typescript
function buildAuthorizationUrl(params: {
  authUrl: string,      // OAuth provider's /authorize endpoint
  clientId: string,     // Application ID at OAuth provider
  redirectUri: string,  // Where provider redirects back
  scopes: string[],     // Requested permissions
  state: string,        // CSRF token
  codeChallenge: string // PKCE challenge
}): string
  - Construct URL from authUrl
  - Add query params: response_type=code, client_id, redirect_uri, scope, state
  - Add PKCE params: code_challenge, code_challenge_method=S256
  - Return complete authorization URL
```

### 4. Token Exchange (`apps/web/lib/oauth.ts`)

```typescript
async function exchangeCodeForTokens(params: {
  tokenUrl: string,      // OAuth provider's /token endpoint
  clientId: string,
  clientSecret: string,
  code: string,          // From OAuth redirect ?code=
  codeVerifier: string,  // From pending state
  redirectUri: string
}): Promise<TokenResponse>
  - POST to tokenUrl with form-encoded body:
    {
      grant_type: "authorization_code",
      client_id, client_secret, code, code_verifier, redirect_uri
    }
  - Return: { access_token, refresh_token, token_type, expires_in, ... }
  - Throws: Error if status not ok

async function refreshAccessToken(params: {
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string
}): Promise<TokenResponse>
  - POST to tokenUrl with form-encoded body:
    {
      grant_type: "refresh_token",
      client_id, client_secret, refresh_token
    }
  - Return: { access_token, (new refresh_token), token_type, expires_in, ... }
  - Throws: Error if status not ok
```

### 5. Cookie Encryption (`apps/web/lib/oauth.ts`)

```typescript
function encryptOAuthCookie(data: PendingOAuthState): string
  - Convert data to JSON
  - Call encryptSecretValue()
  - Return: encrypted, ready for Set-Cookie

function decryptOAuthCookie(ciphertext: string): PendingOAuthState
  - Call decryptSecretValue()
  - Parse JSON result
  - Return: PendingOAuthState object
  - Throws: Error if invalid
```

### 6. tRPC Mutation: `mcp.initiateOAuth` (`apps/web/server/trpc/routers/mcp.router.ts`)

**Input Schema:**
```typescript
{
  name: string,              // Server display name
  url: string,               // MCP server URL
  clientId: string,          // OAuth client ID
  clientSecret: string,      // OAuth client secret
  tokenUrl: string,          // Token endpoint URL
  authUrl: string,           // Authorization endpoint URL
  scopes: string[],          // Requested scopes
  enabledTools?: string[]    // Optional tool filter
}
```

**Process:**
1. Generate state (CSRF token)
2. Generate codeVerifier and codeChallenge (PKCE)
3. Ensure "offline_access" is in scopes
4. Build authorization URL
5. Create pending OAuth state object
6. Encrypt pending state
7. Set HttpOnly cookie with 10-minute TTL, SameSite=Lax
8. Return { authorizationUrl }

**UI Action:**
- Opens authorizationUrl in new tab
- Dialog switches to "oauth_pending" step with spinner

### 7. OAuth Callback Route (`apps/web/app/api/oauth/mcp/callback/route.ts`)

**Handler:** `GET /api/oauth/mcp/callback?code=...&state=...`

**Process:**
1. Extract `code` and `state` from URL
2. Read and decrypt `mcp_oauth_pending` cookie
3. Validate state matches (CSRF protection)
4. Exchange authorization code for tokens
5. Validate refresh_token present
6. Test tool connectivity (optional, non-fatal)
7. Create secret: `{ client_secret, refresh_token }`
8. Build OAuth config JSONB
9. Create MCP server record
10. Update server status (valid/error)
11. Clear pending cookie
12. Redirect to `/dashboard/mcps?oauth=success&server=<id>` or error URL

**Error Handling:**
- Cookie missing → `?oauth=error&reason=cookie_missing`
- State mismatch → `?oauth=error&reason=invalid_state`
- Token exchange failed → `?oauth=error&reason=<message>`
- Tool validation failed → status="error" (non-fatal, server still created)

### 8. Worker Token Resolution (`apps/agents/src/resolution.ts`)

**Function: `resolveOAuthOrBearerToken(env, orgId, server): Promise<string | null>`**

Route based on auth type:
- If `config.auth.type === "oauth2"`: call `resolveOAuth2Token()`
- Otherwise: use bearer token from secret

**Function: `resolveOAuth2Token(env, orgId, server, authConfig): Promise<string | null>`**

1. Load encrypted secret: `{ client_secret, refresh_token }`
2. POST to `authConfig.token_url` with:
   - grant_type: "refresh_token"
   - client_id, client_secret, refresh_token
3. Parse response: `{ access_token, refresh_token?, ... }`
4. If response includes new refresh_token (token rotation):
   - Update secret in database
   - Invalidate L1 cache (TtlCache)
   - Invalidate L2 cache (Redis/system)
5. Return: access_token (in-memory only, never persisted)
6. On failure: log error, return null (skip server)

**Token Rotation Handling:**
- Some OAuth providers rotate refresh_token on each exchange
- System detects new refresh_token in response
- Calls updateSecret() to persist new credentials
- Invalidates caches to ensure consistency

### 9. UI Form State (`apps/web/app/dashboard/mcps/page.tsx`)

**Form State (Page Level):**
```typescript
const [form, setForm] = useState({
  name: "",
  url: "",
  secretId: "",
  authType: "bearer" as "none" | "bearer" | "oauth2",
  // OAuth fields:
  oauthClientId: "",
  oauthClientSecret: "",
  oauthAuthUrl: "",
  oauthTokenUrl: "",
  oauthScopes: "",  // space-separated
});

const [dialogOpen, setDialogOpen] = useState(false);
const [dialogStep, setDialogStep] = useState<"form" | "tools" | "oauth_pending">("form");
```

**Form Persistence:**
- Form state persists at page level (not inside dialog)
- Closing dialog with `onOpenChange((open) => setDialogOpen(false))` does NOT clear form
- Form only clears on successful submission (create/update)
- Allows users to close dialog accidentally and reopen without losing input

**Auth Type UI:**
```
Radio or Select:
  ○ None (no auth)
  ○ Bearer Token (existing secret picker)
  ○ OAuth 2.0 (client ID, secret, auth URL, token URL, scopes)
```

**OAuth Fields (shown when authType === "oauth2"):**
- Client ID: text input
- Client Secret: password input (never readable, stored encrypted)
- Auth URL: URL input
- Token URL: URL input
- Scopes: text input (space-separated, displayed as tags)

**Dialog Steps:**
1. `"form"`: Initial form with auth type selection
2. `"tools"`: Tool preview/filtering (if bearer token)
3. `"oauth_pending"`: Spinner + message (if OAuth, waiting for redirect)

**Callback Handling:**
- On page mount: check `?oauth=success` or `?oauth=error` in query string
- If success: toast + refetch MCP list + reset form + remove query param
- If error: toast with reason + remove query param

### 10. Cache Invalidation (`apps/agents/src/cache.ts`)

```typescript
class TtlCache<T> {
  delete(key: string): void
    - Remove key from this.entries
    - Used when refresh_token rotates (new credentials cached, old invalidated)
}
```

## Database Schema

**mcp_servers table:**
```
- id: string (UUID)
- org_id: string (foreign key)
- name: string
- url: string
- status: "valid" | "error" | "pending"
- error_message: string (nullable)
- secret_ref: string (UUID, foreign key to secrets)  ← OAuth credentials secret
- config: JSONB (see below)
- last_validated_at: timestamp
- created_at: timestamp
- updated_at: timestamp
```

**config JSONB (OAuth server example):**
```json
{
  "url": "https://mcp-server.example.com",
  "auth": {
    "type": "oauth2",
    "client_id": "app-id-at-provider",
    "token_url": "https://provider.example.com/token",
    "scopes": ["read:files", "write:files"],
    "credentials_ref": {
      "secret_id": "uuid-of-secret",
      "version": "latest"
    }
  },
  "masking": {
    "enabledTools": ["tool1", "tool2"]  // null means all tools
  }
}
```

**secrets table:**
```
- id: string (UUID)
- org_id: string (foreign key)
- namespace: string  ← "mcp-oauth"
- name: string       ← "mcp-oauth:<server-name>"
- value: string      ← AES-256-GCM encrypted JSON
- created_by: string
- created_at: timestamp
- updated_at: timestamp
```

**Secret value (decrypted):**
```json
{
  "client_secret": "secret-from-oauth-provider",
  "refresh_token": "refresh-token-from-oauth-provider"
}
```

## Environment Variables

```bash
# Required: Canonical app URL for OAuth redirect_uri construction
NEXT_PUBLIC_APP_URL=https://app.example.com

# Required: 32-byte encryption key (hex or base64)
# Used for both OAuth cookies and secret values
SECRETS_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Optional: Worker pool for token refresh (if separate from main runtime)
WORKER_AUTH_KEY=xxx
```

## Key Types

```typescript
interface PendingOAuthState {
  orgId: string;
  userId: string;
  name: string;
  url: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  authUrl: string;
  scopes: string[];
  enabledTools: string[] | null;
  codeVerifier: string;  // PKCE verifier
  state: string;         // CSRF token
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;      // May be omitted if token rotation not used
  expires_in?: number;
  token_type: string;
  [key: string]: unknown;
}

interface OAuth2AuthConfig {
  type: "oauth2";
  client_id: string;
  token_url: string;
  scopes: string[];
  credentials_ref: {
    secret_id: string;
    version: "latest";
  };
}

interface OAuthCredentials {
  client_secret: string;
  refresh_token: string;
}
```

## Security Considerations

1. **Encrypted Storage**: All tokens encrypted at rest with AES-256-GCM
2. **PKCE Protection**: Authorization code exchange includes PKCE to prevent code interception
3. **CSRF Protection**: State parameter validated in callback
4. **HttpOnly Cookies**: Pending OAuth state in HttpOnly cookie, inaccessible to JavaScript
5. **SameSite Lax**: Cookie only sent with top-level navigations (OAuth provider redirect)
6. **Short TTL**: Pending OAuth state expires in 10 minutes
7. **Immediate Deletion**: Pending OAuth cookie deleted after successful/failed callback
8. **No Access Token Persistence**: Access tokens never stored to database, only used in-memory
9. **Token Rotation Support**: If provider rotates refresh_token, new value persisted immediately

## Testing Checklist

- [ ] Full OAuth flow: Add server with OAuth 2.0 → auth URL opens in new tab → complete login → server appears
- [ ] Form persistence: Fill OAuth fields → close dialog → reopen → all fields preserved
- [ ] Callback error handling: ?state=tampered → error toast, ?oauth=error&reason=invalid_state
- [ ] Worker token refresh: Run agent using OAuth MCP server → verify Authorization: Bearer header
- [ ] Token rotation: Mock provider returns new refresh_token → secret updated in DB, cache invalidated
- [ ] Edit flow: Open edit dialog for OAuth server → modify fields → "Re-authorize" → tools updated
- [ ] Offline access scope: Fill OAuth form without offline_access → system auto-adds → refresh_token present
- [ ] Multiple servers: Create both bearer and OAuth servers → both work simultaneously
- [ ] Tool filtering: Enable only subset of tools → MCP server respects masking config
