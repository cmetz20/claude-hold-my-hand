import { useEffect, useRef, useState, useCallback } from "react";
import type {
  Answer,
  PlaybackState,
  PlayerMessage,
  ServerMessage,
  Walkthrough,
} from "@chmh/shared";

export interface SessionState {
  connected: boolean;
  noWalkthrough: boolean;
  walkthrough?: Walkthrough;
  playback?: PlaybackState;
  /** set when an answer arrives; cleared by the UI after handling */
  incomingAnswer?: Answer;
}

export function useSession(): {
  state: SessionState;
  send: (msg: PlayerMessage) => void;
  clearAnswer: () => void;
} {
  const [state, setState] = useState<SessionState>({
    connected: false,
    noWalkthrough: false,
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry = 0;

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        setState((s) => ({ ...s, connected: true, noWalkthrough: false }));
        ws.send(JSON.stringify({ type: "hello" } satisfies PlayerMessage));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === "state") {
          setState((s) => ({
            ...s,
            walkthrough: msg.walkthrough,
            playback: msg.playback,
          }));
        } else if (msg.type === "answer") {
          setState((s) => ({ ...s, incomingAnswer: msg.answer }));
        }
      };
      ws.onclose = (ev) => {
        wsRef.current = null;
        if (closed) return;
        if (ev.code === 4404) {
          setState((s) => ({ ...s, connected: false, noWalkthrough: true }));
        } else {
          setState((s) => ({ ...s, connected: false }));
        }
        retry += 1;
        setTimeout(connect, Math.min(1000 * retry, 5000));
      };
    }

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: PlayerMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const clearAnswer = useCallback(
    () => setState((s) => ({ ...s, incomingAnswer: undefined })),
    []
  );

  return { state, send, clearAnswer };
}
