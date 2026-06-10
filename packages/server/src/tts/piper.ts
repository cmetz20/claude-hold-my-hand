import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { piperDir } from "../paths.js";
import type { TtsEngine } from "./engine.js";

/** Piper neural TTS — used automatically when tools/piper/ contains
 * piper.exe and a voice model (run `npm run setup:piper`). */
export class PiperEngine implements TtsEngine {
  name = "piper";
  cacheKey = "piper";
  private exe = path.join(piperDir, "piper.exe");
  private model: string | null = null;

  async available(): Promise<boolean> {
    try {
      await fs.access(this.exe);
      const files = await fs.readdir(piperDir);
      const model = files.find((f) => f.endsWith(".onnx"));
      if (!model) return false;
      this.model = path.join(piperDir, model);
      this.cacheKey = `piper-${model}`;
      return true;
    } catch {
      return false;
    }
  }

  async synthesize(text: string, outWavPath: string): Promise<void> {
    if (!this.model) throw new Error("Piper model not resolved");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.exe,
        ["--model", this.model!, "--output_file", outWavPath],
        { stdio: ["pipe", "ignore", "pipe"], cwd: piperDir }
      );
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`piper exited ${code}: ${stderr.slice(0, 500)}`))
      );
      child.stdin.write(text);
      child.stdin.end();
    });
  }
}
