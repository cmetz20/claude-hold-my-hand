import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PresentationSettingsSchema,
  type Presentation,
} from "@chmh/shared";
import { FileStore } from "../store.js";

function makePresentation(id: string, daysAgo = 0): Presentation {
  const createdAt = new Date(
    Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    id,
    title: `Presentation ${id}`,
    intent: "custom",
    settings: PresentationSettingsSchema.parse({}),
    segments: [
      {
        id: "seg-1",
        title: "Intro",
        narration: "Hello.",
        visual: { kind: "title", heading: "Hi" },
      },
    ],
    createdAt,
  };
}

describe("FileStore", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "chmh-store-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  describe("manifest round-trip", () => {
    it("saves and loads a manifest", async () => {
      const store = new FileStore(baseDir);
      const p = makePresentation("pr-1");
      await store.saveManifest(p);

      const loaded = await store.loadManifest("pr-1");
      expect(loaded).toEqual(p);
    });

    it("returns null for a missing manifest", async () => {
      const store = new FileStore(baseDir);
      expect(await store.loadManifest("nope")).toBeNull();
    });

    it("returns null for a corrupt manifest", async () => {
      const store = new FileStore(baseDir);
      await mkdir(join(baseDir, "pr-bad"), { recursive: true });
      await writeFile(join(baseDir, "pr-bad", "manifest.json"), "{not json", "utf8");
      expect(await store.loadManifest("pr-bad")).toBeNull();
    });
  });

  describe("progress round-trip", () => {
    it("saves and loads progress", async () => {
      const store = new FileStore(baseDir);
      await store.saveProgress("pr-1", {
        currentSegmentIndex: 3,
        completed: false,
      });
      expect(await store.loadProgress("pr-1")).toEqual({
        currentSegmentIndex: 3,
        completed: false,
      });
    });

    it("returns null for missing progress", async () => {
      const store = new FileStore(baseDir);
      expect(await store.loadProgress("pr-1")).toBeNull();
    });
  });

  describe("audioDir", () => {
    it("returns the audio subdirectory path", () => {
      const store = new FileStore(baseDir);
      expect(store.audioDir("pr-1")).toBe(join(baseDir, "pr-1", "audio"));
    });
  });

  describe("pruneOld", () => {
    it("keeps the N newest and deletes older ones beyond the keep count", async () => {
      const store = new FileStore(baseDir, { keep: 2, maxAgeDays: 14 });
      await store.saveManifest(makePresentation("fresh-1", 0));
      await store.saveManifest(makePresentation("fresh-2", 1));
      await store.saveManifest(makePresentation("old-1", 30));
      await store.saveManifest(makePresentation("old-2", 40));

      await store.pruneOld();

      const remaining = (await readdir(baseDir)).sort();
      expect(remaining).toEqual(["fresh-1", "fresh-2"]);
    });

    it("keeps recent presentations even when beyond the keep count", async () => {
      const store = new FileStore(baseDir, { keep: 2, maxAgeDays: 14 });
      await store.saveManifest(makePresentation("fresh-1", 0));
      await store.saveManifest(makePresentation("fresh-2", 1));
      // Beyond keep=2, but only 5 days old (< 14) — must survive.
      await store.saveManifest(makePresentation("recent-3", 5));

      await store.pruneOld();

      const remaining = (await readdir(baseDir)).sort();
      expect(remaining).toEqual(["fresh-1", "fresh-2", "recent-3"]);
    });

    it("does nothing when base dir is empty", async () => {
      const store = new FileStore(baseDir, { keep: 2, maxAgeDays: 14 });
      await store.pruneOld();
      expect(await readdir(baseDir)).toEqual([]);
    });

    it("does not throw when base dir does not exist", async () => {
      const store = new FileStore(join(baseDir, "missing"), { keep: 2 });
      await expect(store.pruneOld()).resolves.toBeUndefined();
    });
  });
});
