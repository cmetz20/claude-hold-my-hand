/**
 * Downloads Piper TTS (Windows build) and a default English neural voice into
 * tools/piper/. After this, the presentation server picks Piper over Windows
 * SAPI automatically. Run from the repo root: npm run setup:piper
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const piperDir = path.join(root, "tools", "piper");

const PIPER_ZIP_URL =
  "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const VOICE_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium";
const VOICE = "en_US-lessac-medium";

async function download(url, dest) {
  console.log(`downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  fs.mkdirSync(piperDir, { recursive: true });

  const exe = path.join(piperDir, "piper.exe");
  if (!fs.existsSync(exe)) {
    const zip = path.join(piperDir, "piper.zip");
    await download(PIPER_ZIP_URL, zip);
    console.log("extracting...");
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${piperDir}' -Force`,
    ]);
    // The zip contains a piper/ subfolder — flatten it.
    const nested = path.join(piperDir, "piper");
    if (fs.existsSync(nested)) {
      for (const f of fs.readdirSync(nested)) {
        fs.renameSync(path.join(nested, f), path.join(piperDir, f));
      }
      fs.rmdirSync(nested);
    }
    fs.rmSync(zip);
  } else {
    console.log("piper.exe already present");
  }

  for (const ext of [".onnx", ".onnx.json"]) {
    const dest = path.join(piperDir, `${VOICE}${ext}`);
    if (!fs.existsSync(dest)) {
      await download(`${VOICE_BASE}/${VOICE}${ext}?download=true`, dest);
    } else {
      console.log(`${VOICE}${ext} already present`);
    }
  }

  console.log(`\nPiper installed in ${piperDir}.`);
  console.log(
    "Restart the presentation server; it will pick Piper automatically.",
  );
}

main().catch((err) => {
  console.error("setup failed:", err.message ?? err);
  process.exit(1);
});
