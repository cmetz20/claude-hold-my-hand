import { FileStore } from "./store.js";
import { CachingTTSEngine } from "./tts/index.js";
import { Broadcaster } from "./broadcaster.js";
import { SessionManager } from "./manager.js";
import { PresentationTools } from "./tools.js";
import { startHost, openBrowser, type HostHandle } from "./host.js";
import { dataDir, playerDist, preferredPort } from "./paths.js";

export interface ServerContext {
  manager: SessionManager;
  tools: PresentationTools;
  host: HostHandle;
  store: FileStore;
}

/** Assemble the full server: store + TTS + manager + host + tool handlers. */
export async function createContext(): Promise<ServerContext> {
  const store = new FileStore(dataDir);
  await store.pruneOld();

  const tts = new CachingTTSEngine();
  const manager = new SessionManager({
    tts,
    store,
    makeBroadcaster: () => new Broadcaster(),
  });

  const host = await startHost({ manager, dataDir, playerDist, preferredPort });

  const tools = new PresentationTools({
    manager,
    baseUrl: host.baseUrl,
    openBrowser,
  });

  return { manager, tools, host, store };
}
