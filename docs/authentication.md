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
- Login failures are IP rate-limited.
- Logs do not record passwords or full tokens.
- Production deployment must use HTTPS through Caddy.

## Client Flow

The first screen is the login page. After registration or login, the client registers the current device, stores the local device fingerprint and device id, and starts heartbeats.
