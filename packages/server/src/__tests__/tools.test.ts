import { describe, it, expect, vi } from "vitest";
import type { ServerMessage, SegmentInput } from "@chmh/shared";
import { SessionManager } from "../manager.js";
import { PresentationTools } from "../tools.js";
import type {
  ITTSEngine,
  IBroadcaster,
  IStore,
  TTSResult,
} from "../interfaces.js";

// ── Mocks ─────────────────────────────────────────────────────

function mockTTS(): ITTSEngine {
  let n = 0;
  return {
    synthesize: vi.fn(async (): Promise<TTSResult> => {
      n++;
      return { filePath: `audio-${n}.wav`, durationMs: 3000 };
    }),
  };
}

function mockStore(): IStore {
  return {
    saveManifest: vi.fn(async () => {}),
    loadManifest: vi.fn(async () => null),
    saveProgress: vi.fn(async () => {}),
    loadProgress: vi.fn(async () => null),
    audioDir: vi.fn((id: string) => `/tmp/${id}/audio`),
    pruneOld: vi.fn(async () => {}),
  };
}

interface RecordingBroadcaster extends IBroadcaster {
  messages: ServerMessage[];
}

function mockBroadcaster(): RecordingBroadcaster {
  const messages: ServerMessage[] = [];
  return {
    messages,
    clientCount: 1,
    broadcast: vi.fn((m: ServerMessage) => {
      messages.push(m);
    }),
    subscribe: vi.fn(() => () => {}),
  };
}

function titleSegmentInput(overrides: Partial<SegmentInput> = {}): SegmentInput {
  return {
    title: "Intro",
    narration: "Welcome.",
    visual: { kind: "title", heading: "Welcome" },
    ...overrides,
  };
}

function setup() {
  const broadcasters: RecordingBroadcaster[] = [];
  const tts = mockTTS();
  const store = mockStore();
  const manager = new SessionManager({
    tts,
    store,
    makeBroadcaster: () => {
      const b = mockBroadcaster();
      broadcasters.push(b);
      return b;
    },
  });
  const tools = new PresentationTools({
    manager,
    baseUrl: "http://localhost:4923",
  });
  return { manager, tools, tts, store, broadcasters };
}

// ── Tests ─────────────────────────────────────────────────────

describe("PresentationTools", () => {
  describe("createPresentation", () => {
    it("creates a session and returns id, url, and count", async () => {
      const { tools, manager } = setup();
      const result = await tools.createPresentation({
        title: "My Talk",
        segments: [titleSegmentInput(), titleSegmentInput({ title: "Two" })],
      });

      expect(result.presentationId).toMatch(/^pr-/);
      expect(result.segmentCount).toBe(2);
      expect(result.playerUrl).toBe(
        `http://localhost:4923/?p=${result.presentationId}`,
      );
      expect(manager.has(result.presentationId)).toBe(true);
    });

    it("calls openBrowser with the player URL when provided", async () => {
      const openBrowser = vi.fn();
      const { manager } = setup();
      const tools = new PresentationTools({
        manager,
        baseUrl: "http://localhost:4923",
        openBrowser,
      });

      const result = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });

      expect(openBrowser).toHaveBeenCalledWith(result.playerUrl);
    });

    it("rejects invalid input", async () => {
      const { tools } = setup();
      await expect(
        tools.createPresentation({ title: "", segments: [] }),
      ).rejects.toThrow();
    });

    it("gives each presentation its own broadcaster (no cross-talk)", async () => {
      const { tools, manager, broadcasters } = setup();
      const a = await tools.createPresentation({
        title: "A",
        segments: [titleSegmentInput()],
      });
      const b = await tools.createPresentation({
        title: "B",
        segments: [titleSegmentInput()],
      });

      expect(broadcasters).toHaveLength(2);
      const [bcastA, bcastB] = broadcasters;
      bcastA.messages.length = 0;
      bcastB.messages.length = 0;

      // A question on presentation A must only reach A's broadcaster.
      manager.get(a.presentationId)!.handlePlayerMessage({
        type: "question",
        text: "A's question",
        segmentId: manager.get(a.presentationId)!.getPresentation().segments[0].id,
      });

      expect(bcastA.messages.length).toBeGreaterThan(0);
      expect(bcastB.messages.length).toBe(0);
    });
  });

  describe("addSegments", () => {
    it("delegates to the session and returns the new count", async () => {
      const { tools } = setup();
      const { presentationId } = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });

      const result = await tools.addSegments({
        presentationId,
        segments: [titleSegmentInput({ title: "Added" })],
      });

      expect(result).toEqual({ ok: true, segmentCount: 2 });
    });

    it("throws on unknown presentationId", async () => {
      const { tools } = setup();
      await expect(
        tools.addSegments({
          presentationId: "pr-nope",
          segments: [titleSegmentInput()],
        }),
      ).rejects.toThrow(/Unknown presentationId/);
    });
  });

  describe("awaitEvent", () => {
    it("returns none on timeout", async () => {
      const { tools } = setup();
      const { presentationId } = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });

      const event = await tools.awaitEvent({ presentationId, timeoutMs: 50 });
      expect(event.type).toBe("none");
    });

    it("returns a question event when the player asks", async () => {
      const { tools, manager } = setup();
      const { presentationId } = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });
      const segId = manager.get(presentationId)!.getPresentation().segments[0].id;

      const eventPromise = tools.awaitEvent({ presentationId, timeoutMs: 5000 });
      manager.get(presentationId)!.handlePlayerMessage({
        type: "question",
        text: "Why?",
        segmentId: segId,
      });

      const event = await eventPromise;
      expect(event.type).toBe("question");
    });

    it("throws on unknown presentationId", async () => {
      const { tools } = setup();
      await expect(
        tools.awaitEvent({ presentationId: "pr-nope" }),
      ).rejects.toThrow(/Unknown presentationId/);
    });
  });

  describe("answerQuestion", () => {
    it("returns ok true for a matching question", async () => {
      const { tools, manager } = setup();
      const { presentationId } = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });
      const session = manager.get(presentationId)!;
      const segId = session.getPresentation().segments[0].id;
      session.handlePlayerMessage({
        type: "question",
        text: "Why?",
        segmentId: segId,
      });
      const questionId = session.getPlaybackState().pendingQuestion!.questionId;

      const result = await tools.answerQuestion({
        presentationId,
        questionId,
        answer: "Because.",
      });
      expect(result).toEqual({ ok: true });
    });

    it("returns ok false for a stale questionId", async () => {
      const { tools, manager } = setup();
      const { presentationId } = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });
      const session = manager.get(presentationId)!;
      session.handlePlayerMessage({
        type: "question",
        text: "Why?",
        segmentId: session.getPresentation().segments[0].id,
      });

      const result = await tools.answerQuestion({
        presentationId,
        questionId: "q-bogus",
        answer: "Mismatched.",
      });
      expect(result).toEqual({ ok: false });
    });
  });

  describe("updateSettings", () => {
    it("merges a playback settings change", async () => {
      const { tools } = setup();
      const { presentationId } = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });

      const result = await tools.updateSettings({
        presentationId,
        settings: { voiceSpeed: 1.5 },
      });
      expect(result.ok).toBe(true);
      expect(result.settings.voiceSpeed).toBe(1.5);
      expect(result.settings.verbosity).toBe("standard");
    });

    it("rejects an authoring-time dial", async () => {
      const { tools } = setup();
      const { presentationId } = await tools.createPresentation({
        title: "Talk",
        segments: [titleSegmentInput()],
      });

      await expect(
        tools.updateSettings({
          presentationId,
          settings: { verbosity: "detailed" },
        }),
      ).rejects.toThrow();
    });

    it("throws on unknown presentationId", async () => {
      const { tools } = setup();
      await expect(
        tools.updateSettings({
          presentationId: "pr-nope",
          settings: { voiceSpeed: 1.2 },
        }),
      ).rejects.toThrow(/Unknown presentationId/);
    });
  });
});
