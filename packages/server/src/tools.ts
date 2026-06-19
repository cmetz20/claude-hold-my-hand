import {
  CreatePresentationInputSchema,
  AddSegmentsInputSchema,
  AwaitEventInputSchema,
  AnswerQuestionInputSchema,
  UpdateSettingsInputSchema,
  type PresentationEvent,
  type PresentationSettings,
} from "@chmh/shared";
import type { SessionManager } from "./manager.js";
import type { PresentationSession } from "./session.js";

export interface PresentationToolsDeps {
  manager: SessionManager;
  /** Base URL the player is served from, e.g. "http://localhost:4923". */
  baseUrl: string;
  /** Side effect to open the player; omitted in tests. */
  openBrowser?: (url: string) => void;
}

/**
 * The five MCP tool handlers, as plain async methods over a SessionManager.
 * Each validates its raw input with the shared zod schema (throwing on invalid
 * input, which the MCP transport surfaces as a tool error) and delegates to the
 * session. Kept transport-agnostic so they can be unit-tested directly; the
 * stdio/SDK wiring lives in mcp.ts (Phase 5).
 */
export class PresentationTools {
  constructor(private readonly deps: PresentationToolsDeps) {}

  private requireSession(id: string): PresentationSession {
    const session = this.deps.manager.get(id);
    if (!session) {
      throw new Error(`Unknown presentationId: ${id}`);
    }
    return session;
  }

  async createPresentation(raw: unknown): Promise<{
    presentationId: string;
    playerUrl: string;
    segmentCount: number;
  }> {
    const input = CreatePresentationInputSchema.parse(raw);
    const session = this.deps.manager.create(input);
    const presentation = session.getPresentation();
    const playerUrl = `${this.deps.baseUrl}/?p=${presentation.id}`;

    // Audio generation runs in the background so the tool returns promptly and
    // the player can start as soon as the first segment's audio is ready.
    void session.generateAudio().catch(() => {});
    this.deps.openBrowser?.(playerUrl);

    return {
      presentationId: presentation.id,
      playerUrl,
      segmentCount: presentation.segments.length,
    };
  }

  async addSegments(
    raw: unknown,
  ): Promise<{ ok: true; segmentCount: number }> {
    const input = AddSegmentsInputSchema.parse(raw);
    const session = this.requireSession(input.presentationId);
    const segmentCount = await session.addSegments(
      input.segments,
      input.insertAfterSegmentId,
    );
    return { ok: true, segmentCount };
  }

  async awaitEvent(raw: unknown): Promise<PresentationEvent> {
    const input = AwaitEventInputSchema.parse(raw);
    const session = this.requireSession(input.presentationId);
    return session.awaitEvent(input.timeoutMs);
  }

  async answerQuestion(raw: unknown): Promise<{ ok: boolean }> {
    const input = AnswerQuestionInputSchema.parse(raw);
    const session = this.requireSession(input.presentationId);
    const ok = await session.answerQuestion(input.questionId, input.answer);
    return { ok };
  }

  async updateSettings(
    raw: unknown,
  ): Promise<{ ok: true; settings: PresentationSettings }> {
    const input = UpdateSettingsInputSchema.parse(raw);
    const session = this.requireSession(input.presentationId);
    const settings = session.updateSettings(input.settings);
    return { ok: true, settings };
  }
}
