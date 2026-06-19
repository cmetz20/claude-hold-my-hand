import type { Presentation, ServerMessage } from "@chmh/shared";

export interface TTSResult {
  /** Filename within the presentation's audio dir (not a full path or URL). */
  filePath: string;
  durationMs: number;
}

export interface ITTSEngine {
  /** Synthesize `text` into `audioDir`, returning the cached filename. */
  synthesize(text: string, audioDir: string): Promise<TTSResult>;
}

export interface IBroadcaster {
  broadcast(msg: ServerMessage): void;
  /** Register a listener; returns an unsubscribe function. */
  subscribe(fn: (msg: ServerMessage) => void): () => void;
  readonly clientCount: number;
}

export interface IStore {
  saveManifest(presentation: Presentation): Promise<void>;
  loadManifest(id: string): Promise<Presentation | null>;
  saveProgress(
    id: string,
    progress: { currentSegmentIndex: number; completed: boolean },
  ): Promise<void>;
  loadProgress(
    id: string,
  ): Promise<{ currentSegmentIndex: number; completed: boolean } | null>;
  audioDir(id: string): string;
  pruneOld(): Promise<void>;
}
