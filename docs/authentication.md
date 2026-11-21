# Authentication

## Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Behavior

- Passwords are hashed with Argon2id.
- Access tokens are short-lived HMAC JWTs.
- Refresh tokens are random, revocable, and stored only as HMAC-SHA256 hashes.
- Refresh-token rotation atomically consumes the previous token, so concurrent replay can produce at most one replacement.
- Windows desktop sign-ins are remembered by default in the Windows Credential Manager. Unchecking Remember sign in keeps tokens in memory only. Other controller platforms keep sign-ins for the current app run.
- Login failures are IP rate-limited.
- Proxy forwarding headers affect rate limits only when the proxy address is in `TRUSTED_PROXY_CIDRS`.
- Logs do not record passwords or full tokens.
- Production deployment must use HTTPS through Caddy.

## Client Flow

After registration or login, the client registers the current device, stores the local device fingerprint and device id, and starts heartbeats. A remembered Windows sign-in is restored from Credential Manager and refreshed automatically. Once signed in, the device list shows online devices owned by the same account, and selecting one starts the direct session without a connection code or another host prompt.
