# Same-account direct-device protocol

This protocol implements the user's requested account-based control model: an authenticated user selects one of their own online devices. There is no connection code and no per-session human approval. The visible host client polls for a request, prepares its capture/input path and activates that request. Authentication and device ownership remain server-enforced; administrator role does not permit connecting to another account's devices.

## HTTP interface

All three endpoints require `Authorization: Bearer <access token>`. Bodies use JSON; unknown properties are rejected. Never put a credential in the URL.

### Start from the controller

`POST /api/v1/devices/{hostDeviceId}/connect`

Request:

```json
{"controllerDeviceId":"dev_controller"}
```

201 response:

```json
{
  "id":"session_id",
  "controllerToken":"controller_capability",
  "state":"WAITING_FOR_HOST_APPROVAL",
  "expiresAt":"RFC3339 timestamp",
  "hostDeviceId":"dev_host",
  "controllerDeviceId":"dev_controller"
}
```

The state name is retained for compatibility with the existing signaling state machine. In the direct-device UI it means “waiting for the device to be ready”, not a person being asked to approve. The caller and both devices must belong to the same live account; both devices must be unrevoked and online. The IDs must differ. A host already holding a pending or active direct session returns 409 rather than creating a competing controller. Pending lifetime is the smaller of the existing code TTL and one minute. No code is generated or entered into the legacy code lookup.

The controller can immediately connect to the existing WebSocket URL with role `controller`, then authenticate in its first frame with the returned controller capability. Before activation only its existing keepalive ping is eligible to be forwarded; offers, answers and other negotiation still wait for host readiness.

### Poll from the host

`GET /api/v1/devices/{hostDeviceId}/direct-sessions`

200 response:

```json
{
  "sessions":[{
    "id":"session_id",
    "hostToken":"host_capability",
    "state":"WAITING_FOR_HOST_APPROVAL",
    "expiresAt":"RFC3339 timestamp",
    "hostDeviceId":"dev_host",
    "controllerDeviceId":"dev_controller",
    "controllerDeviceName":"Phone"
  }]
}
```

The poll validates ownership of the host device and refreshes its heartbeat. It rechecks the account and both devices for every returned pending session. Controller capabilities are not returned by this endpoint. Polling is not consumptive: a lost HTTP response can be retried without losing the pending request. The host client must deduplicate by `id` while it prepares that request.

A 2–3 second foreground poll is suitable for the default 120 requests/minute limit; keep the existing slower heartbeat/device-list polling. Pause polling while the host is already busy. An empty result is `{"sessions":[]}`.

### Activate from the host

`POST /api/v1/devices/{hostDeviceId}/direct-sessions/{sessionId}/accept`

Request:

```json
{"hostToken":"host_capability"}
```

200 response:

```json
{
  "id":"session_id",
  "controllerToken":"controller_capability",
  "state":"AUTHORIZED_ACTIVE",
  "expiresAt":"RFC3339 timestamp",
  "hostDeviceId":"dev_host",
  "controllerDeviceId":"dev_controller"
}
```

Recommended ordering: the host opens/authenticates its `host` WebSocket and waits for `ready`, prepares capture, calls `accept`, authorizes its local input adapter for the returned controller capability, and starts its WebRTC offer. The host's capture/authorization policy must implement the product's same-account model; this server change alone does not change Windows capture selection or native authorization.

Accept checks all of: current access token/account, stored owner, matching host-device path, both live unrevoked devices, the unexpired host capability and pending state. It can transition only once. Repeated acceptance returns 409 and never renews the deadline. Active expiry retains the existing bound measured from creation. Legacy `/share-sessions/{id}/approve` refuses a direct-device session, so possessing a host capability alone cannot bypass the account/device recheck.

## Existing signaling and termination

The current WebSocket first-frame authentication and offer/answer/ICE messages are reused. The `approved` system event is broadcast on activation. Host and controller credentials remain isolated; the server strips signal credentials before forwarding.

The existing capability-authorized disconnect and host rejection endpoints can terminate a direct session. Revoking either participating device through `DELETE /api/v1/devices/{id}` clears related direct capabilities and closes both sockets before returning. On socket authentication, each received signaling frame and the one-second state timer, the server rechecks the owner account and both registered devices. Disabled accounts, revoked/missing devices, or devices offline beyond the normal heartbeat threshold end the direct session. The client must stop capture/input on that disconnect as before.

No device secret was added. Device claims remain subordinate to an authenticated account: any authenticated session for an account is permitted to operate that account's devices, as requested. There is no cross-account administration override. Direct sessions are in-memory and end when this process restarts; existing database schema is unchanged.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON, missing device ID or identical host/controller |
| 401 | Missing/invalid/expired access token, disabled account or wrong session host capability |
| 404 | Device/session not owned by this account, missing or revoked device, or wrong host-device path |
| 409 | Offline device, busy host, duplicate activation or incompatible session state |
| 410 | Expired pending session |
| 429 | Existing HTTP rate limiter |
| 503 | Existing bounded session-store capacity reached |

## Verification

Tests cover anonymous/forged accounts, cross-account target/controller IDs (including an administrator of another account), self-control, single pending session per host under concurrency, scoped polling, host-token isolation, wrong-path/wrong-token activation, prevention of legacy approval bypass, one-time acceptance, expiry, offline/revoked/disabled accounts/devices, immediate HTTP revocation and one-second WebSocket shutdown after account disablement. The old code-based APIs remain covered by their existing tests.

Real two-device direct capture and native input are frontend/host acceptance work; unit and HTTP/WebSocket tests do not establish them.
