import { useState, type FormEvent } from "react";
import type { Answer, PendingQuestion, PlaybackStatus } from "@chmh/shared";

/** Abstraction point for question input — a voice (STT) implementation can
 * replace or augment the text form later by providing the same onAsk hook. */
export function AskPanel(props: {
  visible: boolean;
  status: PlaybackStatus;
  pendingQuestion?: PendingQuestion;
  answer?: Answer;
  onAsk: (text: string) => void;
  onResume: () => void;
}) {
  const [text, setText] = useState("");
  if (!props.visible) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    props.onAsk(t);
    setText("");
  };

  return (
    <div className="ask-panel">
      {props.status === "answering" && props.answer ? (
        <div className="answer-card">
          <div className="answer-q">You asked: {props.answer.question}</div>
          <div className="answer-text">{props.answer.text}</div>
          <button className="resume-btn" onClick={props.onResume}>
            ▶ Resume walkthrough
          </button>
        </div>
      ) : props.status === "question_pending" ? (
        <div className="answer-card">
          <div className="answer-q">
            You asked: {props.pendingQuestion?.text}
          </div>
          <div className="thinking">
            <span className="spinner" /> Claude is thinking…
          </div>
        </div>
      ) : (
        <form className="ask-form" onSubmit={submit}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              props.status === "completed"
                ? "Walkthrough finished — any questions?"
                : "Ask about this part of the change…"
            }
          />
          <button type="submit" disabled={!text.trim()}>
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
