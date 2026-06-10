import fs from "node:fs/promises";

export interface TtsEngine {
  name: string;
  /** A short id mixed into audio cache keys (engine + voice). */
  cacheKey: string;
  available(): Promise<boolean>;
  synthesize(text: string, outWavPath: string): Promise<void>;
}

/** Duration of a PCM WAV file, read from its RIFF header. */
export async function wavDurationMs(file: string): Promise<number> {
  const buf = await fs.readFile(file);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return 0;
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      byteRate = buf.readUInt32LE(offset + 16);
    } else if (chunkId === "data" && byteRate > 0) {
      return Math.round((chunkSize / byteRate) * 1000);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return 0;
}
