# Account and session contract — step 2a.1

Status: Session schema/migration, registration, login, current-user, logout and session middleware are implemented and tested. Account screens and profile updates remain planned for step 2a.4. Registration creates an account but does not sign it in.

## Login flow

Registration stores a password hash; successful login creates a fresh cryptographically random 32-byte token. The browser receives the raw token only as an HttpOnly cookie. The database stores its SHA-256 digest in Session.tokenHash. For each authenticated request, the API hashes the cookie token, looks up the session and requires expiresAt > server time. Session IDs are internal identifiers, never credentials. SHA-256 is appropriate for a high-entropy random session token; it is not the password hashing algorithm.

Initial lifetime: seven days with absolute expiration and no sliding renewal. Logout deletes the session row and clears the cookie with matching path/settings. Expired rows are denied immediately regardless of cleanup timing. Cleanup removes expired rows periodically; multiple devices may have independent sessions. Successful login rotates any existing browser session; password/security changes must revoke all sessions when those features arrive. User deletion cascades sessions. No raw passwords, cookies or tokens in logs.

Cookie: `musicsphere_session`, HttpOnly, SameSite=Lax, Path=/, no Domain, Max-Age bounded by server expiration. Secure under production HTTPS; localhost HTTP development is the explicit exception. No tokens in localStorage or JSON responses. Responses containing account/session data use Cache-Control: no-store.

## Endpoint contract (profile update still planned)

| Method/path | Input | Success | Expected failures |
| --- | --- | --- | --- |
| POST /api/auth/register | email, username, displayName, password | 201 `{ user }`; user then logs in | 400 invalid; 409 account details unavailable; 429 limited |
| POST /api/auth/login | email, password | 200 `{ user }` and new cookie | 400 malformed; 401 invalid credentials; 429 limited |
| GET /api/auth/me | Session cookie | 200 `{ user }` | 401 missing/expired/revoked |
| POST /api/auth/logout | Session cookie | 204; idempotently revoke and clear | 403 rejected origin |
| PATCH /api/users/me | displayName only initially | 200 `{ user }` | 400 invalid; 401 unauthenticated |

Private `user` response: id, email, username, displayName, createdAt. Never serialize Prisma User wholesale: passwordHash, session details and consent/location internals are excluded. A later public profile response omits email too. Editing password, email, username or region is not part of this first profile endpoint.

Errors: `{ error: { code, message, fields? } }` for these new endpoints. Stable codes include VALIDATION_ERROR, ACCOUNT_UNAVAILABLE, INVALID_CREDENTIALS, UNAUTHENTICATED, FORBIDDEN_ORIGIN, RATE_LIMITED. Do not include submitted passwords in errors. Keep legacy health/error routes unchanged until a deliberate API-wide migration.

## Input rules to implement

Reject non-object JSON, unknown fields and non-string values. Trim email, username and displayName. Lowercase email and username before uniqueness checks; do not apply provider-specific email alias stripping. Email is at most 254 characters and must pass practical email syntax validation. Username is 3–40 ASCII lowercase letters, digits or underscores. Display name is 1–100 characters after trimming with control characters rejected. Never trim or normalize passwords: require 15–128 Unicode code points, allow spaces, and impose no arbitrary composition rules. Use a maintained password-hashing implementation with per-password salts; choose and benchmark parameters in step 2a.2. Database unique constraints are authoritative under concurrent registration.

## Request protections to implement with the endpoints

All unsafe requests require application/json and a supplied Origin matching an explicit allowlist, including register/login/logout. Reject absent, null or untrusted origins; do not infer the allowlist from the Host header. Local development allows exactly http://localhost:5173 and http://127.0.0.1:5173. Production uses configured HTTPS origins. SameSite and strict Origin validation provide the initial CSRF defense for this browser-only API; test login CSRF as well as authenticated mutations. Do not enable wildcard credentialed CORS.

Add bounded in-memory throttling for the initial single-process API: registration per IP, login per IP and normalized account key. Set explicit limits, expiry and cleanup; return Retry-After. Do not trust forwarded IP headers unless a known deployment proxy is configured. Generic login errors and dummy password verification for unknown users reduce enumeration differences. Registration conflicts remain an acknowledged enumeration tradeoff. Multi-instance deployment will need shared rate-limit storage.

## Verification gates

Step 2a.1 verifies session constraints, foreign keys, token uniqueness, user-deletion cascade, indexes, client generation and application builds. Later endpoint tests must cover canonical duplicates/races, password hashing/verification, cookie flags, expired/revoked sessions, login rotation, logout idempotence, forbidden origins, rate limits and private response fields. Database expiry constraints only ensure valid timestamps; they do not implement session authentication.

## Implemented registration details (2a.2)

`src/modules/auth/registration.ts` validates/canonicalizes inputs and saves an explicit safe projection. `password.ts` uses Node crypto.scrypt with N=131072, r=8, p=1, 16-byte random salts and a 64-byte key; the versioned string records algorithm/parameters/salt/key. Verification uses timingSafeEqual. This matches [OWASP's scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) using the maintained Node implementation without an additional native dependency. A local test measured approximately 195 ms per hash; this is a single-machine observation, not a production benchmark.

The router enforces allowed Origin, JSON content type, 8 KiB bodies, five attempts per IP per 15 minutes and two concurrent password operations shared by registration and login. The limiter retains at most 10,000 IP entries, expires old entries on requests, and does not trust forwarded IP headers. Production requires APP_ORIGINS as a comma-separated list of exact HTTPS origins. Rate limits reset on restart and are per process; shared deployments require shared storage. Malformed JSON returns 400, oversized JSON 413, and unsupported media 415, all using the auth error envelope.

Email validation supports an ASCII mailbox/domain subset; internationalized email support is deferred. Display-name length currently counts UTF-16 code units, while passwords count Unicode code points. Passwords are never trimmed. Email and username uniqueness are enforced by PostgreSQL, and Prisma uniqueness errors map to a generic 409 without returning field values. No registration UI, email verification or password reset is included yet. Login/session creation is implemented in step 2a.3.

## Implemented login/session details (2a.3)

- `sessions.ts` verifies credentials, issues 32 random bytes encoded as hex, and stores only SHA-256 token digests. Unknown emails run the same scrypt verification work using a correctly formatted dummy hash; they receive the same error as incorrect passwords. This reduces timing differences but does not guarantee constant-time requests across database/network conditions.
- Login transactionally revokes the presented old session and creates a fresh seven-day session. Other devices keep their sessions. Failed credentials leave the current session unchanged. Multiple concurrent login requests may each issue a session; the client should submit one login at a time.
- `session-http.ts` reads only a single, valid cookie. It rejects duplicate/malformed credentials, ignores query/header bearer tokens, and provides reusable `requireSession` middleware. `/me` uses it to return only safe account fields. Expired sessions are rejected even before cleanup.
- Logout requires trusted Origin and JSON content type (send `{}`). It deletes the presented session, clears the cookie with the same attributes, and returns 204 even if already logged out. Database failures return 500 rather than falsely reporting successful revocation.
- Login has a 30-attempt/IP and 10-attempt/normalized-email limit per 15 minutes, counting successful and failed attempts. Email limiter keys are hashed; forwarded IP headers remain untrusted. All password operations share a two-operation concurrency bound. Limits are per process, bounded and reset on restart.
- Production cookies have Secure; local HTTP development does not. Both use HttpOnly, SameSite=Lax, Path=/, no Domain and seven-day Max-Age. Cookie expiry does not replace the server-side expiration check. Auth responses use no-store.
- Server startup and an hourly unref'ed timer remove expired session rows. Cleanup failure logs a generic message and retries next hour; authentication continues to check expiry independently.

References: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [Express cookie clearing](https://expressjs.com/en/5x/api/response/).

The PostgreSQL session lifecycle test uses uniquely identified SYNTHETIC accounts and removes only its fixtures in finally. The schema/registration integration test continues to roll back its fixtures. Run these tests against a local development database. Browser login behavior will be checked when the account screens exist; production HTTPS behavior currently has header-level tests only.
