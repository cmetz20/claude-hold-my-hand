import { PresentationSession } from "./session.js";
import type { ITTSEngine, IBroadcaster, IStore } from "./interfaces.js";
import type { CreatePresentationInput } from "@chmh/shared";

export interface SessionManagerDeps {
  tts: ITTSEngine;
  store: IStore;
  /**
   * Builds a fresh, session-scoped broadcaster. Each presentation gets its own
   * so a player connected to presentation A never receives presentation B's
   * state (finding #9 from the architecture review).
   */
  makeBroadcaster: () => IBroadcaster;
}

export class SessionManager {
  private readonly sessions = new Map<string, PresentationSession>();

  constructor(private readonly deps: SessionManagerDeps) {}

  create(input: CreatePresentationInput): PresentationSession {
    const broadcaster = this.deps.makeBroadcaster();
    const session = PresentationSession.create(
      input,
      this.deps.tts,
      broadcaster,
      this.deps.store,
    );
    this.sessions.set(session.getPresentation().id, session);
    return session;
  }

  get(id: string): PresentationSession | undefined {
    return this.sessions.get(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  list(): PresentationSession[] {
    return [...this.sessions.values()];
  }

  get size(): number {
    return this.sessions.size;
  }
}
