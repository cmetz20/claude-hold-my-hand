import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "../log.js";
import { wavDurationMs, type TtsEngine } from "./engine.js";
import { PiperEngine } from "./piper.js";
import { SapiEngine } from "./sapi.js";

export { wavDurationMs };
export type { TtsEngine };

let engine: TtsEngine | null = null;

export async function getEngine(): Promise<TtsEngine> {
  if (engine) return engine;
  const piper = new PiperEngine();
  if (await piper.available()) {
    engine = piper;
  } else {
    const sapi = new SapiEngine();
    if (!(await sapi.available())) {
      throw new Error("No TTS engine available (need Windows SAPI or Piper)");
    }
    engine = sapi;
  }
  log(`TTS engine: ${engine.name}`);
  return engine;
}

export interface SynthesisResult {
  /** filename within audioDir */
  file: string;
  durationMs: number;
}

/** Synthesize with on-disk caching keyed by hash(engine voice + text).
 * Serialized through a simple queue — one synthesis at a time. */
let queue: Promise<unknown> = Promise.resolve();

export function synthesizeCached(
  text: string,
  audioDir: string
): Promise<SynthesisResult> {
  const task = queue.then(async () => {
    const eng = await getEngine();
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
    return { file, durationMs: await wavDurationMs(full) };
  });
  queue = task.catch(() => undefined);
  return task;
}
