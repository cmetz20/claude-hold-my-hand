import { randomBytes } from "node:crypto";
import {
  PresentationSettingsSchema,
  type Presentation,
  type PresentationSettings,
  type PlaybackState,
  type PendingQuestion,
  type Answer,
  type Segment,
  type SegmentInput,
  type PresentationEvent,
  type PlayerMessage,
  type CreatePresentationInput,
} from "@chmh/shared";
import type { ITTSEngine, IBroadcaster, IStore } from "./interfaces.js";

function genId(prefix: string): string {
  return `${prefix}-${randomBytes(3).toString("hex")}`;
}

function presentationId(): string {
  const d = new Date().toISOString().slice(0, 10);
  return `pr-${d}-${randomBytes(3).toString("hex")}`;
}

type EventWaiter = (event: PresentationEvent) => void;

export class PresentationSession {
  readonly presentation: Presentation;
  private playback: PlaybackState;
  private eventQueue: PresentationEvent[] = [];
  private eventWaiters: EventWaiter[] = [];

  constructor(
    presentation: Presentation,
    private readonly tts: ITTSEngine,
    private readonly broadcaster: IBroadcaster,
    private readonly store: IStore,
  ) {
    this.presentation = presentation;
    this.playback = {
      presentationId: presentation.id,
      status: "loading",
      currentSegmentIndex: 0,
      audioReady: [],
      claudeConnected: true,
    };
  }

  static create(
    input: CreatePresentationInput,
    tts: ITTSEngine,
    broadcaster: IBroadcaster,
    store: IStore,
  ): PresentationSession {
    const id = presentationId();
    const settings = PresentationSettingsSchema.parse(input.settings ?? {});
    const segments: Segment[] = input.segments.map((s) => ({
      ...s,
      id: s.id ?? genId("seg"),
    }));
    const presentation: Presentation = {
      id,
      title: input.title,
      intent: input.intent ?? "custom",
      settings,
      segments,
      createdAt: new Date().toISOString(),
    };
    return new PresentationSession(presentation, tts, broadcaster, store);
  }

  getPlaybackState(): PlaybackState {
    return { ...this.playback };
  }

  getPresentation(): Presentation {
    return this.presentation;
  }

  broadcastState(): void {
    this.broadcaster.broadcast({
      type: "state",
      presentation: this.presentation,
      playback: this.playback,
    });
  }

  /** Attach a player listener (the host wires a WebSocket here). */
  subscribe(fn: (msg: import("@chmh/shared").ServerMessage) => void): () => void {
    return this.broadcaster.subscribe(fn);
  }

  private get audioDir(): string {
    return this.store.audioDir(this.presentation.id);
  }

  async generateAudio(): Promise<void> {
    for (const segment of this.presentation.segments) {
      if (segment.audioFile) continue;
      const result = await this.tts.synthesize(segment.narration, this.audioDir);
      segment.audioFile = result.filePath;
      segment.audioDurationMs = result.durationMs;
      this.markAudioReady(segment.id);
      this.broadcastState();
    }
    await this.store.saveManifest(this.presentation);
  }

  private markAudioReady(id: string): void {
    if (!this.playback.audioReady.includes(id)) {
      this.playback.audioReady.push(id);
    }
  }

  handlePlayerMessage(msg: PlayerMessage): void {
    switch (msg.type) {
      case "hello":
        this.broadcastState();
        break;

      case "progress":
        this.playback.currentSegmentIndex = msg.segmentIndex;
        this.store.saveProgress(this.presentation.id, {
          currentSegmentIndex: msg.segmentIndex,
          completed: false,
        });
        // Echo so every connected player (and the ToC highlight) stays in sync.
        this.broadcastState();
        break;

      case "control":
        this.handleControl(msg.action);
        break;

      case "question":
        this.handleQuestion(msg.text, msg.segmentId);
        break;
    }
  }

  private handleControl(action: "play" | "pause" | "resume" | "completed") {
    switch (action) {
      case "play":
      case "resume":
        this.playback.status = "playing";
        break;
      case "pause":
        this.playback.status = "paused";
        break;
      case "completed":
        this.playback.status = "completed";
        this.pushEvent({ type: "completed" });
        this.store.saveProgress(this.presentation.id, {
          currentSegmentIndex: this.playback.currentSegmentIndex,
          completed: true,
        });
        break;
    }
    this.broadcastState();
  }

  private handleQuestion(text: string, segmentId: string) {
    const questionId = genId("q");
    const pending: PendingQuestion = {
      questionId,
      text,
      segmentId,
      askedAt: new Date().toISOString(),
    };
    this.playback.status = "question_pending";
    this.playback.pendingQuestion = pending;
    this.broadcastState();

    const seg = this.presentation.segments.find((s) => s.id === segmentId);
    const index = seg
      ? this.presentation.segments.indexOf(seg)
      : this.playback.currentSegmentIndex;

    this.pushEvent({
      type: "question",
      questionId,
      text,
      segment: {
        id: segmentId,
        title: seg?.title ?? "Unknown",
        index,
      },
    });
  }

  async awaitEvent(timeoutMs: number): Promise<PresentationEvent> {
    const queued = this.eventQueue.shift();
    if (queued) return queued;

    return new Promise<PresentationEvent>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.eventWaiters.indexOf(waiter);
        if (idx !== -1) this.eventWaiters.splice(idx, 1);
        resolve({ type: "none" });
      }, timeoutMs);

      const waiter: EventWaiter = (event) => {
        clearTimeout(timer);
        resolve(event);
      };
      this.eventWaiters.push(waiter);
    });
  }

  async answerQuestion(questionId: string, answerText: string): Promise<boolean> {
    const pending = this.playback.pendingQuestion;
    if (!pending || pending.questionId !== questionId) {
      // Stale or unknown question id — ignore rather than corrupt state or
      // clobber a newer pending question that arrived during synthesis.
      return false;
    }
    // Capture the question text before the await so a concurrent question
    // can't reattribute this answer.
    const questionText = pending.text;
    const ttsResult = await this.tts.synthesize(answerText, this.audioDir);
    const answer: Answer = {
      questionId,
      question: questionText,
      text: answerText,
      audioUrl: this.audioUrl(ttsResult.filePath),
    };
    this.playback.status = "answering";
    this.playback.pendingQuestion = undefined;
    this.playback.lastAnswer = answer;
    this.broadcaster.broadcast({ type: "answer", answer });
    this.broadcastState();
    return true;
  }

  /** Map a stored audio filename to the URL the player fetches it from. */
  private audioUrl(filename: string): string {
    return `/audio/${this.presentation.id}/${filename}`;
  }

  async addSegments(
    inputs: SegmentInput[],
    insertAfterSegmentId?: string,
  ): Promise<number> {
    const segments = this.presentation.segments;
    const toSynth: Segment[] = [];
    const newSegments: Segment[] = [];

    // An input whose id matches an existing segment REPLACES it in place
    // (audio reset so the new narration is re-synthesized). Everything else is
    // a genuinely new segment to be inserted at the requested position.
    for (const input of inputs) {
      if (input.id) {
        const existingIdx = segments.findIndex((s) => s.id === input.id);
        if (existingIdx !== -1) {
          const replaced: Segment = { ...input, id: input.id };
          segments[existingIdx] = replaced;
          this.playback.audioReady = this.playback.audioReady.filter(
            (x) => x !== replaced.id,
          );
          toSynth.push(replaced);
          continue;
        }
      }
      const created: Segment = { ...input, id: input.id ?? genId("seg") };
      newSegments.push(created);
      toSynth.push(created);
    }

    if (newSegments.length > 0) {
      let insertPos: number;
      if (insertAfterSegmentId === "") {
        insertPos = 0;
      } else if (insertAfterSegmentId !== undefined) {
        const idx = segments.findIndex((s) => s.id === insertAfterSegmentId);
        insertPos = idx !== -1 ? idx + 1 : segments.length;
      } else {
        insertPos = segments.length;
      }
      segments.splice(insertPos, 0, ...newSegments);
      // Keep the viewer anchored to the same segment if we inserted at or
      // before their current position.
      if (insertPos <= this.playback.currentSegmentIndex) {
        this.playback.currentSegmentIndex += newSegments.length;
      }
    }

    if (this.playback.status === "completed") {
      this.playback.status = "paused";
    }

    this.broadcastState();
    await this.store.saveManifest(this.presentation);

    for (const seg of toSynth) {
      if (seg.audioFile) continue;
      const result = await this.tts.synthesize(seg.narration, this.audioDir);
      seg.audioFile = result.filePath;
      seg.audioDurationMs = result.durationMs;
      this.markAudioReady(seg.id);
      this.broadcastState();
    }

    return segments.length;
  }

  updateSettings(partial: Partial<PresentationSettings>): PresentationSettings {
    const merged = PresentationSettingsSchema.parse({
      ...this.presentation.settings,
      ...partial,
    });
    (this.presentation as { settings: PresentationSettings }).settings = merged;
    this.broadcastState();
    return merged;
  }

  private pushEvent(event: PresentationEvent): void {
    const waiter = this.eventWaiters.shift();
    if (waiter) {
      waiter(event);
    } else {
      this.eventQueue.push(event);
    }
  }
}
