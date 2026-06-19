import type { ServerMessage } from "@chmh/shared";
import type { IBroadcaster } from "./interfaces.js";

/**
 * A session-scoped fan-out. Each presentation gets its own Broadcaster, so a
 * player subscribed to presentation A never receives presentation B's messages.
 */
export class Broadcaster implements IBroadcaster {
  private readonly subs = new Set<(msg: ServerMessage) => void>();

  broadcast(msg: ServerMessage): void {
    for (const fn of this.subs) {
      try {
        fn(msg);
      } catch {
        /* a dead listener must not break the others */
      }
    }
  }

  subscribe(fn: (msg: ServerMessage) => void): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  get clientCount(): number {
    return this.subs.size;
  }
}
