import { useEffect, useMemo, useRef } from "react";
import type { Segment, Answer } from "@chmh/shared";
import { usePlayer } from "./ws.js";
import { VisualStage } from "./visuals.js";
import { AskPanel } from "./AskPanel.js";
import { deriveTocGroups } from "./sections.js";

const INTENT_LABEL: Record<string, string> = {
  pr: "PR walkthrough",
  concept: "Concept",
  onboarding: "Onboarding",
  architecture: "Architecture",
  debugging: "Debugging",
  tutorial: "Tutorial",
  review: "Review",
  custom: "Presentation",
};

export function App() {
  const { view, send, goTo, clearAnswer } = usePlayer();
  const { presentation, playback } = view;

  // Hooks must run unconditionally, so derive the ToC before any early return.
  const segments = presentation?.segments ?? [];
  const toc = useMemo(() => deriveTocGroups(segments), [segments]);

  if (!presentation || !playback) {
    return (
      <div className="app app-empty">
        <p>Waiting for a presentation…</p>
      </div>
    );
  }

  const index = Math.min(playback.currentSegmentIndex, segments.length - 1);
  const segment = segments[index];

  const onNarrationEnded = () => {
    if (index < segments.length - 1) goTo(index + 1);
    else send({ type: "control", action: "completed" });
  };

  return (
    <div className="app">
      <AudioController
        presentationId={presentation.id}
        audioFile={segment.audioFile}
        status={playback.status}
        voiceSpeed={presentation.settings.voiceSpeed}
        demo={view.demo}
        answer={view.incomingAnswer}
        onNarrationEnded={onNarrationEnded}
      />
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="intent-badge">
            {INTENT_LABEL[presentation.intent] ?? "Presentation"}
          </span>
          <h2 className="pres-title">{presentation.title}</h2>
          <SettingsBadges settings={presentation.settings} />
        </div>
        <Toc
          segments={segments}
          toc={toc}
          activeIndex={index}
          onJump={goTo}
        />
      </aside>

      <main className="stage-wrap">
        <div className="stage">
          <VisualStage visual={segment.visual} />
        </div>

        <Narration text={segment.narration} />

        <Transport
          index={index}
          total={segments.length}
          status={playback.status}
          onPrev={() => goTo(Math.max(0, index - 1))}
          onNext={() => goTo(Math.min(segments.length - 1, index + 1))}
          onPlayPause={() =>
            send({
              type: "control",
              action: playback.status === "playing" ? "pause" : "play",
            })
          }
        />

        <AskPanel
          playback={playback}
          incomingAnswer={view.incomingAnswer}
          disabled={view.demo}
          onAsk={(text) =>
            send({ type: "question", text, segmentId: segment.id })
          }
          onResume={() => send({ type: "control", action: "resume" })}
          onDismissAnswer={clearAnswer}
        />

        {view.demo && (
          <div className="demo-banner">
            Demo mode — local preview, no audio or Claude. Open with{" "}
            <code>?p=&lt;id&gt;</code> for a live session.
          </div>
        )}
      </main>
    </div>
  );
}

function AudioController({
  presentationId,
  audioFile,
  status,
  voiceSpeed,
  demo,
  answer,
  onNarrationEnded,
}: {
  presentationId: string;
  audioFile: string | undefined;
  status: string;
  voiceSpeed: number;
  demo: boolean;
  answer: Answer | null;
  onNarrationEnded: () => void;
}) {
  const narrationRef = useRef<HTMLAudioElement>(null);
  const answerRef = useRef<HTMLAudioElement>(null);
  const src = !demo && audioFile ? `/audio/${presentationId}/${audioFile}` : null;

  // Play/pause narration in lockstep with the server-driven status.
  useEffect(() => {
    const a = narrationRef.current;
    if (!a || !src) return;
    a.playbackRate = voiceSpeed;
    if (status === "playing") {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [src, status, voiceSpeed]);

  // Speak an answer the moment it arrives, pausing narration first.
  useEffect(() => {
    const a = answerRef.current;
    if (!a || !answer?.audioUrl) return;
    narrationRef.current?.pause();
    a.src = answer.audioUrl;
    a.playbackRate = voiceSpeed;
    void a.play().catch(() => {});
  }, [answer?.audioUrl, voiceSpeed]);

  if (demo) return null;
  return (
    <>
      <audio
        ref={narrationRef}
        src={src ?? undefined}
        onEnded={onNarrationEnded}
        preload="auto"
      />
      <audio ref={answerRef} preload="auto" />
    </>
  );
}

function SettingsBadges({
  settings,
}: {
  settings: { verbosity: string; depth: string; audience: string };
}) {
  return (
    <div className="settings-badges">
      <span>{settings.audience}</span>
      <span>{settings.verbosity}</span>
      <span>{settings.depth}</span>
    </div>
  );
}

function Toc({
  segments,
  toc,
  activeIndex,
  onJump,
}: {
  segments: Segment[];
  toc: ReturnType<typeof deriveTocGroups>;
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  // With sections, show grouped headers; otherwise a flat list of segments.
  if (toc.length === 0) {
    return (
      <ol className="toc toc-flat">
        {segments.map((s, i) => (
          <li key={s.id}>
            <button
              className={i === activeIndex ? "active" : ""}
              onClick={() => onJump(i)}
            >
              {s.title}
            </button>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="toc toc-sectioned">
      {toc.map((g, gi) => (
        <div key={gi} className="toc-group">
          <div className="toc-group-label">{g.label}</div>
          <ol>
            {g.segmentIds.map((id, j) => {
              const i = g.startIndex + j;
              return (
                <li key={id}>
                  <button
                    className={i === activeIndex ? "active" : ""}
                    onClick={() => onJump(i)}
                  >
                    {segments[i].title}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function Narration({ text }: { text: string }) {
  return <p className="narration">{text}</p>;
}

function Transport({
  index,
  total,
  status,
  onPrev,
  onNext,
  onPlayPause,
}: {
  index: number;
  total: number;
  status: string;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
}) {
  return (
    <div className="transport">
      <button onClick={onPrev} disabled={index === 0} aria-label="Previous">
        ◀
      </button>
      <button onClick={onPlayPause} aria-label="Play or pause">
        {status === "playing" ? "❚❚" : "▶"}
      </button>
      <button
        onClick={onNext}
        disabled={index === total - 1}
        aria-label="Next"
      >
        ▶
      </button>
      <span className="transport-counter">
        {index + 1} / {total}
      </span>
    </div>
  );
}
