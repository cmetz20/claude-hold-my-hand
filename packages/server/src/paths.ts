import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root of this tool's installation (packages/server/dist -> 3 up). */
export const installRoot = path.resolve(here, "..", "..", "..");

/** Where walkthroughs are persisted. Defaults to the directory Claude Code
 * spawned us in, so each project keeps its own walkthroughs. */
export const dataDir =
  process.env.CHMH_DATA_DIR ?? path.resolve(process.cwd(), ".walkthroughs");

export const port = Number(process.env.CHMH_PORT ?? 4923);

export const playerDist = path.resolve(installRoot, "packages", "player", "dist");

export const piperDir = path.resolve(installRoot, "tools", "piper");
