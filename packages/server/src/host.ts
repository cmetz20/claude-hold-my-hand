import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { PlayerMessageSchema, type ServerMessage } from "@chmh/shared";
import { log } from "./log.js";
import type { SessionManager } from "./manager.js";

export interface HostOptions {
  manager: SessionManager;
  dataDir: string;
  playerDist: string;
  preferredPort: number;
}

export interface HostHandle {
  baseUrl: string;
  port: number;
  close(): Promise<void>;
}

function listen(srv: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => reject(err);
    srv.once("error", onError);
    srv.listen(port, "127.0.0.1", () => {
      srv.off("error", onError);
      resolve();
    });
  });
}

export async function startHost(opts: HostOptions): Promise<HostHandle> {
  const { manager, dataDir, playerDist, preferredPort } = opts;
  const app = express();

  // Narration / answer audio: <dataDir>/<id>/audio/<file>
  app.get("/audio/:id/:file", (req, res) => {
    const { id, file } = req.params;
    if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+$/.test(file)) {
      res.status(400).end();
      return;
    }
    res.sendFile(path.join(dataDir, id, "audio", file));
  });

  app.use(express.static(playerDist));
  app.get("*", (_req, res) => res.sendFile(path.join(playerDist, "index.html")));

  const server = http.createServer(app);

  // Bind first, attach the WebSocket server after — ws re-emits http server
  // errors and would crash the process during port-conflict retries.
  let boundPort = preferredPort;
  let lastErr: unknown;
  for (let p = preferredPort; p < preferredPort + 10; p++) {
    try {
      await listen(server, p);
      boundPort = p;
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") break;
    }
  }
  if (lastErr) throw lastErr;

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const id = url.searchParams.get("p");
    const session = id ? manager.get(id) : undefined;
    if (!session) {
      ws.close(4404, "no such presentation");
      return;
    }

    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const unsubscribe = session.subscribe(send);

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const result = PlayerMessageSchema.safeParse(parsed);
      if (result.success) session.handlePlayerMessage(result.data);
    });
    ws.on("close", unsubscribe);
  });

  const baseUrl = `http://localhost:${boundPort}`;
  log(`player host listening on ${baseUrl}/`);

  return {
    baseUrl,
    port: boundPort,
    close: () =>
      new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      }),
  };
}

export function openBrowser(url: string): void {
  if (process.env.CHMH_NO_OPEN) return;
  try {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (err) {
    log("could not open browser:", err);
  }
}
