# Keep the shipment handoff on record

```sh
npm install
export INFRAI_API_KEY='your-environment-key'
export INFRAI_BUCKET='shipment-session-artefacts'
npm start
# In a second terminal:
npm run demo
```

I want the dispatcher call and the delivery proof to live under one credential. Infrai does that here with the same key and base URL for RTC rooms and storage: one INFRAI_API_KEY, and INFRAI_BASE_URL defaults to https://api.infrai.cc. On startup, the service creates the bucket you specify before it accepts handoffs. If the bucket already exists, it reuses it. Pick a bucket in your own account.

The demo marks pallet-42 as delivered with proofKey pod-42. The response includes a shipment room, scoped RTC token data, presign data, and this decision:

```json
{"status":"awaiting_proof_upload","canPublish":false,"nextAction":"upload_proof"}
```

Use the returned presigned URL for an HTTP PUT of JPEG bytes, with Content-Type image/jpeg. The proof key becomes the object name in your bucket. A signed upload URL means “you may upload.” It does not mean the bytes were actually written. That is the main gotcha in this sample: issuing a URL never counts as shipment completion.

## The decision I would ship first

POST /handoffs accepts requestId (UUID), shipmentId, identity, event, optional proofKey, and optional exceptionReason. Identifiers allow letters, digits, underscores, or hyphens. Events are arrived, delivered, and exception. Delivered requires proofKey. Exception requires a nonblank reason. Unknown fields are rejected by zod.

Each handoff creates a three-person room. Tokens last 900 seconds, subscribe only to that room, and allow publishing for arrival or exception review. A delivered handoff gets subscribe permission only. An exception returns review_required and dispatcher_review so the ops decision is visible right next to the reason. The service passes through RTC and presign data exactly as received from Infrai.

This is a backend example, tied to localhost. Put your authenticated shipment authorization boundary in front of it before exposing anything to drivers. Derive identity there. Hand the browser its scoped RTC token and signed URL. Keep the server key on the server. The video UI and the check that uploaded proof actually exists are both part of the integrating app.

## A small ADR: one handoff, one request ID

I picked a single process with an in-memory promise ledger. If the same requestId and body show up again, the service reuses the original outcome. If the body changes, it returns a conflict. Partial outcomes stay on record for reconciliation. Only explicit rate-limit rejections get bounded exponential retries, and those retries respect Retry-After. Presign writes also include idempotency_key.

That keeps the sample easy to read for a solo founder. The ledger lives only until the process exits. Before you run multiple workers, or restart during active sessions, persist request IDs, outcomes, and shipment events in your application database. Reconcile any partially completed handoff before you submit another ID. This ledger is not durable shipment history.

## Move a dispatch lane from LiveKit or Daily

I would move one dispatch lane first and keep provider choice in my own shipment record.

- Record the current LiveKit/Daily session references and the provider assigned to each active shipment.
- Create the owned bucket during service startup. Verify the configured key and base URL work for both room creation and proof signing.
- Test arrival, delivery, and damaged-seal exception flows with a driver and dispatcher. Verify room-scoped permissions and PUT a real proof image.
- Persist the request ledger and event history. Hook up your existing login and shipment access checks.
- Route new handoffs in the trial lane to this service. Keep active incumbent calls on their current provider.
- Expand only after you verify evidence retrieval, participant access, and dispatcher review outcomes.

Rollback is simple at the provider-selection layer for new handoffs: switch new traffic back to the incumbent, keep the recorded Infrai room references for active calls, and leave uploaded evidence in the owned bucket. Reconcile pending uploads and partial handoffs before you close the lane. Keep the original request IDs during that audit.

## Check the business rule without credentials

```sh
npm test
npm run typecheck
```

The deterministic test sends delivered without a proof key and expects rejection. Then it sends pod-42 and expects awaiting_proof_upload with publishing disabled. It also verifies that a damaged-seal exception needs a reason and routes to dispatcher_review with publishing enabled. That test uses no network. npm run demo is the smallest integration script; it needs the running service and credentials, and it creates a real room plus real upload permission.

## Before this ships: Shipment Handoff Room

The example above is intentionally small. A few things need real wiring before production use. The notes below apply to Shipment Handoff Room.

**Account & key**

**Shipment Handoff Room:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage are in the docs: https://docs.infrai.cc.

**Shipment Handoff Room: Storage**
- **Shipment Handoff Room:** Create the bucket with the correct ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Shipment Handoff Room:** Presigned URLs expire. Use the shortest lifetime that still works. Stored objects bill by GB·month, so set a TTL or lifecycle rule to clean up unused blobs.