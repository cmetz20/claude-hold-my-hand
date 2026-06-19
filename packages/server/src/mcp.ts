import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CreatePresentationInputSchema,
  AddSegmentsInputSchema,
  AwaitEventInputSchema,
  AnswerQuestionInputSchema,
  UpdateSettingsInputSchema,
} from "@chmh/shared";
import { log } from "./log.js";
import type { PresentationTools } from "./tools.js";

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export async function startMcpServer(tools: PresentationTools): Promise<void> {
  const server = new McpServer({
    name: "claude-hold-my-hand",
    version: "2.0.0-alpha.0",
  });

  server.registerTool(
    "create_presentation",
    {
      description:
        "Create a narrated visual presentation and open it in the user's browser. Works for ANY " +
        "codebase topic — a PR or changeset, how a concept works, onboarding, an architecture " +
        "overview, a debugging story, or a tutorial. Author small segments: one paragraph of " +
        "narration plus one visual each (title, fileTree, code with highlights, diff, or a Mermaid " +
        "diagram). Set `intent` to the kind of presentation and optionally `settings` " +
        "(verbosity/depth/audience). After calling this, immediately begin calling await_event in a " +
        "loop to receive the user's questions and the completion signal.",
      inputSchema: CreatePresentationInputSchema.shape,
    },
    async (args) => jsonResult(await tools.createPresentation(args)),
  );

  server.registerTool(
    "await_event",
    {
      description:
        "Long-poll for presentation events. Returns { type: 'question', questionId, text, segment } " +
        "when the user pauses and asks something (answer it with answer_question, then keep polling), " +
        "{ type: 'completed' } when playback finishes (stop polling), or { type: 'none' } on timeout " +
        "(call await_event again). Do not do other work between polls — the user may interrupt at any time.",
      inputSchema: AwaitEventInputSchema.shape,
    },
    async (args) => jsonResult(await tools.awaitEvent(args)),
  );

  server.registerTool(
    "answer_question",
    {
      description:
        "Answer a user question raised during a presentation. Spoken aloud and shown in the player — " +
        "keep it conversational, 2-5 sentences, no markdown or code blocks. If the answer deserves " +
        "visuals, also call add_segments with insertAfterSegmentId to splice them in. After answering, " +
        "return to the await_event loop.",
      inputSchema: AnswerQuestionInputSchema.shape,
    },
    async (args) => jsonResult(await tools.answerQuestion(args)),
  );

  server.registerTool(
    "add_segments",
    {
      description:
        "Add or replace segments in an existing presentation without disturbing playback or " +
        "regenerating unchanged audio. Pass insertAfterSegmentId to splice new segments right after a " +
        "given segment (e.g. the one the user paused on — its id arrives in the question event); omit " +
        "it to append at the end; pass '' to insert at the very start. Passing an existing segment id " +
        "replaces that segment in place.",
      inputSchema: AddSegmentsInputSchema.shape,
    },
    async (args) => jsonResult(await tools.addSegments(args)),
  );

  server.registerTool(
    "update_settings",
    {
      description:
        "Update live playback settings (voiceSpeed 0.5-2.0, autoPlay). Note: verbosity/depth/audience " +
        "are authoring-time only and are fixed at creation — they cannot be changed here.",
      inputSchema: UpdateSettingsInputSchema.shape,
    },
    async (args) => jsonResult(await tools.updateSettings(args)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  transport.onclose = () => log("MCP transport closed");
  log("MCP server connected (stdio)");
}
