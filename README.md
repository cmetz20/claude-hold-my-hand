# Claude Hold My Hand

Narrated, watchable walkthroughs of Claude Code changesets. After Claude builds something, ask it to walk you through the changes: a local web player opens with synchronized visuals (title slides, file trees, highlighted code, diffs) and spoken narration. Pause at any moment, type a question, and the same Claude session that wrote the code answers out loud before the walkthrough resumes.

> **Platform:** Windows (narration uses Windows speech or a local Piper voice). Everything runs locally — no API keys, no cloud TTS.

## Install (as a Claude Code plugin)

Inside any Claude Code session:

```
/plugin marketplace add cmetz20/claude-hold-my-hand
/plugin install walkthrough@claude-hold-my-hand
```

That's it — the plugin ships a prebuilt server bundle, so there's no clone/npm/build step. Restart Claude Code, finish some work in any project, and say:

```
/walkthrough
```

or just "walk me through what you just built".

## What you get

- **A presentation, not a video** — Claude authors small *segments* (one paragraph of narration + one visual each) ordered by narrative, not by file. The player renders them live with spoken audio.
- **Interrupt and ask** — space pauses; type a question and it routes back to the Claude session that wrote the code (full context), gets answered aloud, then playback resumes. Questions can even splice new segments into the walkthrough mid-stream.
- **Resumable everything** — segments and audio are cached on disk; refreshes, crashes, and restarts pick up where you left off.
- **Local TTS** — Windows built-in voice out of the box; run `npm run setup:piper` in the plugin/repo directory for a much more natural neural voice (auto-detected on next start).

## Storage & retention

Walkthroughs persist under `.walkthroughs/` in each project (manifest + audio, a few MB each) so they stay watchable across restarts. They're pruned automatically on every server start: only the **5 newest** are kept, and anything older than **14 days** (except the most recent) is deleted. Tune with `CHMH_KEEP` and `CHMH_MAX_AGE_DAYS` env vars. Add `.walkthroughs/` to your project's `.gitignore`.

## How it works

```
Claude Code ──stdio/MCP──> walkthrough server ──HTTP/WS──> browser player
                                │                (localhost:4923+)
                                └── local TTS (SAPI or Piper), cached per segment
```

- **`packages/shared`** — walkthrough/segment schema (zod).
- **`packages/server`** — MCP server exposing `create_walkthrough`, `await_event` (long-poll for questions/completion), `answer_question`, `update_walkthrough` (supports mid-stream insertion); hosts the player and generates narration audio segment-by-segment.
- **`packages/player`** — React player: Shiki-highlighted code, diff rendering, transport controls, ask-a-question panel, spoken answers.
- **`skills/walkthrough`** — teaches Claude to author good walkthroughs (narrative order, context beyond the diff, the event loop protocol).

## Developing / manual install

```powershell
git clone https://github.com/cmetz20/claude-hold-my-hand.git
cd claude-hold-my-hand
npm install
npm run bundle     # builds all packages + self-contained plugin-dist/server.mjs
```

Manual (non-plugin) registration for all your projects:

```powershell
claude mcp add --scope user walkthrough -- node "<path>\claude-hold-my-hand\plugin-dist\server.mjs"
```

and copy `skills\walkthrough` to `%USERPROFILE%\.claude\skills\walkthrough`.

Try it without Claude: `npm run dev:demo` serves a fixture walkthrough with canned Q&A.

**Before pushing changes**: run `npm run bundle` and commit `plugin-dist/` and `packages/player/dist/` — plugin users run these prebuilt artifacts directly.

## Roadmap

- Per-sentence highlight cues within a segment.
- macOS/Linux TTS engines.
- Export a walkthrough to a video file.
