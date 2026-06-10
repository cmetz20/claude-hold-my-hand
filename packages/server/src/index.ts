import { startHost } from "./host.js";
import { log } from "./log.js";
import { startMcpServer } from "./mcp.js";
import { pruneOld } from "./store.js";

async function main(): Promise<void> {
  await pruneOld();
  // Host starts eagerly so previously generated walkthroughs stay watchable
  // even before the first create_walkthrough call. A port conflict (another
  // project's instance) is non-fatal — tools will surface it if it matters.
  try {
    await startHost();
  } catch (err) {
    log("player host failed to start (continuing, MCP still available):", err);
  }
  await startMcpServer();
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
