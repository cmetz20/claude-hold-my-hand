import { describe, it, expect } from "vitest";
import {
  VisualSchema,
  TitleVisualSchema,
  FileTreeVisualSchema,
  CodeVisualSchema,
  DiffVisualSchema,
  DiagramVisualSchema,
  SegmentSchema,
  SegmentInputSchema,
  PresentationSchema,
  PresentationSettingsSchema,
  PartialSettingsSchema,
  PlaybackStateSchema,
  PendingQuestionSchema,
  AnswerSchema,
  ServerMessageSchema,
  PlayerMessageSchema,
  PresentationEventSchema,
  CreatePresentationInputSchema,
  AddSegmentsInputSchema,
  AwaitEventInputSchema,
  AnswerQuestionInputSchema,
  UpdateSettingsInputSchema,
} from "../index.js";

// ── Helpers ────────────────────────────────────────────────────

function validTitleVisual() {
  return { kind: "title" as const, heading: "Welcome" };
}

function validFileTreeVisual() {
  return {
    kind: "fileTree" as const,
    files: [{ path: "src/index.ts", status: "added" as const }],
  };
}

function validCodeVisual() {
  return {
    kind: "code" as const,
    language: "typescript",
    code: "const x = 1;",
  };
}

function validDiffVisual() {
  return {
    kind: "diff" as const,
    language: "typescript",
    diff: "--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new",
  };
}

function validDiagramVisual() {
  return {
    kind: "diagram" as const,
    source: "graph TD\n  A-->B",
  };
}

function validSegment(overrides: Record<string, unknown> = {}) {
  return {
    id: "seg-abc123",
    title: "Introduction",
    narration: "Let me walk you through this.",
    visual: validTitleVisual(),
    ...overrides,
  };
}

function validSegmentInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Introduction",
    narration: "Let me walk you through this.",
    visual: validTitleVisual(),
    ...overrides,
  };
}

function validPresentation() {
  return {
    id: "pr-2026-06-19-abc123",
    title: "Architecture Overview",
    intent: "architecture" as const,
    settings: PresentationSettingsSchema.parse({}),
    segments: [validSegment()],
    createdAt: "2026-06-19T10:00:00.000Z",
  };
}

function validPlaybackState() {
  return {
    presentationId: "pr-2026-06-19-abc123",
    status: "loading" as const,
    currentSegmentIndex: 0,
    audioReady: [],
    claudeConnected: true,
  };
}

// ── Visual types ──────────────────────────────────────────────

describe("Visual schemas", () => {
  describe("TitleVisual", () => {
    it("parses with only heading", () => {
      const result = TitleVisualSchema.parse(validTitleVisual());
      expect(result.kind).toBe("title");
      expect(result.heading).toBe("Welcome");
      expect(result.subheading).toBeUndefined();
      expect(result.bullets).toBeUndefined();
    });

    it("parses with all optional fields", () => {
      const result = TitleVisualSchema.parse({
        kind: "title",
        heading: "Welcome",
        subheading: "A tour of the codebase",
        bullets: ["Fast", "Secure", "Simple"],
      });
      expect(result.subheading).toBe("A tour of the codebase");
      expect(result.bullets).toEqual(["Fast", "Secure", "Simple"]);
    });

    it("rejects empty heading", () => {
      expect(() =>
        TitleVisualSchema.parse({ kind: "title", heading: "" })
      ).toThrow();
    });
  });

  describe("FileTreeVisual", () => {
    it("parses valid file tree", () => {
      const result = FileTreeVisualSchema.parse(validFileTreeVisual());
      expect(result.files).toHaveLength(1);
      expect(result.files[0].status).toBe("added");
    });

    it("accepts all file statuses", () => {
      const statuses = ["added", "modified", "deleted", "unchanged"] as const;
      for (const status of statuses) {
        const result = FileTreeVisualSchema.parse({
          kind: "fileTree",
          files: [{ path: "test.ts", status }],
        });
        expect(result.files[0].status).toBe(status);
      }
    });

    it("accepts rootLabel", () => {
      const result = FileTreeVisualSchema.parse({
        ...validFileTreeVisual(),
        rootLabel: "packages/server",
      });
      expect(result.rootLabel).toBe("packages/server");
    });

    it("rejects empty files array", () => {
      expect(() =>
        FileTreeVisualSchema.parse({ kind: "fileTree", files: [] })
      ).toThrow();
    });

    it("rejects invalid file status", () => {
      expect(() =>
        FileTreeVisualSchema.parse({
          kind: "fileTree",
          files: [{ path: "test.ts", status: "renamed" }],
        })
      ).toThrow();
    });
  });

  describe("CodeVisual", () => {
    it("parses minimal code visual", () => {
      const result = CodeVisualSchema.parse(validCodeVisual());
      expect(result.language).toBe("typescript");
      expect(result.code).toBe("const x = 1;");
    });

    it("parses with all optional fields", () => {
      const result = CodeVisualSchema.parse({
        ...validCodeVisual(),
        filePath: "src/utils.ts",
        startLine: 42,
        highlights: [{ startLine: 42, endLine: 44, note: "key logic" }],
        isContext: true,
      });
      expect(result.filePath).toBe("src/utils.ts");
      expect(result.startLine).toBe(42);
      expect(result.highlights).toHaveLength(1);
      expect(result.highlights![0].note).toBe("key logic");
      expect(result.isContext).toBe(true);
    });

    it("rejects non-positive startLine", () => {
      expect(() =>
        CodeVisualSchema.parse({ ...validCodeVisual(), startLine: 0 })
      ).toThrow();
    });

    it("rejects highlight with non-positive line numbers", () => {
      expect(() =>
        CodeVisualSchema.parse({
          ...validCodeVisual(),
          highlights: [{ startLine: 0, endLine: 5 }],
        })
      ).toThrow();
    });
  });

  describe("DiffVisual", () => {
    it("parses minimal diff visual", () => {
      const result = DiffVisualSchema.parse(validDiffVisual());
      expect(result.language).toBe("typescript");
    });

    it("parses with optional fields", () => {
      const result = DiffVisualSchema.parse({
        ...validDiffVisual(),
        filePath: "src/auth.ts",
        note: "Switched from JWT to session tokens",
      });
      expect(result.filePath).toBe("src/auth.ts");
      expect(result.note).toBe("Switched from JWT to session tokens");
    });
  });

  describe("DiagramVisual", () => {
    it("parses valid Mermaid diagram", () => {
      const result = DiagramVisualSchema.parse(validDiagramVisual());
      expect(result.source).toContain("graph TD");
    });

    it("parses with caption", () => {
      const result = DiagramVisualSchema.parse({
        ...validDiagramVisual(),
        caption: "Request flow through the auth middleware",
      });
      expect(result.caption).toBe("Request flow through the auth middleware");
    });

    it("rejects empty source", () => {
      expect(() =>
        DiagramVisualSchema.parse({ kind: "diagram", source: "" })
      ).toThrow();
    });
  });

  describe("VisualSchema (discriminated union)", () => {
    it("parses each visual kind through the union", () => {
      expect(VisualSchema.parse(validTitleVisual()).kind).toBe("title");
      expect(VisualSchema.parse(validFileTreeVisual()).kind).toBe("fileTree");
      expect(VisualSchema.parse(validCodeVisual()).kind).toBe("code");
      expect(VisualSchema.parse(validDiffVisual()).kind).toBe("diff");
      expect(VisualSchema.parse(validDiagramVisual()).kind).toBe("diagram");
    });

    it("rejects unknown visual kind", () => {
      expect(() =>
        VisualSchema.parse({ kind: "markdown", content: "# Hello" })
      ).toThrow();
    });
  });
});

// ── Settings ──────────────────────────────────────────────────

describe("PresentationSettings", () => {
  it("fills all defaults from empty object", () => {
    const result = PresentationSettingsSchema.parse({});
    expect(result.verbosity).toBe("standard");
    expect(result.depth).toBe("standard");
    expect(result.audience).toBe("intermediate");
    expect(result.voiceSpeed).toBe(1.0);
    expect(result.autoPlay).toBe(true);
  });

  it("overrides individual defaults", () => {
    const result = PresentationSettingsSchema.parse({
      verbosity: "detailed",
      audience: "beginner",
      voiceSpeed: 0.8,
    });
    expect(result.verbosity).toBe("detailed");
    expect(result.audience).toBe("beginner");
    expect(result.voiceSpeed).toBe(0.8);
    expect(result.depth).toBe("standard");
  });

  it("rejects voiceSpeed out of range", () => {
    expect(() =>
      PresentationSettingsSchema.parse({ voiceSpeed: 0.1 })
    ).toThrow();
    expect(() =>
      PresentationSettingsSchema.parse({ voiceSpeed: 3.0 })
    ).toThrow();
  });

  it("rejects invalid verbosity", () => {
    expect(() =>
      PresentationSettingsSchema.parse({ verbosity: "verbose" })
    ).toThrow();
  });

  it("PartialSettingsSchema allows any subset", () => {
    const result = PartialSettingsSchema.parse({ voiceSpeed: 1.5 });
    expect(result.voiceSpeed).toBe(1.5);
    expect(result.verbosity).toBeUndefined();
  });
});

// ── Segments ──────────────────────────────────────────────────

describe("Segment schemas", () => {
  describe("SegmentSchema", () => {
    it("parses a valid segment", () => {
      const result = SegmentSchema.parse(validSegment());
      expect(result.id).toBe("seg-abc123");
      expect(result.title).toBe("Introduction");
      expect(result.visual.kind).toBe("title");
    });

    it("parses with optional section", () => {
      const result = SegmentSchema.parse(
        validSegment({ section: "Getting Started" })
      );
      expect(result.section).toBe("Getting Started");
    });

    it("parses with audio fields", () => {
      const result = SegmentSchema.parse(
        validSegment({
          audioFile: "narration-001.wav",
          audioDurationMs: 5200,
        })
      );
      expect(result.audioFile).toBe("narration-001.wav");
      expect(result.audioDurationMs).toBe(5200);
    });

    it("rejects missing id", () => {
      const { id: _, ...noId } = validSegment();
      expect(() => SegmentSchema.parse(noId)).toThrow();
    });

    it("rejects empty narration", () => {
      expect(() =>
        SegmentSchema.parse(validSegment({ narration: "" }))
      ).toThrow();
    });
  });

  describe("SegmentInputSchema", () => {
    it("parses without id (server assigns)", () => {
      const result = SegmentInputSchema.parse(validSegmentInput());
      expect(result.id).toBeUndefined();
    });

    it("parses with explicit id", () => {
      const result = SegmentInputSchema.parse(
        validSegmentInput({ id: "seg-custom" })
      );
      expect(result.id).toBe("seg-custom");
    });

    it("does not accept audioFile or audioDurationMs", () => {
      const input = validSegmentInput({
        audioFile: "bad.wav",
        audioDurationMs: 1000,
      });
      const result = SegmentInputSchema.parse(input);
      expect("audioFile" in result).toBe(false);
      expect("audioDurationMs" in result).toBe(false);
    });
  });
});

// ── Presentation ──────────────────────────────────────────────

describe("PresentationSchema", () => {
  it("parses a valid presentation", () => {
    const result = PresentationSchema.parse(validPresentation());
    expect(result.id).toBe("pr-2026-06-19-abc123");
    expect(result.intent).toBe("architecture");
    expect(result.segments).toHaveLength(1);
  });

  it("defaults intent to custom", () => {
    const { intent: _, ...noIntent } = validPresentation();
    const result = PresentationSchema.parse(noIntent);
    expect(result.intent).toBe("custom");
  });

  it("accepts all intent values", () => {
    const intents = [
      "pr", "concept", "onboarding", "architecture",
      "debugging", "tutorial", "review", "custom",
    ] as const;
    for (const intent of intents) {
      const result = PresentationSchema.parse({
        ...validPresentation(),
        intent,
      });
      expect(result.intent).toBe(intent);
    }
  });

  it("rejects empty segments", () => {
    expect(() =>
      PresentationSchema.parse({ ...validPresentation(), segments: [] })
    ).toThrow();
  });

  it("rejects invalid createdAt", () => {
    expect(() =>
      PresentationSchema.parse({
        ...validPresentation(),
        createdAt: "not-a-date",
      })
    ).toThrow();
  });
});

// ── Playback state ────────────────────────────────────────────

describe("PlaybackState", () => {
  it("parses valid playback state", () => {
    const result = PlaybackStateSchema.parse(validPlaybackState());
    expect(result.status).toBe("loading");
    expect(result.claudeConnected).toBe(true);
    expect(result.audioReady).toEqual([]);
  });

  it("parses with pending question", () => {
    const result = PlaybackStateSchema.parse({
      ...validPlaybackState(),
      status: "question_pending",
      pendingQuestion: {
        questionId: "q-1234",
        text: "What does this do?",
        segmentId: "seg-abc123",
        askedAt: "2026-06-19T10:05:00.000Z",
      },
    });
    expect(result.pendingQuestion?.questionId).toBe("q-1234");
  });

  it("parses with last answer", () => {
    const result = PlaybackStateSchema.parse({
      ...validPlaybackState(),
      lastAnswer: {
        questionId: "q-1234",
        question: "What does this do?",
        text: "This handles authentication by validating the JWT token.",
        audioUrl: "/audio/pr-2026-06-19-abc123/answer-q1234.wav",
      },
    });
    expect(result.lastAnswer?.text).toContain("authentication");
  });

  it("accepts all playback statuses", () => {
    const statuses = [
      "loading", "playing", "paused",
      "question_pending", "answering", "completed",
    ] as const;
    for (const status of statuses) {
      const result = PlaybackStateSchema.parse({
        ...validPlaybackState(),
        status,
      });
      expect(result.status).toBe(status);
    }
  });
});

// ── WS protocol: server → player ──────────────────────────────

describe("ServerMessage", () => {
  it("parses state message", () => {
    const result = ServerMessageSchema.parse({
      type: "state",
      presentation: validPresentation(),
      playback: validPlaybackState(),
    });
    expect(result.type).toBe("state");
  });

  it("parses answer message", () => {
    const result = ServerMessageSchema.parse({
      type: "answer",
      answer: {
        questionId: "q-1234",
        question: "Why?",
        text: "Because it's better.",
      },
    });
    expect(result.type).toBe("answer");
  });

  it("rejects unknown message type", () => {
    expect(() =>
      ServerMessageSchema.parse({ type: "error", message: "bad" })
    ).toThrow();
  });
});

// ── WS protocol: player → server ──────────────────────────────

describe("PlayerMessage", () => {
  it("parses hello", () => {
    const result = PlayerMessageSchema.parse({ type: "hello" });
    expect(result.type).toBe("hello");
  });

  it("parses progress", () => {
    const result = PlayerMessageSchema.parse({
      type: "progress",
      segmentIndex: 3,
    });
    expect(result.type).toBe("progress");
  });

  it("parses control actions", () => {
    for (const action of ["play", "pause", "resume", "completed"] as const) {
      const result = PlayerMessageSchema.parse({
        type: "control",
        action,
      });
      expect(result.type).toBe("control");
    }
  });

  it("parses question", () => {
    const result = PlayerMessageSchema.parse({
      type: "question",
      text: "What's happening here?",
      segmentId: "seg-abc123",
    });
    expect(result.type).toBe("question");
  });

  it("rejects negative segment index", () => {
    expect(() =>
      PlayerMessageSchema.parse({ type: "progress", segmentIndex: -1 })
    ).toThrow();
  });

  it("rejects empty question text", () => {
    expect(() =>
      PlayerMessageSchema.parse({
        type: "question",
        text: "",
        segmentId: "seg-1",
      })
    ).toThrow();
  });
});

// ── MCP events ────────────────────────────────────────────────

describe("PresentationEvent", () => {
  it("parses question event", () => {
    const result = PresentationEventSchema.parse({
      type: "question",
      questionId: "q-1234",
      text: "How does this work?",
      segment: { id: "seg-abc123", title: "Auth Flow", index: 2 },
    });
    expect(result.type).toBe("question");
  });

  it("parses completed event", () => {
    const result = PresentationEventSchema.parse({ type: "completed" });
    expect(result.type).toBe("completed");
  });

  it("parses none event", () => {
    const result = PresentationEventSchema.parse({ type: "none" });
    expect(result.type).toBe("none");
  });
});

// ── MCP tool inputs ───────────────────────────────────────────

describe("MCP tool input schemas", () => {
  describe("CreatePresentationInput", () => {
    it("parses with minimal fields", () => {
      const result = CreatePresentationInputSchema.parse({
        title: "My Presentation",
        segments: [validSegmentInput()],
      });
      expect(result.title).toBe("My Presentation");
      expect(result.intent).toBeUndefined();
      expect(result.settings).toBeUndefined();
    });

    it("parses with all optional fields", () => {
      const result = CreatePresentationInputSchema.parse({
        title: "PR Review",
        intent: "pr",
        segments: [validSegmentInput()],
        settings: { verbosity: "brief", audience: "expert" },
      });
      expect(result.intent).toBe("pr");
      expect(result.settings?.verbosity).toBe("brief");
    });

    it("rejects empty title", () => {
      expect(() =>
        CreatePresentationInputSchema.parse({
          title: "",
          segments: [validSegmentInput()],
        })
      ).toThrow();
    });

    it("rejects empty segments array", () => {
      expect(() =>
        CreatePresentationInputSchema.parse({
          title: "Test",
          segments: [],
        })
      ).toThrow();
    });
  });

  describe("AddSegmentsInput", () => {
    it("parses append (no insertAfterSegmentId)", () => {
      const result = AddSegmentsInputSchema.parse({
        presentationId: "pr-2026-06-19-abc123",
        segments: [validSegmentInput()],
      });
      expect(result.insertAfterSegmentId).toBeUndefined();
    });

    it("parses prepend (empty string)", () => {
      const result = AddSegmentsInputSchema.parse({
        presentationId: "pr-2026-06-19-abc123",
        segments: [validSegmentInput()],
        insertAfterSegmentId: "",
      });
      expect(result.insertAfterSegmentId).toBe("");
    });

    it("parses splice after specific segment", () => {
      const result = AddSegmentsInputSchema.parse({
        presentationId: "pr-2026-06-19-abc123",
        segments: [validSegmentInput()],
        insertAfterSegmentId: "seg-abc123",
      });
      expect(result.insertAfterSegmentId).toBe("seg-abc123");
    });
  });

  describe("AwaitEventInput", () => {
    it("defaults timeoutMs to 45000", () => {
      const result = AwaitEventInputSchema.parse({
        presentationId: "pr-2026-06-19-abc123",
      });
      expect(result.timeoutMs).toBe(45000);
    });

    it("accepts custom timeout", () => {
      const result = AwaitEventInputSchema.parse({
        presentationId: "pr-2026-06-19-abc123",
        timeoutMs: 10000,
      });
      expect(result.timeoutMs).toBe(10000);
    });
  });

  describe("AnswerQuestionInput", () => {
    it("parses valid answer", () => {
      const result = AnswerQuestionInputSchema.parse({
        presentationId: "pr-2026-06-19-abc123",
        questionId: "q-1234",
        answer: "This function validates the user session.",
      });
      expect(result.answer).toContain("validates");
    });

    it("rejects empty answer", () => {
      expect(() =>
        AnswerQuestionInputSchema.parse({
          presentationId: "pr-1",
          questionId: "q-1",
          answer: "",
        })
      ).toThrow();
    });
  });

  describe("UpdateSettingsInput", () => {
    it("parses a playback settings update", () => {
      const result = UpdateSettingsInputSchema.parse({
        presentationId: "pr-2026-06-19-abc123",
        settings: { voiceSpeed: 1.5, autoPlay: false },
      });
      expect(result.settings.voiceSpeed).toBe(1.5);
      expect(result.settings.autoPlay).toBe(false);
    });

    it("rejects authoring-time dials (verbosity/depth/audience)", () => {
      expect(() =>
        UpdateSettingsInputSchema.parse({
          presentationId: "pr-2026-06-19-abc123",
          settings: { verbosity: "detailed" },
        })
      ).toThrow();
    });
  });
});
