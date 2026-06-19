import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { PresentationSchema, type Presentation } from "@chmh/shared";
import type { IStore } from "./interfaces.js";

export interface FileStoreOptions {
  /** Number of most-recent presentations always kept by pruneOld. */
  keep?: number;
  /** Presentations beyond `keep` older than this are deleted by pruneOld. */
  maxAgeDays?: number;
}

interface Progress {
  currentSegmentIndex: number;
  completed: boolean;
}

/**
 * Disk-backed store. Layout under baseDir:
 *   <id>/manifest.json   — full Presentation
 *   <id>/progress.json   — { currentSegmentIndex, completed }
 *   <id>/audio/*.wav     — cached TTS output
 */
export class FileStore implements IStore {
  private readonly keep: number;
  private readonly maxAgeMs: number;

  constructor(
    private readonly baseDir: string,
    opts: FileStoreOptions = {},
  ) {
    this.keep = opts.keep ?? Number(process.env.CHMH_KEEP ?? 5);
    const days = opts.maxAgeDays ?? Number(process.env.CHMH_MAX_AGE_DAYS ?? 14);
    this.maxAgeMs = days * 24 * 60 * 60 * 1000;
  }

  private dir(id: string): string {
    return join(this.baseDir, id);
  }

  audioDir(id: string): string {
    return join(this.dir(id), "audio");
  }

  async saveManifest(presentation: Presentation): Promise<void> {
    await mkdir(this.dir(presentation.id), { recursive: true });
    await writeFile(
      join(this.dir(presentation.id), "manifest.json"),
      JSON.stringify(presentation, null, 2),
      "utf8",
    );
  }

  async loadManifest(id: string): Promise<Presentation | null> {
    try {
      const raw = await readFile(join(this.dir(id), "manifest.json"), "utf8");
      return PresentationSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async saveProgress(id: string, progress: Progress): Promise<void> {
    await mkdir(this.dir(id), { recursive: true });
    await writeFile(
      join(this.dir(id), "progress.json"),
      JSON.stringify(progress),
      "utf8",
    );
  }

  async loadProgress(id: string): Promise<Progress | null> {
    try {
      const raw = await readFile(join(this.dir(id), "progress.json"), "utf8");
      return JSON.parse(raw) as Progress;
    } catch {
      return null;
    }
  }

  async pruneOld(): Promise<void> {
    let entries;
    try {
      entries = await readdir(this.baseDir, { withFileTypes: true });
    } catch {
      return; // base dir doesn't exist yet — nothing to prune
    }

    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const withTime: { id: string; created: number }[] = [];
    for (const id of dirs) {
      const manifest = await this.loadManifest(id);
      let created = 0;
      if (manifest) {
        created = Date.parse(manifest.createdAt);
      } else {
        try {
          created = (await stat(this.dir(id))).mtimeMs;
        } catch {
          /* ignore */
        }
      }
      withTime.push({ id, created });
    }

    withTime.sort((a, b) => b.created - a.created);
    const now = Date.now();
    for (const candidate of withTime.slice(this.keep)) {
      if (now - candidate.created > this.maxAgeMs) {
        await rm(this.dir(candidate.id), { recursive: true, force: true });
      }
    }
  }
}
