# API Contract

Source of truth for the mobile app ⇄ dashboard wire format. The backend
accepts **both** camelCase and snake_case on input (it normalizes in
`services/scans.js` and `services/validation.js`), but emits a single
canonical shape. Field names below mark:

- **accepted** — request keys the backend will read (either variant)
- **emitted** — keys the backend actually returns

If you change a name here, change it in the matching service file and add a
test in `test/`.

---

## Field-name aliases (the drift trap)

| Concept | camelCase (accepted) | snake_case (accepted) | emitted |
|---|---|---|---|
| Scan id (idempotency key) | `scan_id` / `id` | — | `id` |
| Tree identifier | `treeId` | `tree_id` | `treeId` |
| Timestamp | `scannedAt` | `scanned_at` | `scannedAt` |
| Assessment | `assessment` / `predictedAssessment` | `predicted_assessment` | `assessment` |
| Image (base64 in) | `imageBase64` | `image_base64` | — (stored as `imageUrl`) |
| Device | `deviceId` | `device_id` | `deviceId` |
| Session | `sessionId` | `session_id` | `sessionId` |
| Device name | `deviceName` | `device_name` | `deviceName` |

**App → server** uses snake_case (`tree_id`, `scanned_at`,
`predicted_assessment`, `session_id`, `device_id`) — see
`mangroveguardapp/lib/services/sync_client.dart`. **Server → dashboard**
emits camelCase. Validation is case-insensitive on `assessment` values.

---

## `POST /api/scans` (single)

Request (either case style):
```json
{
  "scan_id": "scan-MG-01-123456-1767330245000",
  "tree_id": "MG-01-123456",
  "scanned_at": "2026-01-02T03:04:05.000Z",
  "predicted_assessment": "high",
  "session_id": "session-…",
  "device_id": "device-…",
  "imageBase64": "<optional base64 JPEG, ≤8MB decoded>"
}
```
Response `201`:
```json
{
  "id": "scan-MG-01-123456-1767330245000",
  "treeId": "MG-01-123456",
  "scannedAt": "2026-01-02T03:04:05.000Z",
  "assessment": "high",
  "imageUrl": "/scan-images/<id>.jpg",
  "sessionId": "session-…",
  "deviceId": "device-…",
  "deviceName": "…",
  "serverReceived": "2026-01-02T03:04:10.000Z"
}
```
`400 VALIDATION_ERROR` if `treeId`/`scannedAt`/`assessment` missing or
`assessment` not in `{high, moderate, low}`.

**Idempotency:** `INSERT OR IGNORE` on `id`. Re-POSTing the same `scan_id`
is a no-op (row unchanged).

---

## `POST /api/scans/batch`

Request:
```json
{
  "device_id": "device-…",
  "session_id": "session-…",
  "scans": [ { …single-scan payload… }, … ]
}
```
- Max `50` scans, `25MB` total, `5MB` per scan (`MAX_BATCH_*` in
  `services/validation.js`).
- Batch-level `device_id` is merged into any scan lacking a `deviceId`.
- Invalid entries are **skipped**, not rejected (whole batch still `201`).

Response `201`:
```json
{ "inserted": 42, "scans": [ …emitted single-scan shapes… ] }
```
All inserts run in **one transaction** (all-or-nothing).

---

## `GET /api/devices`

Response (array):
```json
[{
  "deviceId": "device-…",
  "deviceName": "…",
  "registeredAt": "…",
  "lastSeenAt": "…",
  "isPaired": 1
}]
```
**Security:** `lastPairedToken` is **never** returned — only the boolean
`isPaired` (1/0). Pairing status for the dashboard is verified server-side
via `GET /api/pair/status?token=…`.

---

## Pairing endpoints

| Endpoint | Method | Notes |
|---|---|---|
| `/api/pair/qr` | GET | Returns `{ token, url, qrDataUrl }`. `token` is a raw UUID shown once (QR payload); **stored hashed** (SHA-256). |
| `/pair?token=` | GET | Pairing form (HTML). Rejects used/expired tokens. |
| `/api/pair/confirm` | POST | `{ token, deviceId, deviceName? }` → `201`. Marks token used, stores `hash(token)` in `devices.lastPairedToken`. |
| `/api/pair/status?token=` | GET | `{ paired, device }` — dashboard polls this instead of reading secrets from `/api/devices`. |
| `/api/pair/unpair` | POST | `{ deviceId }` → clears `lastPairedToken`, marks the stored token used. |

Token lifetime: unused tokens older than **5 minutes** are purged by
`cleanupStalePairTokens` on each QR issuance.

---

## Sessions

| Endpoint | Method | Notes |
|---|---|---|
| `/api/sessions` | POST | `{ session_id, device_id }` → `200` if exists, `201` if new. `INSERT OR IGNORE` + `COALESCE` upsert. |
| `/api/sessions/:sessionId/end` | POST | Sets `endedAt`. `404 NOT_FOUND` if missing or already ended. |

---

## Error envelope

All errors return:
```json
{ "error": "<human message>", "code": "<MACHINE_CODE>" }
```
Common codes: `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `INVALID_TOKEN`,
`NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.
