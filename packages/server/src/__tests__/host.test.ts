import { describe, it, expect, afterEach, vi } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";
import { WebSocket } from "ws";
import type { ServerMessage, SegmentInput } from "@chmh/shared";
import { SessionManager } from "../manager.js";
import { Broadcaster } from "../broadcaster.js";
import { startHost, type HostHandle } from "../host.js";
import type { ITTSEngine, IStore } from "../interfaces.js";

function mockTTS(): ITTSEngine {
  return {
    synthesize: vi.fn(async () => ({ filePath: "a.wav", durationMs: 1000 })),
  };
}

function mockStore(): IStore {
  return {
    saveManifest: vi.fn(async () => {}),
    loadManifest: vi.fn(async () => null),
    saveProgress: vi.fn(async () => {}),
    loadProgress: vi.fn(async () => null),
    audioDir: (id: string) => path.join(tmpdir(), id, "audio"),
    pruneOld: vi.fn(async () => {}),
  };
}

function titleSegment(): SegmentInput {
  return {
    title: "Intro",
    narration: "Hello there.",
    visual: { kind: "title", heading: "Hi" },
  };
}

/** Resolve with the next message matching `type`, or reject after 3s. */
function nextMessage(ws: WebSocket, type: ServerMessage["type"]): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} message`)), 3000);
    const onMsg = (raw: Buffer | string) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

let host: HostHandle | null = null;
const openSockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of openSockets) ws.close();
  openSockets.length = 0;
  await host?.close();
  host = null;
});

describe("host (live WebSocket)", () => {
  function makeManager() {
    return new SessionManager({
      tts: mockTTS(),
      store: mockStore(),
      makeBroadcaster: () => new Broadcaster(),
    });
  }

  async function start(manager: SessionManager): Promise<HostHandle> {
    const tmp = tmpdir();
    const port = 4700 + Math.floor(Math.random() * 800);
    host = await startHost({
      manager,
      dataDir: tmp,
      playerDist: tmp,
      preferredPort: port,
    });
    return host;
  }

  it("delivers state to a player connected with ?p=<id> and routes a question to Claude", async () => {
    const manager = makeManager();
    const session = manager.create({
      title: "Live",
      segments: [titleSegment()],
    });
    const id = session.getPresentation().id;
    const segId = session.getPresentation().segments[0].id;

    const h = await start(manager);
    const ws = new WebSocket(`${h.baseUrl.replace("http", "ws")}/ws?p=${id}`);
    openSockets.push(ws);
    await new Promise<void>((r) => ws.on("open", () => r()));

    // hello → server broadcasts current state
    const statePromise = nextMessage(ws, "state");
    ws.send(JSON.stringify({ type: "hello" }));
    const state = await statePromise;
    expect(state.type).toBe("state");

    // player asks a question → it surfaces to Claude via awaitEvent
    const eventPromise = session.awaitEvent(3000);
    ws.send(JSON.stringify({ type: "question", text: "Why?", segmentId: segId }));
    const event = await eventPromise;
    expect(event.type).toBe("question");

    // Claude answers → the player receives an answer message over the socket
    if (event.type === "question") {
      const answerPromise = nextMessage(ws, "answer");
      await session.answerQuestion(event.questionId, "Because reasons.");
      const answer = await answerPromise;
      expect(answer.type).toBe("answer");
      if (answer.type === "answer") {
        expect(answer.answer.text).toBe("Because reasons.");
        expect(answer.answer.audioUrl).toBe(`/audio/${id}/a.wav`);
      }
    }
  });

  it("rejects a connection for an unknown presentation id", async () => {
    const manager = makeManager();
    const h = await start(manager);
    const ws = new WebSocket(`${h.baseUrl.replace("http", "ws")}/ws?p=pr-nope`);
    openSockets.push(ws);

    const code = await new Promise<number>((resolve) => {
      ws.on("close", (c) => resolve(c));
    });
    expect(code).toBe(4404);
  });

  it("does not deliver one presentation's messages to another's player", async () => {
    const manager = makeManager();
    const a = manager.create({ title: "A", segments: [titleSegment()] });
    const b = manager.create({ title: "B", segments: [titleSegment()] });
    const h = await start(manager);

    const wsB = new WebSocket(`${h.baseUrl.replace("http", "ws")}/ws?p=${b.getPresentation().id}`);
    openSockets.push(wsB);
    await new Promise<void>((r) => wsB.on("open", () => r()));

    let bGotMessage = false;
    wsB.on("message", () => {
      bGotMessage = true;
    });

    // Drive presentation A; B's socket must stay silent.
    a.handlePlayerMessage({ type: "control", action: "play" });
    await new Promise((r) => setTimeout(r, 150));
    expect(bGotMessage).toBe(false);
  });
});
