import crypto from "node:crypto";
import type {
  Answer,
  PendingQuestion,
  PlaybackState,
  PlayerMessage,
  SegmentInput,
  ServerMessage,
  Walkthrough,
  WalkthroughEvent,
} from "@chmh/shared";
import { log } from "./log.js";
import * as store from "./store.js";
import { synthesizeCached } from "./tts/index.js";

type Broadcaster = (msg: ServerMessage) => void;

export class WalkthroughSession {
  walkthrough: Walkthrough;
  playback: PlaybackState;

  private eventQueue: WalkthroughEvent[] = [];
  private eventWaiters: ((e: WalkthroughEvent) => void)[] = [];
  private broadcasters = new Set<Broadcaster>();

  constructor(walkthrough: Walkthrough, opts: { claudeConnected: boolean }) {
    this.walkthrough = walkthrough;
    this.playback = {
      walkthroughId: walkthrough.id,
      status: "loading",
      currentSegmentIndex: 0,
      audioReady: walkthrough.segments
        .filter((s) => s.audioFile)
        .map((s) => s.id),
      claudeConnected: opts.claudeConnected,
    };
  }

  // ---------- state sync ----------

  subscribe(b: Broadcaster): () => void {
    this.broadcasters.add(b);
    b(this.stateMessage());
    return () => this.broadcasters.delete(b);
  }

  stateMessage(): ServerMessage {
    return { type: "state", walkthrough: this.walkthrough, playback: this.playback };
  }

  private broadcast(msg?: ServerMessage): void {
    const m = msg ?? this.stateMessage();
    for (const b of this.broadcasters) b(m);
  }

  setClaudeConnected(connected: boolean): void {
    if (this.playback.claudeConnected === connected) return;
    this.playback.claudeConnected = connected;
    this.broadcast();
  }

  // ---------- TTS generation ----------

  /** Generate narration audio for all segments missing it, in order.
   * Broadcasts state after each segment so playback can start early. */
  async generateAudio(): Promise<void> {
    for (const seg of this.walkthrough.segments) {
      if (seg.audioFile) continue;
      try {
        const res = await synthesizeCached(
          seg.narration,
          store.audioDir(this.walkthrough.id)
        );
        seg.audioFile = res.file;
        seg.audioDurationMs = res.durationMs;
        this.playback.audioReady.push(seg.id);
        if (this.playback.status === "loading") this.playback.status = "playing";
        await store.saveManifest(this.walkthrough);
        this.broadcast();
      } catch (err) {
        log(`TTS failed for segment ${seg.id}:`, err);
      }
    }
  }

  // ---------- player messages ----------

  handlePlayerMessage(msg: PlayerMessage): void {
    switch (msg.type) {
      case "hello":
        break;
      case "progress":
        this.playback.currentSegmentIndex = Math.max(
          0,
          Math.min(msg.segmentIndex, this.walkthrough.segments.length - 1)
        );
        void store.saveProgress(this.walkthrough.id, {
          currentSegmentIndex: this.playback.currentSegmentIndex,
          completed: false,
        });
        this.broadcast();
        break;
      case "control":
        this.handleControl(msg.action);
        break;
      case "question":
        this.handleQuestion(msg.text, msg.segmentId);
        break;
    }
  }

  private handleControl(action: "play" | "pause" | "resume" | "completed"): void {
    if (action === "completed") {
      this.playback.status = "completed";
      void store.saveProgress(this.walkthrough.id, {
        currentSegmentIndex: this.playback.currentSegmentIndex,
        completed: true,
      });
      this.pushEvent({ type: "completed" });
    } else if (action === "pause") {
      if (this.playback.status === "playing") this.playback.status = "paused";
    } else if (action === "play" || action === "resume") {
      if (
        this.playback.status === "paused" ||
        this.playback.status === "answering" ||
        this.playback.status === "completed"
      ) {
        this.playback.status = "playing";
        this.playback.pendingQuestion = undefined;
      }
    }
    this.broadcast();
  }

  private handleQuestion(text: string, segmentId: string): void {
    const index = this.walkthrough.segments.findIndex((s) => s.id === segmentId);
    const segment = this.walkthrough.segments[index] ?? this.walkthrough.segments[0];
    const q: PendingQuestion = {
      questionId: `q-${crypto.randomBytes(4).toString("hex")}`,
      text,
      segmentId: segment.id,
      askedAt: new Date().toISOString(),
    };
    this.playback.status = "question_pending";
    this.playback.pendingQuestion = q;
    this.broadcast();
    this.pushEvent({
      type: "question",
      questionId: q.questionId,
      text: q.text,
      segment: { id: segment.id, title: segment.title, index: Math.max(index, 0) },
    });
  }

  // ---------- Claude-facing (MCP) ----------

  private pushEvent(e: WalkthroughEvent): void {
    const waiter = this.eventWaiters.shift();
    if (waiter) waiter(e);
    else this.eventQueue.push(e);
  }

  /** Long-poll: resolves with the next event, or {type:"none"} after timeout. */
  awaitEvent(timeoutMs: number): Promise<WalkthroughEvent> {
    const queued = this.eventQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const i = this.eventWaiters.indexOf(waiter);
        if (i >= 0) this.eventWaiters.splice(i, 1);
        resolve({ type: "none" });
      }, timeoutMs);
      const waiter = (e: WalkthroughEvent) => {
        clearTimeout(timer);
        resolve(e);
      };
      this.eventWaiters.push(waiter);
    });
  }

  async answerQuestion(questionId: string, answerText: string): Promise<void> {
    const q = this.playback.pendingQuestion;
    if (!q || q.questionId !== questionId) {
      throw new Error(
        `No pending question with id ${questionId}` +
          (q ? ` (pending is ${q.questionId})` : "")
      );
    }
    let audioUrl: string | undefined;
    try {
      const res = await synthesizeCached(
        answerText,
        store.audioDir(this.walkthrough.id)
      );
      audioUrl = `/audio/${this.walkthrough.id}/${res.file}`;
    } catch (err) {
      log("TTS failed for answer:", err);
    }
    const answer: Answer = {
      questionId,
      question: q.text,
      text: answerText,
      audioUrl,
    };
    this.playback.status = "answering";
    this.playback.lastAnswer = answer;
    this.broadcast();
    this.broadcast({ type: "answer", answer });
  }

  /** Insert, append, or replace segments, then generate any missing audio.
   * Only the new/changed segments get TTS — everything else keeps its cached
   * audio, so playback never has to be recreated.
   * insertAfterSegmentId: "" inserts at the start, undefined appends. */
  async updateSegments(
    inputs: SegmentInput[],
    insertAfterSegmentId?: string
  ): Promise<void> {
    const segs = this.walkthrough.segments;
    let insertPos: number | undefined;
    if (insertAfterSegmentId !== undefined) {
      if (insertAfterSegmentId === "") {
        insertPos = 0;
      } else {
        const anchor = segs.findIndex((s) => s.id === insertAfterSegmentId);
        if (anchor < 0)
          throw new Error(`Unknown anchor segment: ${insertAfterSegmentId}`);
        insertPos = anchor + 1;
      }
    }
    let nextNum = segs.length + 1;
    for (const input of inputs) {
      const id = input.id ?? `seg-${nextNum++}-${crypto.randomBytes(2).toString("hex")}`;
      const existing = segs.findIndex((s) => s.id === id);
      const seg = { ...input, id, audioFile: undefined, audioDurationMs: undefined };
      if (existing >= 0) {
        segs[existing] = seg;
        this.playback.audioReady = this.playback.audioReady.filter((x) => x !== id);
      } else if (insertPos !== undefined) {
        segs.splice(insertPos, 0, seg);
        if (insertPos <= this.playback.currentSegmentIndex) {
          this.playback.currentSegmentIndex += 1;
        }
        insertPos += 1;
      } else {
        segs.push(seg);
      }
    }
    if (this.playback.status === "completed") this.playback.status = "paused";
    await store.saveManifest(this.walkthrough);
    this.broadcast();
    void this.generateAudio();
  }
}

// ---------- manager ----------

class SessionManager {
  private sessions = new Map<string, WalkthroughSession>();
  private activeId: string | null = null;
  claudeConnected = false;

  setClaudeConnected(connected: boolean): void {
    this.claudeConnected = connected;
    for (const s of this.sessions.values()) s.setClaudeConnected(connected);
  }

  async create(title: string, inputs: SegmentInput[]): Promise<WalkthroughSession> {
    const id = `wt-${new Date().toISOString().slice(0, 10)}-${crypto
      .randomBytes(3)
      .toString("hex")}`;
    const walkthrough: Walkthrough = {
      id,
      title,
      createdAt: new Date().toISOString(),
      segments: inputs.map((s, i) => ({ ...s, id: s.id ?? `seg-${i + 1}` })),
    };
    await store.saveManifest(walkthrough);
    const session = new WalkthroughSession(walkthrough, {
      claudeConnected: this.claudeConnected,
    });
    this.sessions.set(id, session);
    this.activeId = id;
    void session.generateAudio();
    return session;
  }

  get(id: string): WalkthroughSession | undefined {
    return this.sessions.get(id);
  }

  getActive(): WalkthroughSession | undefined {
    return this.activeId ? this.sessions.get(this.activeId) : undefined;
  }

  /** Resume the most recent walkthrough from disk (e.g. after a restart). */
  async loadLatest(): Promise<WalkthroughSession | undefined> {
    const active = this.getActive();
    if (active) return active;
    const w = await store.findLatest();
    if (!w) return undefined;
    const session = new WalkthroughSession(w, {
      claudeConnected: this.claudeConnected,
    });
    const progress = await store.loadProgress(w.id);
    if (progress) {
      session.playback.currentSegmentIndex = progress.currentSegmentIndex;
      session.playback.status = progress.completed ? "completed" : "paused";
    } else if (session.playback.audioReady.length > 0) {
      session.playback.status = "paused";
    }
    this.sessions.set(w.id, session);
    this.activeId = w.id;
    void session.generateAudio();
    return session;
  }
}

export const sessions = new SessionManager();
