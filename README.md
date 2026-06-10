# Claude Hold My Hand

Narrated, watchable walkthroughs of Claude Code changesets. After Claude builds something, ask it to walk you through the changes: a local web player opens with synchronized visuals (title slides, file trees, highlighted code, diffs) and spoken narration. Pause at any moment, type a question, and the same Claude session that wrote the code answers out loud before the walkthrough resumes.

## How it works

```
Claude Code ──stdio/MCP──> walkthrough server ──HTTP/WS──> browser player
                                │
                                └── local TTS (Windows SAPI, or Piper if installed)
```

- **`packages/shared`** — walkthrough schema (segments = one paragraph of narration + one visual each) and zod validation.
- **`packages/server`** — MCP server exposing `create_walkthrough`, `await_event` (long-poll for questions/completion), `answer_question`, `update_walkthrough`; also hosts the player on `http://localhost:4923` and generates narration audio segment-by-segment with on-disk caching.
- **`packages/player`** — React player: Shiki-highlighted code, diff rendering, transport controls (space to pause, arrows to skip), ask-a-question panel, spoken answers.

Walkthroughs persist under `.walkthroughs/<id>/` (manifest + cached audio), so a crash, refresh, or restart resumes where you left off — nothing regenerates.

## Setup

```powershell
npm install
npm run build
```

Register the MCP server with Claude Code — this repo's `.mcp.json` does it for this project; for use in other projects:

```powershell
claude mcp add walkthrough -- node C:\dev\ClaudeHoldMyHand\packages\server\dist\index.js
```

Then in a Claude Code session: **"/walkthrough"** or "walk me through what you just built".

## Better voice (optional)

The default voice is Windows' built-in TTS (zero install). For a much nicer neural voice:

```powershell
npm run setup:piper
```

This downloads [Piper](https://github.com/rhasspy/piper) and the `en_US-lessac-medium` voice into `tools/piper/`; the server picks it up automatically on next start.

## Try it without Claude

```powershell
npm run dev:demo
```

Serves a fixture walkthrough and answers questions with canned text, exercising the full pipeline (TTS, player, pause/ask/resume).

## Roadmap

- Per-sentence highlight cues within a segment.
- Export a walkthrough to a video file.
