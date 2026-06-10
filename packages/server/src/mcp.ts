import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SegmentInputSchema } from "@chmh/shared";
import { openBrowser, playerUrl, startHost } from "./host.js";
import { log } from "./log.js";
import { sessions } from "./session.js";

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function getSessionOrThrow(walkthroughId: string) {
  const session = sessions.get(walkthroughId);
  if (!session) throw new Error(`Unknown walkthrough: ${walkthroughId}`);
  return session;
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: "claude-hold-my-hand", version: "0.1.0" });

  server.registerTool(
    "create_walkthrough",
    {
      description:
        "Create a narrated visual walkthrough of a changeset and open it in the user's browser. " +
        "Author small segments: one paragraph of narration plus one visual each " +
        "(title slide, file tree, code with highlights, or unified diff). " +
        "After calling this, immediately start calling await_event in a loop to receive " +
        "user questions and the completion signal.",
      inputSchema: {
        title: z.string().describe("Walkthrough title, e.g. 'Auth refactor walkthrough'"),
        segments: z
          .array(SegmentInputSchema)
          .min(1)
          .describe("Ordered segments: { title, narration, visual }"),
      },
    },
    async ({ title, segments }) => {
      await startHost();
      const session = await sessions.create(title, segments);
      openBrowser(playerUrl());
      return jsonResult({
        walkthroughId: session.walkthrough.id,
        playerUrl: playerUrl(),
        segmentCount: session.walkthrough.segments.length,
        next: "Call await_event({ walkthroughId }) now and keep looping until it returns { type: 'completed' }.",
      });
    }
  );

  server.registerTool(
    "await_event",
    {
      description:
        "Long-poll for walkthrough events. Returns { type: 'question', questionId, text, segment } " +
        "when the user pauses and asks something (answer it with answer_question, then keep polling), " +
        "{ type: 'completed' } when playback finishes (stop polling), or { type: 'none' } on timeout " +
        "(just call await_event again).",
      inputSchema: {
        walkthroughId: z.string(),
        timeoutMs: z.number().int().min(1000).max(50000).optional()
          .describe("Max wait before returning { type: 'none' }. Default 45000."),
      },
    },
    async ({ walkthroughId, timeoutMs }) => {
      const session = getSessionOrThrow(walkthroughId);
      const event = await session.awaitEvent(timeoutMs ?? 45000);
      return jsonResult(event);
    }
  );

  server.registerTool(
    "answer_question",
    {
      description:
        "Answer a user question raised during a walkthrough. The answer is spoken aloud and shown " +
        "in the player; keep it conversational, 2-5 sentences, no markdown or code blocks. " +
        "After answering, return to the await_event loop.",
      inputSchema: {
        walkthroughId: z.string(),
        questionId: z.string(),
        answer: z.string().describe("Plain spoken-style prose. No markdown."),
      },
    },
    async ({ walkthroughId, questionId, answer }) => {
      const session = getSessionOrThrow(walkthroughId);
      await session.answerQuestion(questionId, answer);
      return jsonResult({ ok: true, next: "Resume the await_event loop." });
    }
  );

  server.registerTool(
    "update_walkthrough",
    {
      description:
        "Add segments to an existing walkthrough without disturbing playback or regenerating " +
        "existing audio. Pass insertAfterSegmentId to splice new segments in right after a given " +
        "segment (e.g. the one the user paused on when asking a question — its id arrives in the " +
        "question event); omit it to append at the end; pass '' to insert at the very start. " +
        "Passing an existing segment id in a segment replaces that segment in place.",
      inputSchema: {
        walkthroughId: z.string(),
        segments: z.array(SegmentInputSchema).min(1),
        insertAfterSegmentId: z
          .string()
          .optional()
          .describe(
            "Segment id to insert after ('' = start, omit = append at end)"
          ),
      },
    },
    async ({ walkthroughId, segments, insertAfterSegmentId }) => {
      const session = getSessionOrThrow(walkthroughId);
      await session.updateSegments(segments, insertAfterSegmentId);
      return jsonResult({
        ok: true,
        segmentCount: session.walkthrough.segments.length,
      });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  sessions.setClaudeConnected(true);
  transport.onclose = () => {
    sessions.setClaudeConnected(false);
    log("MCP transport closed");
  };
  log("MCP server connected (stdio)");
}
