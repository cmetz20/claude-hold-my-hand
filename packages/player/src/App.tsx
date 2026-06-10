import { useCallback, useEffect, useRef, useState } from "react";
import { VisualStage } from "./visuals";
import { useSession } from "./ws";
import { AskPanel } from "./AskPanel";

export default function App() {
  const { state, send, clearAnswer } = useSession();
  const [started, setStarted] = useState(false);
  const narrationRef = useRef<HTMLAudioElement>(null);
  const answerRef = useRef<HTMLAudioElement>(null);

  const { walkthrough, playback } = state;
  const segIndex = playback?.currentSegmentIndex ?? 0;
  const segment = walkthrough?.segments[segIndex];
  const status = playback?.status ?? "loading";
  const audioUrl =
    walkthrough && segment?.audioFile
      ? `/audio/${walkthrough.id}/${segment.audioFile}`
      : null;

  // Drive narration audio from server state + local "started" gesture gate.
  useEffect(() => {
    const audio = narrationRef.current;
    if (!audio) return;
    if (started && status === "playing" && audioUrl) {
      const abs = new URL(audioUrl, location.href).href;
      if (audio.src !== abs) audio.src = abs;
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [started, status, audioUrl]);

  // Play incoming answers aloud.
  useEffect(() => {
    if (!state.incomingAnswer) return;
    const audio = answerRef.current;
    if (audio && state.incomingAnswer.audioUrl) {
      audio.src = new URL(state.incomingAnswer.audioUrl, location.href).href;
      void audio.play().catch(() => undefined);
    }
    clearAnswer();
  }, [state.incomingAnswer, clearAnswer]);

  const onNarrationEnded = useCallback(() => {
    if (!walkthrough) return;
    if (segIndex >= walkthrough.segments.length - 1) {
      send({ type: "control", action: "completed" });
    } else {
      send({ type: "progress", segmentIndex: segIndex + 1 });
    }
  }, [walkthrough, segIndex, send]);

  const togglePlayPause = useCallback(() => {
    if (!started) {
      setStarted(true);
      send({ type: "control", action: "play" });
      return;
    }
    if (status === "playing") send({ type: "control", action: "pause" });
    else if (status === "paused" || status === "completed")
      send({ type: "control", action: "resume" });
  }, [started, status, send]);

  const seek = useCallback(
    (delta: number) => {
      if (!walkthrough) return;
      const next = Math.max(
        0,
        Math.min(segIndex + delta, walkthrough.segments.length - 1)
      );
      if (next !== segIndex) send({ type: "progress", segmentIndex: next });
    },
    [walkthrough, segIndex, send]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === "ArrowRight") seek(1);
      else if (e.code === "ArrowLeft") seek(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlayPause, seek]);

  if (state.noWalkthrough) {
    return (
      <div className="centered-screen">
        <h2>No walkthrough yet</h2>
        <p>Ask Claude to walk you through a changeset, then come back here.</p>
      </div>
    );
  }
  if (!walkthrough || !playback || !segment) {
    return (
      <div className="centered-screen">
        <h2>{state.connected ? "Loading walkthrough…" : "Connecting…"}</h2>
      </div>
    );
  }

  const audioPending = !segment.audioFile;
  const showOverlayStart = !started;

  return (
    <div className="app">
      <header className="topbar">
        <span className="wt-title">{walkthrough.title}</span>
        <span className="seg-title">{segment.title}</span>
        <span className={`claude-dot ${playback.claudeConnected ? "on" : "off"}`}>
          {playback.claudeConnected ? "Claude connected" : "Claude offline"}
        </span>
      </header>

      {!state.connected && (
        <div className="banner warn">Reconnecting to walkthrough server…</div>
      )}
      {!playback.claudeConnected && status === "question_pending" && (
        <div className="banner warn">
          Claude isn't connected — your question is queued until the session
          reconnects.
        </div>
      )}

      <main className="stage">
        <VisualStage key={segment.id} visual={segment.visual} />
        {audioPending && (
          <div className="audio-pending">generating narration audio…</div>
        )}
      </main>

      <AskPanel
        visible={
          status === "paused" ||
          status === "question_pending" ||
          status === "answering" ||
          status === "completed"
        }
        status={status}
        pendingQuestion={playback.pendingQuestion}
        answer={playback.lastAnswer}
        onAsk={(text) => send({ type: "question", text, segmentId: segment.id })}
        onResume={() => {
          answerRef.current?.pause();
          send({ type: "control", action: "resume" });
        }}
      />

      <footer className="transport">
        <button onClick={() => seek(-1)} title="Previous segment (←)">
          ⏮
        </button>
        <button
          className="play-btn"
          onClick={togglePlayPause}
          title="Play/Pause (space)"
        >
          {status === "playing" ? "⏸" : "▶"}
        </button>
        <button onClick={() => seek(1)} title="Next segment (→)">
          ⏭
        </button>
        <div className="dots">
          {walkthrough.segments.map((s, i) => (
            <button
              key={s.id}
              className={`dot ${i === segIndex ? "current" : ""} ${
                playback.audioReady.includes(s.id) ? "ready" : ""
              }`}
              title={s.title}
              onClick={() => send({ type: "progress", segmentIndex: i })}
            />
          ))}
        </div>
        <span className="counter">
          {segIndex + 1} / {walkthrough.segments.length}
        </span>
      </footer>

      {showOverlayStart && (
        <div className="start-overlay" onClick={togglePlayPause}>
          <button className="start-btn">▶ Start walkthrough</button>
          <p>space to pause · ← → to skip · ask questions while paused</p>
        </div>
      )}

      <audio ref={narrationRef} onEnded={onNarrationEnded} />
      <audio ref={answerRef} />
    </div>
  );
}
