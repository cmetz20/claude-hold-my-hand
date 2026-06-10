import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of this tool's installation. Works for both layouts:
 * - tsc build:      <root>/packages/server/dist/paths.js
 * - plugin bundle:  <root>/plugin-dist/server.mjs
 * Identified by walking up to the directory that contains the built player. */
function findInstallRoot(): string {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "packages", "player", "dist", "index.html"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to the tsc layout (3 levels up from packages/server/dist).
  return path.resolve(here, "..", "..", "..");
}

export const installRoot = findInstallRoot();

/** Where walkthroughs are persisted. Defaults to the directory Claude Code
 * spawned us in, so each project keeps its own walkthroughs. */
export const dataDir =
  process.env.CHMH_DATA_DIR ?? path.resolve(process.cwd(), ".walkthroughs");

export const preferredPort = Number(process.env.CHMH_PORT ?? 4923);

export const playerDist = path.resolve(installRoot, "packages", "player", "dist");

export const piperDir = path.resolve(installRoot, "tools", "piper");
