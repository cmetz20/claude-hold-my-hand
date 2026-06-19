import type { Presentation } from "@chmh/shared";

/**
 * A self-contained fixture so the player renders all five visual kinds with no
 * server or audio. Loaded when the player is opened with `?demo` (or with no
 * presentation id). Useful for Phase 4 development and a no-Claude preview.
 */
export const demoPresentation: Presentation = {
  id: "pr-demo-000000",
  title: "Claude Hold My Hand — visual showcase",
  intent: "onboarding",
  settings: {
    verbosity: "standard",
    depth: "standard",
    audience: "intermediate",
    voiceSpeed: 1,
    autoPlay: true,
  },
  createdAt: "2026-06-19T00:00:00.000Z",
  segments: [
    {
      id: "seg-1",
      title: "Welcome",
      section: "Overview",
      narration: "Welcome to a quick tour of what the player can render.",
      visual: {
        kind: "title",
        heading: "A presentation about anything",
        subheading: "Not just changesets",
        bullets: ["Concepts", "Onboarding", "Architecture", "PRs & reviews"],
      },
    },
    {
      id: "seg-2",
      title: "The packages",
      section: "Overview",
      narration: "Three packages make up the system.",
      visual: {
        kind: "fileTree",
        rootLabel: "packages/",
        files: [
          { path: "shared/  — schemas & protocol", status: "unchanged" },
          { path: "server/  — MCP + host + TTS", status: "modified" },
          { path: "player/  — this React app", status: "added" },
        ],
      },
    },
    {
      id: "seg-3",
      title: "How it connects",
      section: "Architecture",
      narration:
        "Claude talks to the server over MCP; the server hosts this player over WebSocket.",
      visual: {
        kind: "diagram",
        source:
          "graph LR\n  C[Claude Code] -->|MCP| S[server]\n  S -->|WS| P[player]\n  S --> T[TTS]",
        caption: "The data flow at a glance",
      },
    },
    {
      id: "seg-4",
      title: "A code visual",
      section: "Architecture",
      narration: "Code is syntax-highlighted, with optional line notes.",
      visual: {
        kind: "code",
        language: "typescript",
        filePath: "packages/shared/src/index.ts",
        code: "export const VisualSchema = z.discriminatedUnion('kind', [\n  TitleVisualSchema,\n  DiagramVisualSchema,\n]);",
        highlights: [{ startLine: 1, endLine: 1, note: "the extension point" }],
      },
    },
    {
      id: "seg-5",
      title: "A diff visual",
      section: "Architecture",
      narration: "And changesets still render as diffs.",
      visual: {
        kind: "diff",
        language: "typescript",
        filePath: "session.ts",
        diff:
          "@@ -1,3 +1,3 @@\n-  audioUrl: ttsResult.filePath,\n+  audioUrl: this.audioUrl(ttsResult.filePath),\n   status: 'answering',",
        note: "filename → fetchable URL",
      },
    },
    {
      id: "seg-6",
      title: "Wrap up",
      narration: "That's the showcase. Press play to hear it with narration.",
      visual: {
        kind: "title",
        heading: "Ask anytime",
        subheading: "Pause and type a question — Claude answers aloud.",
      },
    },
  ],
};
