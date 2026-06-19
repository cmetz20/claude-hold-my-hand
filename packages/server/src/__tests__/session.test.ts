import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PresentationSettingsSchema,
  type Presentation,
  type ServerMessage,
  type SegmentInput,
} from "@chmh/shared";
import { PresentationSession } from "../session.js";
import type { ITTSEngine, IBroadcaster, IStore, TTSResult } from "../interfaces.js";

// ── Mocks ─────────────────────────────────────────────────────

function mockTTS(): ITTSEngine {
  let callCount = 0;
  return {
    synthesize: vi.fn(async (_text: string): Promise<TTSResult> => {
      callCount++;
      return { filePath: `audio-${callCount}.wav`, durationMs: 3000 };
    }),
  };
}

function mockBroadcaster(): IBroadcaster & { messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return {
    messages,
    clientCount: 1,
    broadcast: vi.fn((msg: ServerMessage) => {
      messages.push(msg);
    }),
    subscribe: vi.fn(() => () => {}),
  };
}

function mockStore(): IStore {
  const manifests = new Map<string, Presentation>();
  const progress = new Map<
    string,
    { currentSegmentIndex: number; completed: boolean }
  >();
  return {
    saveManifest: vi.fn(async (p: Presentation) => {
      manifests.set(p.id, p);
    }),
    loadManifest: vi.fn(async (id: string) => manifests.get(id) ?? null),
    saveProgress: vi.fn(async (id, prog) => {
      progress.set(id, prog);
    }),
    loadProgress: vi.fn(async (id) => progress.get(id) ?? null),
    audioDir: vi.fn((id: string) => `/tmp/audio/${id}`),
    pruneOld: vi.fn(async () => {}),
  };
}

function titleSegmentInput(overrides: Partial<SegmentInput> = {}): SegmentInput {
  return {
    title: "Intro",
    narration: "Welcome to this presentation.",
    visual: { kind: "title", heading: "Welcome" },
    ...overrides,
  };
}

function createTestSession(opts?: {
  tts?: ITTSEngine;
  broadcaster?: IBroadcaster;
  store?: IStore;
  segments?: SegmentInput[];
}) {
  const tts = opts?.tts ?? mockTTS();
  const broadcaster = opts?.broadcaster ?? mockBroadcaster();
  const store = opts?.store ?? mockStore();
  const segments = opts?.segments ?? [titleSegmentInput()];

  const session = PresentationSession.create(
    { title: "Test Presentation", segments },
    tts,
    broadcaster,
    store,
  );
  return { session, tts, broadcaster: broadcaster as ReturnType<typeof mockBroadcaster>, store };
}

// ── Tests ─────────────────────────────────────────────────────

describe("PresentationSession", () => {
  describe("creation", () => {
    it("creates with loading status", () => {
      const { session } = createTestSession();
      const state = session.getPlaybackState();
      expect(state.status).toBe("loading");
      expect(state.currentSegmentIndex).toBe(0);
      expect(state.claudeConnected).toBe(true);
      expect(state.audioReady).toEqual([]);
    });

    it("assigns a presentation ID", () => {
      const { session } = createTestSession();
      expect(session.getPresentation().id).toMatch(/^pr-\d{4}-\d{2}-\d{2}-[a-f0-9]+$/);
    });

    it("assigns segment IDs when not provided", () => {
      const { session } = createTestSession();
      const seg = session.getPresentation().segments[0];
      expect(seg.id).toMatch(/^seg-[a-f0-9]+$/);
    });

    it("preserves explicit segment IDs", () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "my-seg" })],
      });
      expect(session.getPresentation().segments[0].id).toBe("my-seg");
    });

    it("uses default settings when none provided", () => {
      const { session } = createTestSession();
      const settings = session.getPresentation().settings;
      expect(settings.verbosity).toBe("standard");
      expect(settings.depth).toBe("standard");
      expect(settings.audience).toBe("intermediate");
      expect(settings.voiceSpeed).toBe(1.0);
      expect(settings.autoPlay).toBe(true);
    });

    it("defaults intent to custom", () => {
      const { session } = createTestSession();
      expect(session.getPresentation().intent).toBe("custom");
    });

    it("preserves segment section labels (ToC derived by player)", () => {
      const { session } = createTestSession({
        segments: [
          titleSegmentInput({ section: "Overview" }),
          titleSegmentInput({ title: "Details", section: "Deep Dive" }),
        ],
      });
      const segs = session.getPresentation().segments;
      expect(segs[0].section).toBe("Overview");
      expect(segs[1].section).toBe("Deep Dive");
    });
  });

  describe("audio generation", () => {
    it("generates audio for all segments", async () => {
      const { session, tts, broadcaster } = createTestSession({
        segments: [
          titleSegmentInput(),
          titleSegmentInput({ title: "Second" }),
        ],
      });

      await session.generateAudio();

      expect(tts.synthesize).toHaveBeenCalledTimes(2);
      const segs = session.getPresentation().segments;
      expect(segs[0].audioFile).toBe("audio-1.wav");
      expect(segs[0].audioDurationMs).toBe(3000);
      expect(segs[1].audioFile).toBe("audio-2.wav");
    });

    it("broadcasts state after each segment", async () => {
      const { session, broadcaster } = createTestSession({
        segments: [
          titleSegmentInput(),
          titleSegmentInput({ title: "Second" }),
        ],
      });

      await session.generateAudio();

      const stateMessages = broadcaster.messages.filter(
        (m) => m.type === "state",
      );
      expect(stateMessages.length).toBe(2);
    });

    it("skips segments that already have audio", async () => {
      const { session, tts } = createTestSession({
        segments: [titleSegmentInput({ id: "pre-cached" })],
      });

      session.getPresentation().segments[0].audioFile = "existing.wav";
      await session.generateAudio();

      expect(tts.synthesize).not.toHaveBeenCalled();
    });

    it("saves manifest after generation", async () => {
      const { session, store } = createTestSession();
      await session.generateAudio();
      expect(store.saveManifest).toHaveBeenCalled();
    });
  });

  describe("player messages", () => {
    it("broadcasts state on hello", () => {
      const { session, broadcaster } = createTestSession();
      session.handlePlayerMessage({ type: "hello" });
      expect(broadcaster.broadcast).toHaveBeenCalled();
    });

    it("updates segment index on progress and broadcasts the new state", () => {
      const { session, store, broadcaster } = createTestSession({
        segments: [
          titleSegmentInput(),
          titleSegmentInput({ title: "Second" }),
        ],
      });
      broadcaster.messages.length = 0;

      session.handlePlayerMessage({ type: "progress", segmentIndex: 1 });
      expect(session.getPlaybackState().currentSegmentIndex).toBe(1);
      expect(store.saveProgress).toHaveBeenCalledWith(
        session.getPresentation().id,
        { currentSegmentIndex: 1, completed: false },
      );
      // Without this echo, ToC clicks and multi-client sync silently break.
      const state = broadcaster.messages.find((m) => m.type === "state");
      expect(state).toBeDefined();
      if (state?.type === "state") {
        expect(state.playback.currentSegmentIndex).toBe(1);
      }
    });

    it("updates status on play control", () => {
      const { session } = createTestSession();
      session.handlePlayerMessage({ type: "control", action: "play" });
      expect(session.getPlaybackState().status).toBe("playing");
    });

    it("updates status on pause control", () => {
      const { session } = createTestSession();
      session.handlePlayerMessage({ type: "control", action: "play" });
      session.handlePlayerMessage({ type: "control", action: "pause" });
      expect(session.getPlaybackState().status).toBe("paused");
    });

    it("updates status on resume control", () => {
      const { session } = createTestSession();
      session.handlePlayerMessage({ type: "control", action: "resume" });
      expect(session.getPlaybackState().status).toBe("playing");
    });

    it("sets completed and pushes event on completed control", () => {
      const { session, store } = createTestSession();
      session.handlePlayerMessage({ type: "control", action: "completed" });
      expect(session.getPlaybackState().status).toBe("completed");
      expect(store.saveProgress).toHaveBeenCalledWith(
        session.getPresentation().id,
        expect.objectContaining({ completed: true }),
      );
    });
  });

  describe("question flow", () => {
    it("sets question_pending when player asks a question", () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "seg-1" })],
      });

      session.handlePlayerMessage({ type: "control", action: "play" });
      session.handlePlayerMessage({
        type: "question",
        text: "What does this mean?",
        segmentId: "seg-1",
      });

      const state = session.getPlaybackState();
      expect(state.status).toBe("question_pending");
      expect(state.pendingQuestion).toBeDefined();
      expect(state.pendingQuestion?.text).toBe("What does this mean?");
      expect(state.pendingQuestion?.segmentId).toBe("seg-1");
    });

    it("question event is delivered to awaitEvent", async () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "seg-1" })],
      });

      const eventPromise = session.awaitEvent(5000);

      session.handlePlayerMessage({
        type: "question",
        text: "Why?",
        segmentId: "seg-1",
      });

      const event = await eventPromise;
      expect(event.type).toBe("question");
      if (event.type === "question") {
        expect(event.text).toBe("Why?");
        expect(event.segment.id).toBe("seg-1");
        expect(event.segment.index).toBe(0);
      }
    });

    it("answerQuestion generates TTS and broadcasts", async () => {
      const { session, tts, broadcaster } = createTestSession({
        segments: [titleSegmentInput({ id: "seg-1" })],
      });

      session.handlePlayerMessage({
        type: "question",
        text: "Why?",
        segmentId: "seg-1",
      });

      const questionId = session.getPlaybackState().pendingQuestion!.questionId;
      const ok = await session.answerQuestion(questionId, "Because it is better.");

      expect(ok).toBe(true);
      expect(tts.synthesize).toHaveBeenCalledWith(
        "Because it is better.",
        expect.any(String),
      );
      expect(session.getPlaybackState().status).toBe("answering");
      expect(session.getPlaybackState().pendingQuestion).toBeUndefined();
      expect(session.getPlaybackState().lastAnswer?.text).toBe(
        "Because it is better.",
      );

      const answerMsg = broadcaster.messages.find((m) => m.type === "answer");
      expect(answerMsg).toBeDefined();
    });

    it("builds answer audioUrl as a fetchable /audio path, not a bare filename", async () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "seg-1" })],
      });
      session.handlePlayerMessage({
        type: "question",
        text: "Why?",
        segmentId: "seg-1",
      });
      const questionId = session.getPlaybackState().pendingQuestion!.questionId;
      await session.answerQuestion(questionId, "Because.");

      const url = session.getPlaybackState().lastAnswer?.audioUrl;
      const id = session.getPresentation().id;
      expect(url).toBe(`/audio/${id}/audio-1.wav`);
    });

    it("ignores an answer with a stale or unknown questionId", async () => {
      const { session, tts } = createTestSession({
        segments: [titleSegmentInput({ id: "seg-1" })],
      });
      session.handlePlayerMessage({
        type: "question",
        text: "Why?",
        segmentId: "seg-1",
      });

      const ok = await session.answerQuestion("q-bogus", "Mismatched answer.");

      expect(ok).toBe(false);
      expect(tts.synthesize).not.toHaveBeenCalled();
      // The real pending question must survive an answer to the wrong id.
      expect(session.getPlaybackState().pendingQuestion).toBeDefined();
      expect(session.getPlaybackState().status).toBe("question_pending");
    });

    it("queued question is returned immediately by awaitEvent", async () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "seg-1" })],
      });

      session.handlePlayerMessage({
        type: "question",
        text: "What?",
        segmentId: "seg-1",
      });

      const event = await session.awaitEvent(5000);
      expect(event.type).toBe("question");
    });
  });

  describe("awaitEvent", () => {
    it("returns none on timeout", async () => {
      const { session } = createTestSession();
      const event = await session.awaitEvent(50);
      expect(event.type).toBe("none");
    });

    it("returns completed event when playback completes", async () => {
      const { session } = createTestSession();
      const eventPromise = session.awaitEvent(5000);

      session.handlePlayerMessage({ type: "control", action: "completed" });

      const event = await eventPromise;
      expect(event.type).toBe("completed");
    });
  });

  describe("addSegments", () => {
    it("appends segments by default", async () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "first" })],
      });

      const count = await session.addSegments([
        titleSegmentInput({ title: "Added" }),
      ]);

      expect(count).toBe(2);
      expect(session.getPresentation().segments).toHaveLength(2);
      expect(session.getPresentation().segments[1].title).toBe("Added");
    });

    it("prepends segments when insertAfterSegmentId is empty string", async () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "first", title: "First" })],
      });

      await session.addSegments(
        [titleSegmentInput({ title: "Prepended" })],
        "",
      );

      expect(session.getPresentation().segments[0].title).toBe("Prepended");
      expect(session.getPresentation().segments[1].title).toBe("First");
    });

    it("splices segments after a specific segment", async () => {
      const { session } = createTestSession({
        segments: [
          titleSegmentInput({ id: "a", title: "A" }),
          titleSegmentInput({ id: "c", title: "C" }),
        ],
      });

      await session.addSegments(
        [titleSegmentInput({ title: "B" })],
        "a",
      );

      const titles = session.getPresentation().segments.map((s) => s.title);
      expect(titles).toEqual(["A", "B", "C"]);
    });

    it("appends if insertAfterSegmentId not found", async () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "first", title: "First" })],
      });

      await session.addSegments(
        [titleSegmentInput({ title: "Fallback" })],
        "nonexistent",
      );

      expect(session.getPresentation().segments).toHaveLength(2);
      expect(session.getPresentation().segments[1].title).toBe("Fallback");
    });

    it("generates audio for new segments", async () => {
      const { session, tts } = createTestSession({
        segments: [titleSegmentInput({ id: "first" })],
      });

      await session.addSegments([titleSegmentInput({ title: "New" })]);
      expect(tts.synthesize).toHaveBeenCalledTimes(1);
    });

    it("resets completed status to paused", async () => {
      const { session } = createTestSession();
      session.handlePlayerMessage({ type: "control", action: "completed" });
      expect(session.getPlaybackState().status).toBe("completed");

      await session.addSegments([titleSegmentInput({ title: "Bonus" })]);
      expect(session.getPlaybackState().status).toBe("paused");
    });

    it("replaces a segment in place when input id matches existing", async () => {
      const { session } = createTestSession({
        segments: [
          titleSegmentInput({ id: "a", title: "A" }),
          titleSegmentInput({ id: "b", title: "B" }),
        ],
      });

      const count = await session.addSegments([
        titleSegmentInput({ id: "a", title: "A (revised)" }),
      ]);

      // Replacement does not grow the list and does not duplicate the id.
      expect(count).toBe(2);
      const segs = session.getPresentation().segments;
      expect(segs.filter((s) => s.id === "a")).toHaveLength(1);
      expect(segs[0].title).toBe("A (revised)");
    });

    it("re-synthesizes audio for a replaced segment", async () => {
      const { session, tts } = createTestSession({
        segments: [titleSegmentInput({ id: "a", title: "A" })],
      });
      await session.generateAudio();
      vi.clearAllMocks();

      await session.addSegments([
        titleSegmentInput({ id: "a", title: "A (revised)", narration: "New text." }),
      ]);

      expect(tts.synthesize).toHaveBeenCalledWith(
        "New text.",
        expect.any(String),
      );
    });

    it("keeps the viewer on the same segment when inserting before them", async () => {
      const { session } = createTestSession({
        segments: [
          titleSegmentInput({ id: "a", title: "A" }),
          titleSegmentInput({ id: "b", title: "B" }),
          titleSegmentInput({ id: "c", title: "C" }),
        ],
      });

      // Viewer is on segment "c" (index 2).
      session.handlePlayerMessage({ type: "progress", segmentIndex: 2 });

      // Prepend one segment — viewer should still be looking at "c".
      await session.addSegments([titleSegmentInput({ title: "New First" })], "");

      const state = session.getPlaybackState();
      expect(state.currentSegmentIndex).toBe(3);
      expect(session.getPresentation().segments[state.currentSegmentIndex].id).toBe("c");
    });

    it("does not shift the index when inserting after the viewer", async () => {
      const { session } = createTestSession({
        segments: [
          titleSegmentInput({ id: "a", title: "A" }),
          titleSegmentInput({ id: "b", title: "B" }),
        ],
      });
      session.handlePlayerMessage({ type: "progress", segmentIndex: 0 });

      await session.addSegments([titleSegmentInput({ title: "After B" })], "b");

      expect(session.getPlaybackState().currentSegmentIndex).toBe(0);
    });

    it("does not duplicate ids in audioReady on replace", async () => {
      const { session } = createTestSession({
        segments: [titleSegmentInput({ id: "a", title: "A" })],
      });
      await session.generateAudio();
      await session.addSegments([
        titleSegmentInput({ id: "a", title: "A (revised)" }),
      ]);

      const ready = session.getPlaybackState().audioReady;
      expect(ready.filter((x) => x === "a")).toHaveLength(1);
    });
  });

  describe("updateSettings", () => {
    it("merges partial settings", () => {
      const { session } = createTestSession();
      const updated = session.updateSettings({ voiceSpeed: 1.5 });
      expect(updated.voiceSpeed).toBe(1.5);
      expect(updated.verbosity).toBe("standard");
    });

    it("persists updated settings on the presentation", () => {
      const { session } = createTestSession();
      session.updateSettings({ audience: "beginner" });
      expect(session.getPresentation().settings.audience).toBe("beginner");
    });

    it("broadcasts state after update", () => {
      const { session, broadcaster } = createTestSession();
      broadcaster.messages.length = 0;
      session.updateSettings({ depth: "deep-dive" });
      expect(broadcaster.messages).toHaveLength(1);
    });
  });
});
