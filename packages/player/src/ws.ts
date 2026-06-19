import { useCallback, useEffect, useRef, useState } from "react";
import {
  ServerMessageSchema,
  type Presentation,
  type PlaybackState,
  type Answer,
  type PlayerMessage,
} from "@chmh/shared";
import { demoPresentation } from "./demo.js";

export interface PlayerView {
  presentation: Presentation | null;
  playback: PlaybackState | null;
  incomingAnswer: Answer | null;
  connected: boolean;
  demo: boolean;
}

export interface PlayerApi {
  view: PlayerView;
  send: (msg: PlayerMessage) => void;
  goTo: (index: number) => void;
  clearAnswer: () => void;
}

function demoPlayback(index = 0): PlaybackState {
  return {
    presentationId: demoPresentation.id,
    status: "paused",
    currentSegmentIndex: index,
    audioReady: [],
    claudeConnected: false,
  };
}

/**
 * Drives the player. With a `?p=<id>` query param it connects to the server
 * over WebSocket and renders whatever state arrives. With `?demo` (or no id) it
 * runs a local, audio-free demo so the UI is viewable without Claude.
 */
export function usePlayer(): PlayerApi {
  const params = new URLSearchParams(window.location.search);
  const presentationId = params.get("p");
  const isDemo = params.has("demo") || !presentationId;

  const [view, setView] = useState<PlayerView>(() =>
    isDemo
      ? {
          presentation: demoPresentation,
          playback: demoPlayback(),
          incomingAnswer: null,
          connected: false,
          demo: true,
        }
      : {
          presentation: null,
          playback: null,
          incomingAnswer: null,
          connected: false,
          demo: false,
        },
  );

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (isDemo) return;

    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const url = `ws://${window.location.host}/ws?p=${presentationId}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        setView((v) => ({ ...v, connected: true }));
        ws.send(JSON.stringify({ type: "hello" } satisfies PlayerMessage));
      };

      ws.onmessage = (ev) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        const result = ServerMessageSchema.safeParse(parsed);
        if (!result.success) return;
        const msg = result.data;
        if (msg.type === "state") {
          setView((v) => ({
            ...v,
            presentation: msg.presentation,
            playback: msg.playback,
          }));
        } else if (msg.type === "answer") {
          setView((v) => ({ ...v, incomingAnswer: msg.answer }));
        }
      };

      ws.onclose = () => {
        setView((v) => ({ ...v, connected: false }));
        if (closed) return;
        retry += 1;
        const delay = Math.min(500 * 2 ** retry, 8000);
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [isDemo, presentationId]);

  const send = useCallback(
    (msg: PlayerMessage) => {
      if (isDemo) {
        // Apply control/progress locally so demo navigation works.
        setView((v) => {
          if (!v.playback) return v;
          if (msg.type === "progress") {
            return {
              ...v,
              playback: { ...v.playback, currentSegmentIndex: msg.segmentIndex },
            };
          }
          if (msg.type === "control") {
            const status =
              msg.action === "pause"
                ? "paused"
                : msg.action === "completed"
                  ? "completed"
                  : "playing";
            return { ...v, playback: { ...v.playback, status } };
          }
          return v;
        });
        return;
      }
      wsRef.current?.send(JSON.stringify(msg));
    },
    [isDemo],
  );

  const goTo = useCallback(
    (index: number) => send({ type: "progress", segmentIndex: index }),
    [send],
  );

  const clearAnswer = useCallback(
    () => setView((v) => ({ ...v, incomingAnswer: null })),
    [],
  );

  return { view, send, goTo, clearAnswer };
}
