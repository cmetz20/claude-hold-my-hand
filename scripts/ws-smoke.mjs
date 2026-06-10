// Smoke test: connect like the player, ask a question, expect an answer.
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:4923/ws");
const timeout = setTimeout(() => {
  console.error("FAIL: timed out waiting for answer");
  process.exit(1);
}, 30000);

let asked = false;
ws.on("open", () => ws.send(JSON.stringify({ type: "hello" })));
ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.type === "state" && !asked) {
    asked = true;
    const seg = msg.walkthrough.segments[2];
    console.log(`state ok: ${msg.walkthrough.id}, status=${msg.playback.status}, segments=${msg.walkthrough.segments.length}`);
    ws.send(JSON.stringify({ type: "control", action: "pause" }));
    ws.send(JSON.stringify({ type: "question", text: "Why was the grace window 30 seconds?", segmentId: seg.id }));
    console.log("question sent");
  } else if (msg.type === "answer") {
    console.log(`answer received: "${msg.answer.text.slice(0, 80)}..."`);
    console.log(`answer audio: ${msg.answer.audioUrl ?? "none"}`);
    ws.send(JSON.stringify({ type: "control", action: "resume" }));
    clearTimeout(timeout);
    console.log("PASS");
    ws.close();
    process.exit(0);
  }
});
ws.on("error", (e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
