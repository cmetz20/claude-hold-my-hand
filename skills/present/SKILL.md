---
name: present
description: >-
  Build a narrated, watchable presentation about anything in a codebase — a PR
  or changeset, how a concept works, an onboarding tour, an architecture
  overview, a debugging story, or a tutorial. The user watches in a local
  browser player with spoken narration and can pause to ask questions that you
  answer aloud in real time. Trigger on requests like "walk me through…",
  "explain how X works", "give me a tour", "present this PR", "onboard me to
  this repo", "show me how to add a…", or an explicit /present.
---

# Present: narrated visual presentations

You author a sequence of **segments** (one paragraph of spoken narration + one
visual each). A local server speaks them aloud in a browser player. The user can
pause and ask questions at any moment; those route back to you and you answer
aloud. This is interactive — once you create a presentation you MUST run the
event loop until it completes.

## 1. Plan before you author

Spend a moment deciding what kind of presentation this is and how to shape it.
Do NOT skip this — it's what makes the result feel tailored instead of generic.

1. **Intent** — which of these best fits the request? `pr`, `concept`,
   `onboarding`, `architecture`, `debugging`, `tutorial`, `review`, or `custom`.
   Pass it as `intent`; when unsure, use `custom`. You don't have to be perfect.
2. **Scope** — specific files, one subsystem, or the whole repo? Read only what
   you need to tell the story.
3. **Audience** — infer from the request (a newcomer asking "what is this repo"
   is a beginner; "explain the retry semantics" is an expert). This sets how
   much background you include.
4. **Outline** — sketch 4–15 segment titles with a visual type for each and a
   clear narrative arc. Order by the STORY, not by file order.
5. **Read the code** the outline needs, then author all segments and call
   `create_presentation`.

## 2. Per-intent shape

Use these as starting points, not rigid templates.

| Intent | Open with | Core | Close with |
|--------|-----------|------|------------|
| `pr` | title + fileTree of the changes | walk diffs in narrative order | impact summary |
| `concept` | a **diagram** of the big picture | trace the code path with `code` | key takeaways |
| `onboarding` | title + repo fileTree | tour key subsystems; show how to run it | where to go next |
| `architecture` | a **diagram** of the data flow | zoom into each layer with `code` | how it all connects |
| `debugging` | title stating the symptom | detective story: symptom → cause → fix | how to verify |
| `tutorial` | title of what we'll build | step-by-step `code` + fileTree | the finished result |
| `review` | title of what's reviewed | findings grouped by `section` (severity) | summary + actions |

Reach for **examples and background** when the audience needs them: a concept
explanation for a beginner should build a tiny illustrative example, not just
point at existing code.

## 3. Authoring rules

- **One idea per segment.** Narration is ONE short paragraph (~2–5 sentences) of
  spoken prose — no markdown, no bullet characters, no reading code aloud
  symbol-by-symbol. It's heard, not read.
- **Pick the right visual** for each segment:
  - `title` — section breaks, intros, takeaways (`heading`, `subheading?`, `bullets?`)
  - `fileTree` — repo/changeset shape (`files: [{path, status}]`, status is
    `added`/`modified`/`deleted`/`unchanged`)
  - `code` — real source, syntax-highlighted (`language`, `code`, `filePath?`,
    `startLine?`, `highlights?` for line notes, `isContext: true` for unchanged
    code shown only for understanding). Keep under ~40 lines.
  - `diff` — unified diffs for changesets (`language`, `diff`, `filePath?`, `note?`)
  - `diagram` — a **Mermaid** diagram (`source`, `caption?`) for flows,
    sequences, and architecture. Keep it readable; favor 5–12 nodes.
- **Group with sections.** Set `section` on segments to create table-of-contents
  groups in the player. Sections are *contiguous runs* — give consecutive
  segments the same `section` label.
- **Settings** (optional): `verbosity` (brief/standard/detailed), `depth`
  (overview/standard/deep-dive), `audience` (beginner/intermediate/expert) shape
  how you author and are fixed at creation. `voiceSpeed` and `autoPlay` are live.

## 4. The event loop (required)

After `create_presentation`, immediately loop on `await_event`. The user is
watching and may interrupt at any moment, so do not do other work between polls.

- `{ type: "question", questionId, text, segment }` — the user paused and asked.
  Answer with `answer_question` using plain spoken prose (2–5 sentences, no
  markdown). If the question deserves visuals, ALSO call `add_segments` with
  `insertAfterSegmentId` set to the segment id from the event to splice new
  segments in right after the pause point, and mention in your spoken answer
  that you've added a section. Then resume polling.
- `{ type: "none" }` — a heartbeat timeout; just call `await_event` again.
- `{ type: "completed" }` — playback finished; stop the loop.

## 5. Tools

- `create_presentation({ title, intent?, segments, settings? })` → opens the
  player, returns `{ presentationId, playerUrl, segmentCount }`.
- `await_event({ presentationId, timeoutMs? })` → the loop above.
- `answer_question({ presentationId, questionId, answer })` → spoken answer.
- `add_segments({ presentationId, segments, insertAfterSegmentId? })` →
  `''` = prepend, omit = append, a segment id = splice after it; a matching id
  replaces that segment.
- `update_settings({ presentationId, settings })` → live `voiceSpeed`/`autoPlay`.
