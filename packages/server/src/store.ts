import fs from "node:fs/promises";
import path from "node:path";
import { WalkthroughSchema, type Walkthrough } from "@chmh/shared";
import { dataDir } from "./paths.js";

export interface PersistedProgress {
  currentSegmentIndex: number;
  completed: boolean;
}

export function walkthroughDir(id: string): string {
  return path.join(dataDir, id);
}

export function audioDir(id: string): string {
  return path.join(walkthroughDir(id), "audio");
}

export async function saveManifest(w: Walkthrough): Promise<void> {
  const dir = walkthroughDir(w.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(w, null, 2),
    "utf8"
  );
}

export async function loadManifest(id: string): Promise<Walkthrough | null> {
  try {
    const raw = await fs.readFile(
      path.join(walkthroughDir(id), "manifest.json"),
      "utf8"
    );
    return WalkthroughSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveProgress(
  id: string,
  progress: PersistedProgress
): Promise<void> {
  try {
    await fs.writeFile(
      path.join(walkthroughDir(id), "progress.json"),
      JSON.stringify(progress),
      "utf8"
    );
  } catch {
    /* best-effort */
  }
}

export async function loadProgress(id: string): Promise<PersistedProgress | null> {
  try {
    const raw = await fs.readFile(
      path.join(walkthroughDir(id), "progress.json"),
      "utf8"
    );
    return JSON.parse(raw) as PersistedProgress;
  } catch {
    return null;
  }
}

/** Most recently created walkthrough on disk, if any. */
export async function findLatest(): Promise<Walkthrough | null> {
  try {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    let best: Walkthrough | null = null;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const w = await loadManifest(e.name);
      if (w && (!best || w.createdAt > best.createdAt)) best = w;
    }
    return best;
  } catch {
    return null;
  }
}
