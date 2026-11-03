import { createServer } from "node:http";
import { z } from "zod";
import { decideHandoff } from "./shipment_decision.ts";
import { infraiRequest, InfraiError } from "./infrai_http.ts";

const segment = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const handoff = z.object({
  requestId: z.string().uuid(), shipmentId: segment, identity: segment,
  event: z.enum(["arrived", "delivered", "exception"]),
  proofKey: segment.optional(), exceptionReason: z.string().trim().min(1).max(500).optional()
}).strict().superRefine((value, ctx) => {
  if (value.event === "delivered" && !value.proofKey) ctx.addIssue({code: "custom", message: "Delivery needs proofKey"});
  if (value.event === "exception" && !value.exceptionReason) ctx.addIssue({code: "custom", message: "Exception needs exceptionReason"});
});
const bucket = process.env.INFRAI_BUCKET;
if (!bucket || !/^[a-z0-9-]{3,63}$/.test(bucket)) throw new Error("Set INFRAI_BUCKET to a bucket name");
try {
  await infraiRequest("/v1/storage/bucket/create", {name: bucket});
} catch (error) {
  if (!(error instanceof InfraiError && error.status === 409)) throw error;
}
// Keep one promise per request, including partial outcomes, until an operator reconciles it.
const requests = new Map<string, {body: string; result: Promise<unknown>}>();
async function openHandoff(input: z.infer<typeof handoff>) {
  const decision = decideHandoff(input.event, input.proofKey, input.exceptionReason);
  const room = `shipment-${input.shipmentId}-${input.requestId}`;
  const roomData = await infraiRequest("/v1/rtc/room/create", {name: room, max_participants: 3, empty_timeout_s: 300});
  const token = await infraiRequest("/v1/rtc/token/issue", {
    room, identity: input.identity, ttl_s: 900, can_publish: decision.canPublish, can_subscribe: true
  });
  const proof = input.proofKey ? await infraiRequest(
    `/v1/storage/object/presign/${encodeURIComponent(bucket!)}/${encodeURIComponent(input.proofKey)}`,
    {op: "put", expires_seconds: 300, content_type: "image/jpeg", max_bytes: 10000000, idempotency_key: input.requestId}
  ) : null;
  return {shipmentId: input.shipmentId, event: input.event, exceptionReason: input.exceptionReason,
    decision, room, roomData, token, proof};
}
createServer(async (req, res) => {
  const send = (status: number, value: unknown) => {
    res.writeHead(status, {"Content-Type": "application/json"});
    res.end(JSON.stringify(value));
  };
  if (req.method !== "POST" || req.url !== "/handoffs") return send(404, {error: "Route not found"});
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 8192) return send(413, {error: "Body too large"});
    }
    let decoded: unknown;
    try { decoded = JSON.parse(body); } catch { return send(400, {error: "Expected JSON"}); }
    const parsed = handoff.safeParse(decoded);
    if (!parsed.success) return send(400, {error: parsed.error.flatten()});
    const fingerprint = JSON.stringify(parsed.data);
    const previous = requests.get(parsed.data.requestId);
    if (previous && previous.body !== fingerprint) return send(409, {error: "requestId already used for another handoff"});
    const result = previous?.result ?? openHandoff(parsed.data);
    if (!previous) requests.set(parsed.data.requestId, {body: fingerprint, result});
    send(200, await result);
  } catch (error) {
    if (error instanceof InfraiError) return send(error.status, {error: error.detail});
    send(502, {error: "Handoff could not be completed"});
  }
}).listen(Number(process.env.PORT ?? 3000), "127.0.0.1", () => console.log("Handoff service listening on localhost"));
