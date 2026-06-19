import { useState } from "react";
import type { PlaybackState, Answer } from "@chmh/shared";

interface AskPanelProps {
  playback: PlaybackState;
  incomingAnswer: Answer | null;
  disabled: boolean;
  onAsk: (text: string) => void;
  onResume: () => void;
  onDismissAnswer: () => void;
}

export function AskPanel({
  playback,
  incomingAnswer,
  disabled,
  onAsk,
  onResume,
  onDismissAnswer,
}: AskPanelProps) {
  const [text, setText] = useState("");

  if (playback.status === "question_pending") {
    return (
      <div className="ask-panel ask-thinking">
        <span className="spinner" aria-hidden="true" />
        <span>Claude is thinking…</span>
      </div>
    );
  }

  if (incomingAnswer && playback.status === "answering") {
    return (
      <div className="ask-panel ask-answer">
        <div className="ask-answer-q">{incomingAnswer.question}</div>
        <div className="ask-answer-a">{incomingAnswer.text}</div>
        <div className="ask-answer-actions">
          <button
            onClick={() => {
              onDismissAnswer();
              onResume();
            }}
          >
            Resume
          </button>
        </div>
      </div>
    );
  }

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    setText("");
  };

  return (
    <form
      className="ask-panel ask-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        type="text"
        placeholder={
          disabled ? "Ask is unavailable in demo" : "Pause and ask a question…"
        }
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        aria-label="Ask a question"
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        Ask
      </button>
    </form>
  );
}
