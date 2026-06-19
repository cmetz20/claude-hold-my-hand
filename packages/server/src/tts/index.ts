import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "../log.js";
import { wavDurationMs, type TtsEngine } from "./engine.js";
import { PiperEngine } from "./piper.js";
import { SapiEngine } from "./sapi.js";
import type { ITTSEngine, TTSResult } from "../interfaces.js";

export { wavDurationMs };
export type { TtsEngine };

/**
 * The real ITTSEngine. Resolves a concrete backend on first use (Piper if
 * installed, else Windows SAPI), caches synthesized audio on disk keyed by
 * hash(engine voice + text), and serializes synthesis through a one-at-a-time
 * queue so segments become playable one by one.
 */
export class CachingTTSEngine implements ITTSEngine {
  private engine: TtsEngine | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private async getEngine(): Promise<TtsEngine> {
    if (this.engine) return this.engine;
    const piper = new PiperEngine();
    if (await piper.available()) {
      this.engine = piper;
    } else {
      const sapi = new SapiEngine();
      if (!(await sapi.available())) {
        throw new Error("No TTS engine available (need Windows SAPI or Piper)");
      }
      this.engine = sapi;
    }
    log(`TTS engine: ${this.engine.name}`);
    return this.engine;
  }

  synthesize(text: string, audioDir: string): Promise<TTSResult> {
    const task = this.queue.then(async () => {
      const eng = await this.getEngine();
      const hash = crypto
        .createHash("sha1")
        .update(`${eng.cacheKey}\n${text}`)
        .digest("hex")
        .slice(0, 16);
      const file = `${hash}.wav`;
      const full = path.join(audioDir, file);
      try {
        await fs.access(full);
      } catch {
        await fs.mkdir(audioDir, { recursive: true });
        const tmp = `${full}.tmp.wav`;
        await eng.synthesize(text, tmp);
        await fs.rename(tmp, full);
      }
      return { filePath: file, durationMs: await wavDurationMs(full) };
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
