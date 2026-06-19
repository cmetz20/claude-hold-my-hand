import { z } from "zod";

// ── Visual types ──────────────────────────────────────────────

export const TitleVisualSchema = z.object({
  kind: z.literal("title"),
  heading: z.string().min(1),
  subheading: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});

export const FileStatus = z.enum(["added", "modified", "deleted", "unchanged"]);

export const FileTreeEntrySchema = z.object({
  path: z.string().min(1),
  status: FileStatus,
});

export const FileTreeVisualSchema = z.object({
  kind: z.literal("fileTree"),
  files: z.array(FileTreeEntrySchema).min(1),
  rootLabel: z.string().optional(),
});

export const HighlightSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  note: z.string().optional(),
});

export const CodeVisualSchema = z.object({
  kind: z.literal("code"),
  language: z.string().min(1),
  code: z.string().min(1),
  filePath: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  highlights: z.array(HighlightSchema).optional(),
  isContext: z.boolean().optional(),
});

export const DiffVisualSchema = z.object({
  kind: z.literal("diff"),
  language: z.string().min(1),
  diff: z.string().min(1),
  filePath: z.string().optional(),
  note: z.string().optional(),
});

export const DiagramVisualSchema = z.object({
  kind: z.literal("diagram"),
  source: z.string().min(1),
  caption: z.string().optional(),
});

export const VisualSchema = z.discriminatedUnion("kind", [
  TitleVisualSchema,
  FileTreeVisualSchema,
  CodeVisualSchema,
  DiffVisualSchema,
  DiagramVisualSchema,
]);

// ── Presentation intent ───────────────────────────────────────

export const PresentationIntent = z.enum([
  "pr",
  "concept",
  "onboarding",
  "architecture",
  "debugging",
  "tutorial",
  "review",
  "custom",
]);

// ── Settings ──────────────────────────────────────────────────

export const Verbosity = z.enum(["brief", "standard", "detailed"]);
export const Depth = z.enum(["overview", "standard", "deep-dive"]);
export const Audience = z.enum(["beginner", "intermediate", "expert"]);

export const PresentationSettingsSchema = z.object({
  verbosity: Verbosity.default("standard"),
  depth: Depth.default("standard"),
  audience: Audience.default("intermediate"),
  voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
  autoPlay: z.boolean().default(true),
});

export const PartialSettingsSchema = PresentationSettingsSchema.partial();

// ── Segments ──────────────────────────────────────────────────

export const SegmentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  narration: z.string().min(1),
  visual: VisualSchema,
  section: z.string().optional(),
  audioFile: z.string().optional(),
  audioDurationMs: z.number().positive().optional(),
});

export const SegmentInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  narration: z.string().min(1),
  visual: VisualSchema,
  section: z.string().optional(),
});

// ── Presentation ──────────────────────────────────────────────

// Note: section grouping for the ToC is derived by the player from contiguous
// runs of `segment.section` over the flat list — it is not stored here, so a
// reused label later in the timeline correctly starts a new ToC group.
export const PresentationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  intent: PresentationIntent.default("custom"),
  settings: PresentationSettingsSchema,
  segments: z.array(SegmentSchema).min(1),
  createdAt: z.string().datetime(),
});

// ── Playback state ────────────────────────────────────────────

export const PlaybackStatus = z.enum([
  "loading",
  "playing",
  "paused",
  "question_pending",
  "answering",
  "completed",
]);

export const PendingQuestionSchema = z.object({
  questionId: z.string().min(1),
  text: z.string().min(1),
  segmentId: z.string().min(1),
  askedAt: z.string().datetime(),
});

export const AnswerSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(1),
  text: z.string().min(1),
  audioUrl: z.string().optional(),
});

export const PlaybackStateSchema = z.object({
  presentationId: z.string().min(1),
  status: PlaybackStatus,
  currentSegmentIndex: z.number().int().min(0),
  audioReady: z.array(z.string()),
  pendingQuestion: PendingQuestionSchema.optional(),
  lastAnswer: AnswerSchema.optional(),
  claudeConnected: z.boolean(),
});

// ── WS protocol: server → player ──────────────────────────────

export const StateMessageSchema = z.object({
  type: z.literal("state"),
  presentation: PresentationSchema,
  playback: PlaybackStateSchema,
});

export const AnswerMessageSchema = z.object({
  type: z.literal("answer"),
  answer: AnswerSchema,
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  StateMessageSchema,
  AnswerMessageSchema,
]);

// ── WS protocol: player → server ──────────────────────────────

export const HelloMessageSchema = z.object({
  type: z.literal("hello"),
});

export const ProgressMessageSchema = z.object({
  type: z.literal("progress"),
  segmentIndex: z.number().int().min(0),
});

export const ControlAction = z.enum([
  "play",
  "pause",
  "resume",
  "completed",
]);

export const ControlMessageSchema = z.object({
  type: z.literal("control"),
  action: ControlAction,
});

export const QuestionMessageSchema = z.object({
  type: z.literal("question"),
  text: z.string().min(1),
  segmentId: z.string().min(1),
});

export const PlayerMessageSchema = z.discriminatedUnion("type", [
  HelloMessageSchema,
  ProgressMessageSchema,
  ControlMessageSchema,
  QuestionMessageSchema,
]);

// ── MCP events (from await_event) ─────────────────────────────

export const QuestionEventSchema = z.object({
  type: z.literal("question"),
  questionId: z.string().min(1),
  text: z.string().min(1),
  segment: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    index: z.number().int().min(0),
  }),
});

export const CompletedEventSchema = z.object({
  type: z.literal("completed"),
});

export const NoneEventSchema = z.object({
  type: z.literal("none"),
});

export const PresentationEventSchema = z.discriminatedUnion("type", [
  QuestionEventSchema,
  CompletedEventSchema,
  NoneEventSchema,
]);

// ── MCP tool inputs ───────────────────────────────────────────

export const CreatePresentationInputSchema = z.object({
  title: z.string().min(1),
  intent: PresentationIntent.optional(),
  segments: z.array(SegmentInputSchema).min(1),
  settings: PartialSettingsSchema.optional(),
});

export const AddSegmentsInputSchema = z.object({
  presentationId: z.string().min(1),
  segments: z.array(SegmentInputSchema).min(1),
  insertAfterSegmentId: z.string().optional(),
});

export const AwaitEventInputSchema = z.object({
  presentationId: z.string().min(1),
  timeoutMs: z.number().int().positive().default(45000),
});

export const AnswerQuestionInputSchema = z.object({
  presentationId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.string().min(1),
});

// Only the playback dials are live-updatable. verbosity/depth/audience are
// authoring-time inputs (they shape how Claude writes segments) and cannot be
// changed after creation — changing them would not alter already-authored text.
export const PlaybackSettingsUpdateSchema = z
  .object({
    voiceSpeed: z.number().min(0.5).max(2.0).optional(),
    autoPlay: z.boolean().optional(),
  })
  .strict();

export const UpdateSettingsInputSchema = z.object({
  presentationId: z.string().min(1),
  settings: PlaybackSettingsUpdateSchema,
});

// ── Inferred types ────────────────────────────────────────────

export type Visual = z.infer<typeof VisualSchema>;
export type TitleVisual = z.infer<typeof TitleVisualSchema>;
export type FileTreeVisual = z.infer<typeof FileTreeVisualSchema>;
export type CodeVisual = z.infer<typeof CodeVisualSchema>;
export type DiffVisual = z.infer<typeof DiffVisualSchema>;
export type DiagramVisual = z.infer<typeof DiagramVisualSchema>;
export type FileTreeEntry = z.infer<typeof FileTreeEntrySchema>;
export type Highlight = z.infer<typeof HighlightSchema>;

export type PresentationSettings = z.infer<typeof PresentationSettingsSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type SegmentInput = z.infer<typeof SegmentInputSchema>;
export type Presentation = z.infer<typeof PresentationSchema>;

export type PlaybackState = z.infer<typeof PlaybackStateSchema>;
export type PendingQuestion = z.infer<typeof PendingQuestionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type PlayerMessage = z.infer<typeof PlayerMessageSchema>;
export type PresentationEvent = z.infer<typeof PresentationEventSchema>;

export type CreatePresentationInput = z.infer<typeof CreatePresentationInputSchema>;
export type AddSegmentsInput = z.infer<typeof AddSegmentsInputSchema>;
export type AwaitEventInput = z.infer<typeof AwaitEventInputSchema>;
export type AnswerQuestionInput = z.infer<typeof AnswerQuestionInputSchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>;
