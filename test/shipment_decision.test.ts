import test from "node:test";
import assert from "node:assert/strict";
import { decideHandoff } from "../src/shipment_decision.ts";

test("delivery awaits uploaded proof; an exception keeps the dispatcher speaking", () => {
  assert.throws(() => decideHandoff("delivered"), /proof key/);
  assert.deepEqual(decideHandoff("delivered", "pod-42"), {
    status: "awaiting_proof_upload", canPublish: false, nextAction: "upload_proof"
  });
  assert.throws(() => decideHandoff("exception", undefined, "  "), /reason/);
  assert.deepEqual(decideHandoff("exception", undefined, "Seal damaged"), {
    status: "review_required", canPublish: true, nextAction: "dispatcher_review"
  });
});
