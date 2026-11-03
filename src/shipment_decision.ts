export type ShipmentEvent = "arrived" | "delivered" | "exception";
export function decideHandoff(event: ShipmentEvent, proofKey?: string, exceptionReason?: string) {
  if (event === "delivered" && !proofKey) throw new Error("Delivery needs a proof key");
  if (event === "exception" && !exceptionReason?.trim()) throw new Error("Exception needs a reason");
  return {
    status: event === "exception" ? "review_required" : event === "delivered" ? "awaiting_proof_upload" : "room_open",
    canPublish: event !== "delivered",
    nextAction: event === "exception" ? "dispatcher_review" : event === "delivered" ? "upload_proof" : "join_room"
  };
}
