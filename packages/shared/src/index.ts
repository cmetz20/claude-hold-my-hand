import { z } from "zod";

// ---------- Walkthrough manifest ----------

export const HighlightSchema = z.object({
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  note: z.string().optional(),
});

export const VisualSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("title"),
    heading: z.string(),
    subheading: z.string().optional(),
    bullets: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("fileTree"),
    files: z.array(
      z.object({
        path: z.string(),
        status: z.enum(["added", "modified", "deleted"]),
      })
    ),
  }),
  z.object({
    kind: z.literal("code"),
    filePath: z.string(),
    language: z.string(),
    content: z.string(),
    startLine: z.number().int().min(1).optional(),
    highlights: z.array(HighlightSchema).optional(),
    /** true when this is unchanged code shown purely to explain the change */
    isContext: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("diff"),
    filePath: z.string(),
    language: z.string(),
    unifiedDiff: z.string(),
    note: z.string().optional(),
  }),
]);

export const SegmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  narration: z.string(),
  visual: VisualSchema,
  audioFile: z.string().optional(),
  audioDurationMs: z.number().optional(),
});

export const WalkthroughSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  segments: z.array(SegmentSchema).min(1),
});

// Segments as authored by Claude (ids optional — server assigns them)
export const SegmentInputSchema = SegmentSchema.omit({
  id: true,
  audioFile: true,
  audioDurationMs: true,
}).extend({ id: z.string().optional() });

export type Highlight = z.infer<typeof HighlightSchema>;
export type Visual = z.infer<typeof VisualSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type SegmentInput = z.infer<typeof SegmentInputSchema>;
export type Walkthrough = z.infer<typeof WalkthroughSchema>;

// ---------- Playback / session state ----------

export type PlaybackStatus =
  | "loading" // waiting for first audio
  | "playing"
  | "paused"
  | "question_pending" // user asked; waiting for Claude
  | "answering" // answer being shown/spoken
  | "completed";

export interface PendingQuestion {
  questionId: string;
  text: string;
  segmentId: string;
  askedAt: string;
}

export interface Answer {
  questionId: string;
  question: string;
  text: string;
  audioUrl?: string;
}

export interface PlaybackState {
  walkthroughId: string;
  status: PlaybackStatus;
  currentSegmentIndex: number;
  /** segment ids whose narration audio is ready */
  audioReady: string[];
  pendingQuestion?: PendingQuestion;
  lastAnswer?: Answer;
  claudeConnected: boolean;
}

// ---------- WebSocket protocol ----------

/** server -> player */
export type ServerMessage =
  | { type: "state"; walkthrough: Walkthrough; playback: PlaybackState }
  | { type: "answer"; answer: Answer };

/** player -> server */
export type PlayerMessage =
  | { type: "hello" }
  | { type: "progress"; segmentIndex: number }
  | { type: "control"; action: "play" | "pause" | "resume" | "completed" }
  | { type: "question"; text: string; segmentId: string };

// ---------- MCP long-poll events (server -> Claude) ----------

export type WalkthroughEvent =
  | {
      type: "question";
      questionId: string;
      text: string;
      segment: { id: string; title: string; index: number };
    }
  | { type: "completed" }
  | { type: "none" };
