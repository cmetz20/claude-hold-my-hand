# Claude Hold My Hand

Narrated, watchable **presentations of anything in your codebase** — not just changesets. Ask Claude to walk you through a PR, explain how a concept works, onboard you to a repo, sketch the architecture, talk through a bug, or teach you to add a feature. A local web player opens with synchronized visuals (title slides, file trees, highlighted code, diffs, and Mermaid diagrams) and spoken narration. Pause at any moment, type a question, and the same Claude session answers out loud — and can even add new slides on the fly — before the presentation resumes.

> **Platform:** Windows (narration uses Windows speech or a local Piper voice). Everything runs locally — no API keys, no cloud TTS.

## Install (as a Claude Code plugin)

Inside any Claude Code session:

```
/plugin marketplace add cmetz20/claude-hold-my-hand
/plugin install claude-hold-my-hand@claude-hold-my-hand
```

The plugin ships a prebuilt server bundle, so there's no clone/npm/build step. Restart Claude Code and just say what you want:

```
/present
```

or "walk me through this PR", "explain how auth works in this repo", "onboard me to this codebase", "why is this test failing?", "show me how to add an endpoint".

## What you get

- **A presentation, not a video** — Claude plans the right *kind* of presentation for your ask (PR, concept, onboarding, architecture, debugging, tutorial, review) and authors small *segments* (one paragraph of narration + one visual each) ordered by narrative. The player renders them live with spoken audio and a table-of-contents sidebar.
- **Five visual kinds** — title slides, file trees, syntax-highlighted code with line notes, unified diffs, and **Mermaid diagrams** for flows and architecture.
- **Interrupt and ask** — pause, type a question, and it routes back to the Claude session with full context, gets answered aloud, then playback resumes. Answers can splice new segments into the presentation mid-stream.
- **Dials** — tune `verbosity`, `depth`, and `audience` so the same topic works for a newcomer or an expert; `voiceSpeed` and `autoPlay` adjust live.
- **Resumable** — segments and audio are cached on disk; refreshes and restarts pick up where you left off.
- **Local TTS** — Windows built-in voice out of the box; drop a Piper `piper.exe` + `.onnx` voice into `tools/piper/` for a more natural neural voice (auto-detected on next start).

## Storage & retention

Presentations persist under `.presentations/` in each project (manifest + audio, a few MB each) so they stay watchable across restarts. They're pruned automatically on every server start: only the **5 newest** are kept, and anything older than **14 days** (except the most recent) is deleted. Tune with `CHMH_KEEP` and `CHMH_MAX_AGE_DAYS`. Add `.presentations/` to your project's `.gitignore`.

## How it works

```
Claude Code ──stdio/MCP──> presentation server ──HTTP/WS──> browser player
                                │                 (localhost:4923+)
                                └── local TTS (SAPI or Piper), cached per segment
```

- **`packages/shared`** — presentation/segment/visual schema and protocol types (zod).
- **`packages/server`** — MCP server exposing `create_presentation`, `await_event` (long-poll for questions/completion), `answer_question`, `add_segments` (mid-stream insert/replace), and `update_settings`; hosts the player and generates narration audio segment-by-segment.
- **`packages/player`** — React player: Shiki-highlighted code, diffs, Mermaid diagrams, a ToC sidebar, transport controls, ask-a-question panel, and spoken answers.
- **`skills/present`** — teaches Claude to plan an intent-appropriate presentation, author good segments, and run the interactive event loop.

## Developing / manual install

```powershell
git clone https://github.com/cmetz20/claude-hold-my-hand.git
cd claude-hold-my-hand
npm install
npm test           # vitest — the full suite
npm run bundle     # builds all packages + self-contained plugin-dist/server.mjs
```

Manual (non-plugin) registration for all your projects:

```powershell
claude mcp add --scope user claude-hold-my-hand -- node "<path>\claude-hold-my-hand\plugin-dist\server.mjs"
```

and copy `skills\present` to `%USERPROFILE%\.claude\skills\present`.

Try it without Claude: `npm run dev:demo` serves a self-driving demo presentation (real audio, canned Q&A) at localhost:4923.

**Before pushing changes**: run `npm run bundle` and commit `plugin-dist/` and `packages/player/dist/` — plugin users run these prebuilt artifacts directly.

## Roadmap

- More visual kinds (terminal output, side-by-side comparison, images).
- macOS/Linux TTS engines.
- Export a presentation to a video file.
