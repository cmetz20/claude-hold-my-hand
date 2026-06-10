import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { TtsEngine } from "./engine.js";

function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Windows built-in TTS via System.Speech — zero install, works everywhere. */
export class SapiEngine implements TtsEngine {
  name = "sapi";
  cacheKey = "sapi-default";

  async available(): Promise<boolean> {
    return process.platform === "win32";
  }

  async synthesize(text: string, outWavPath: string): Promise<void> {
    const tmp = path.join(
      os.tmpdir(),
      `chmh-tts-${crypto.randomBytes(6).toString("hex")}.txt`
    );
    await fs.writeFile(tmp, text, "utf8");
    const script = [
      "Add-Type -AssemblyName System.Speech;",
      `$t = [IO.File]::ReadAllText(${psQuote(tmp)}, [Text.Encoding]::UTF8);`,
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
      "$s.Rate = 0;",
      `$s.SetOutputToWaveFile(${psQuote(outWavPath)});`,
      "$s.Speak($t);",
      "$s.Dispose();",
    ].join(" ");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", script],
          { stdio: ["ignore", "ignore", "pipe"] }
        );
        let stderr = "";
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`SAPI TTS exited ${code}: ${stderr.slice(0, 500)}`))
        );
      });
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }
}
