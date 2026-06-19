import { createContext } from "./context.js";
import { startMcpServer } from "./mcp.js";
import { log } from "./log.js";

async function main(): Promise<void> {
  const ctx = await createContext();
  await startMcpServer(ctx.tools);
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
