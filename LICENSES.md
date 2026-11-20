# Licenses

## Runtime and Build Dependencies

The 0.7 workspace, local-summary and trend implementation adds no runtime package. SVG/CSS presentation and lifecycle/data-validation logic are original; the user-supplied VelaMost reference informs visual direction only.

The 0.6 communication/quality update adds no external runtime package. WebRTC stats formulas follow the W3C specification; the supplied research document is used as a roadmap reference. No proprietary codec, GPU SDK, commercial implementation, HDR/4:4:4 module or copied open-source media implementation was introduced.

The 0.5 UX update adds no runtime dependencies. CSS/SVG assets and UI components are original. WCAG, WAI-ARIA, W3C Screen Capture and Microsoft DPI documentation are referenced for engineering decisions; no third-party UI implementation was copied. See docs/research-and-decisions-0.5.md.

- Go standard library: BSD-3-Clause style license, used for HTTP service, JSON, crypto randomness, logging, and tests.
- `github.com/gorilla/websocket`: BSD-2-Clause, used for signaling WebSocket transport.
- `github.com/lib/pq`: MIT, used as the PostgreSQL database driver.
- `golang.org/x/crypto`: BSD-3-Clause, used for Argon2id password hashing.
- React: MIT, used for desktop UI.
- React DOM: MIT, used to render the desktop UI.
- Vite: MIT, used for frontend development and production build.
- TypeScript: Apache-2.0, used for typed frontend code.
- `@vitejs/plugin-react`: MIT, used for React support in Vite.
- `@tauri-apps/api`: Apache-2.0 or MIT, used for frontend-to-Tauri command invocation.
- `@tauri-apps/cli`: Apache-2.0 or MIT, used for Tauri development and Windows packaging.
- Rust crates `tauri`, `tauri-build`, `serde`, `serde_json`, `thiserror`, and transitive crates: see generated `src-tauri/Cargo.lock`; used for desktop shell, command handling, serialization, and error handling.
- Rust `windows` crate: Apache-2.0 or MIT, used for Win32 `SendInput`.
- Version 0.4 adds no package dependency for adaptation, input ordering, or tests. Node's built-in test runner is used; Win32 calls reuse the existing windows crate.
- W3C standards, IETF RFCs, Sunshine, and papers are research references only. No Sunshine GPL source or paper code/assets were copied; the implementations are original. See docs/research-and-decisions-0.4.md for URLs, document dates, licenses, and adopted ideas.
- Docker images `golang`, `alpine`, `coturn/coturn`, and `caddy`: used for public deployment packaging; verify image licenses and pinned versions before production release.
