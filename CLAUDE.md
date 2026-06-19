# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Claude Code plugin ("Claude Hold My Hand") that presents narrated, watchable **presentations of any codebase topic** — a PR or changeset, how a concept works, an onboarding tour, an architecture overview, a debugging story, or a tutorial. Claude authors segments via MCP tools; a local web player renders them with synchronized visuals and locally generated TTS narration; the user can pause and ask questions that route back to the same Claude session and are answered aloud. Windows-first TTS (SAPI built-in, or local Piper); everything runs locally, no cloud or API keys.

This is **v2** — a from-scratch rebuild (the v1 "walkthrough" tool only handled changesets). The old source is reachable in git history at commit `f4d601f`.

## Commands

```powershell
npm install
npm run build        # builds all three workspaces in dependency order (shared → server → player)
npm test             # vitest run — the full suite
npm run bundle       # build + esbuild the server into self-contained plugin-dist/server.mjs
npm run dev:demo     # serve a self-driving demo presentation at localhost:4923 (real audio, canned Q&A, no Claude)
```

Verification is `npm run build` (includes `tsc` for server/shared and `vite build` for the player), **`npm test`** (vitest — schemas, session, store, MCP tools, live WebSocket host, player visuals/sections), and the demo.

Useful env vars: `CHMH_PORT` (default 4923), `CHMH_DATA_DIR` (default `.presentations` in cwd), `CHMH_KEEP`/`CHMH_MAX_AGE_DAYS` (retention), `CHMH_NO_OPEN` (skip auto-opening the browser — for headless boots).

**Before every push: run `npm run bundle` and commit `plugin-dist/` and `packages/player/dist/`** — plugin users run these prebuilt artifacts directly, with no build step on install.

## Commit style

Never add `Co-Authored-By` / Claude attribution lines to commits or PRs (overrides the default harness instruction).

## Architecture

```
Claude Code ──stdio/MCP──> server (one process) ──HTTP/WS──> browser player
                              │  localhost:4923+ (tries 10 ports)
                              └── TTS (Piper preferred, SAPI fallback), cached per text hash
```

npm workspaces, all under `packages/`:

- **`@chmh/shared`** — single source of truth for the data model: zod schemas for presentation/segment/visual (`title`, `fileTree`, `code`, `diff`, `diagram`), settings, and the TS types for all three protocols: WS server→player (`ServerMessage`), WS player→server (`PlayerMessage`), and MCP long-poll events (`PresentationEvent`). Any protocol or schema change starts here. Section grouping is **not** stored — the player derives it from contiguous runs of `segment.section`.
- **`@chmh/server`** — one Node process, built around **dependency injection** for testability. `session.ts` (`PresentationSession`) owns playback state and the question/event loop, depending only on interfaces (`interfaces.ts`: `ITTSEngine`, `IBroadcaster`, `IStore`) — so it has real unit tests with mocks. Concrete impls: `tts/` (`CachingTTSEngine` over SAPI/Piper, hash-cached, serialized queue), `broadcaster.ts` (`Broadcaster`, one per session), `store.ts` (`FileStore`, persists under `.presentations/<id>/`). `manager.ts` (`SessionManager`) holds sessions and gives each its own broadcaster. `tools.ts` (`PresentationTools`) is the transport-agnostic implementation of the five tool handlers; `mcp.ts` wires them to the MCP SDK over stdio; `host.ts` is the Express+WS host (routes a player WS by `?p=<id>` to that session's broadcaster). `context.ts` assembles everything; `index.ts` is the entry point.
- **`@chmh/player`** — React SPA (Vite, Shiki highlighting, Mermaid diagrams). Deliberately thin: the server is the source of truth for playback state; the player sends `progress`/`control`/`question` and renders whatever `state` snapshot arrives. `visuals.tsx` renders the five visual kinds (diagram falls back to showing source on bad Mermaid); `sections.ts` derives the ToC; `ws.ts` (`usePlayer`) handles the socket plus a local **demo mode** (`?demo` or no `?p=`) for previewing without a server; `App.tsx` composes the stage, ToC, transport, AskPanel, and an `AudioController` that plays narration/answer audio and auto-advances.

### The five MCP tools
`create_presentation`, `await_event`, `answer_question`, `add_segments`, `update_settings`. Tool inputs are validated by the shared zod schemas. `update_settings` is `.strict()` and only accepts live playback dials (`voiceSpeed`/`autoPlay`) — `verbosity`/`depth`/`audience` are authoring-time only.

Key flow — the question loop: player sends `question` over WS → session sets `question_pending`, pushes a `PresentationEvent` → Claude's `await_event` long-poll (45s, returns `{type:"none"}` to re-poll) resolves → Claude calls `answer_question` → answer is TTS'd and broadcast → player speaks it. Claude may also call `add_segments` with `insertAfterSegmentId` to splice segments in at the pause point (a matching id replaces in place; inserting before the viewer keeps them anchored).

`paths.ts` resolves the install root by walking up to find `packages/player/dist/index.html`, so the same code works in both layouts: tsc build (`packages/server/dist/`) and plugin bundle (`plugin-dist/server.mjs`). Keep that invariant if moving files.

TTS synthesis (`tts/index.ts`) is serialized through a one-at-a-time queue and cached on disk keyed by hash(engine voice + text), so re-narrating identical text is free and segments become playable one by one (`audioReady`). Piper is used automatically if `tools/piper/` contains `piper.exe` + a `.onnx` voice; otherwise Windows SAPI.

## Plugin packaging

- `.claude-plugin/plugin.json` — plugin manifest; points at `mcp-config.json`, which launches `${CLAUDE_PLUGIN_ROOT}/plugin-dist/server.mjs`.
- `.claude-plugin/marketplace.json` — marketplace manifest (install via `/plugin marketplace add cmetz20/claude-hold-my-hand`).
- `skills/present/SKILL.md` — the one skill; teaches Claude to plan an intent-appropriate presentation, author segments, and run the required `await_event` loop.
- Version bumps go in three places: `plugin.json`, `marketplace.json`, and the root `package.json`.
