import http from "node:http";
import { spawn } from "node:child_process";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import type { PlayerMessage, ServerMessage } from "@chmh/shared";
import { log } from "./log.js";
import { dataDir, playerDist, port } from "./paths.js";
import { sessions } from "./session.js";
import path from "node:path";

let server: http.Server | null = null;

export function playerUrl(): string {
  return `http://localhost:${port}/`;
}

export async function startHost(): Promise<void> {
  if (server) return;
  const app = express();

  // Narration/answer audio: .walkthroughs/<id>/audio/<file>
  app.get("/audio/:id/:file", (req, res) => {
    const { id, file } = req.params;
    if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+$/.test(file)) {
      res.status(400).end();
      return;
    }
    res.sendFile(path.join(dataDir, id, "audio", file));
  });

  app.use(express.static(playerDist));
  // SPA fallback
  app.get("*", (_req, res) => res.sendFile(path.join(playerDist, "index.html")));

  server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket) => {
    const session = sessions.getActive() ?? (await sessions.loadLatest());
    if (!session) {
      ws.close(4404, "no walkthrough available");
      return;
    }
    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const unsubscribe = session.subscribe(send);
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as PlayerMessage;
        session.handlePlayerMessage(msg);
      } catch (err) {
        log("bad player message:", err);
      }
    });
    ws.on("close", unsubscribe);
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(port, "127.0.0.1", () => resolve());
  });
  log(`player host listening on ${playerUrl()}`);
}

export function openBrowser(url: string): void {
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
