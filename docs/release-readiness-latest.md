# Release Readiness Latest

## Checks

- 0.3 alpha UI refresh: PASS
- Vite/React/Tauri dependency refresh: PASS
- npm high-severity audit: PASS (0 vulnerabilities)
- Tauri restrictive CSP and native host consent prompt: PASS
- Atomic refresh-token rotation and assist-request authorization tests: PASS
- Exact CORS/WebSocket origin allowlist tests: PASS
- Short-lived authenticated TURN REST credential tests: PASS
- Deployment placeholder rejection: PASS

- Desktop frontend build: PASS
- Tauri Rust check: PASS
- Portable Windows EXE build: PASS
- Windows NSIS installer build: PASS
- Portable EXE startup: PASS
- Go service build: PASS
- Go unit tests: PASS
- Authentication endpoint tests: PASS
- Device endpoint tests: PASS
- Device assist request endpoint tests: PASS
- Migration structure tests: PASS
- Live PostgreSQL migration in temporary Docker container: PASS
- Docker Compose config: PASS
- `.env.example` completeness: PASS
- No hardcoded production secrets: PASS
- TURN through environment variables: PASS
- PostgreSQL service in Docker Compose: PASS
- Health checks: PASS
- Port documentation: PASS
- Manual test steps: PASS
- Copy-paste deployment commands: PASS

## Not Verified or Failed

- Second Windows PC installation: NOT VERIFIED.
- LAN dual-machine remote assistance: NOT VERIFIED.
- Public server deployment, DNS, TLS, firewall/security-group, P2P, and TURN fallback: NOT VERIFIED.
