import { randomUUID } from "node:crypto";
const response = await fetch("http://127.0.0.1:3000/handoffs", {
  method: "POST", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({requestId: randomUUID(), shipmentId: "pallet-42", identity: "driver-7",
    event: "delivered", proofKey: "pod-42"})
});
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));
console.log(JSON.stringify(result, null, 2));
