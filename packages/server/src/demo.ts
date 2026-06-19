import type { SegmentInput } from "@chmh/shared";
import { createContext } from "./context.js";
import { openBrowser } from "./host.js";
import { log } from "./log.js";

const segments: SegmentInput[] = [
  {
    title: "Welcome",
    section: "Overview",
    narration:
      "Welcome to a quick demo of the narrated presentation player. Press play to hear me speak.",
    visual: {
      kind: "title",
      heading: "Claude Hold My Hand",
      subheading: "A presentation about anything in your codebase",
      bullets: ["Concepts", "Onboarding", "Architecture", "PRs and reviews"],
    },
  },
  {
    title: "The flow",
    section: "Overview",
    narration:
      "Claude talks to a small local server, which hosts this player and speaks each segment aloud.",
    visual: {
      kind: "diagram",
      source:
        "graph LR\n  C[Claude] -->|MCP| S[server]\n  S -->|WebSocket| P[player]\n  S --> T[local TTS]",
      caption: "How the pieces connect",
    },
  },
  {
    title: "Ask anytime",
    narration:
      "Pause whenever you like and type a question. In a real session Claude answers aloud and can even add new slides.",
    visual: {
      kind: "title",
      heading: "Pause and ask",
      subheading: "Try it — this demo answers with a canned reply.",
    },
  },
];

async function main(): Promise<void> {
  const ctx = await createContext();
  const { presentationId, playerUrl } = await ctx.tools.createPresentation({
    title: "Demo — narrated presentation",
    intent: "onboarding",
    segments,
  });
  log(`demo presentation at ${playerUrl}`);
  openBrowser(playerUrl);

  // Stand in for Claude: answer any question with a canned reply, keep alive.
  for (;;) {
    const event = await ctx.tools.awaitEvent({ presentationId, timeoutMs: 30000 });
    if (event.type === "question") {
      await ctx.tools.answerQuestion({
        presentationId,
        questionId: event.questionId,
        answer:
          "Great question. This is a canned demo answer, but in a real session Claude would answer from the code it just walked you through, and could splice in new slides too.",
      });
    }
  }
}

main().catch((err) => {
  log("demo fatal:", err);
  process.exit(1);
});
