---
name: walkthrough
description: Present a narrated visual walkthrough of a changeset the user can watch, listen to, and interrupt with questions. Use when the user asks to be walked through changes, wants a presentation of what was built, or says "/walkthrough".
---

# Narrated changeset walkthrough

You will author a walkthrough and present it through the `walkthrough` MCP server, which opens a player in the user's browser with spoken narration. The user watches, pauses, and asks questions; you answer them live.

## 1. Gather the changeset

Identify what to walk through: the diff of recent work (use `git diff`, `git show`, or the changes you just made this session). If the scope is ambiguous, ask the user what they want covered.

## 2. Author segments

Call `create_walkthrough({ title, segments })`. Rules for good segments:

- **One paragraph of narration + one visual per segment.** 30 seconds of speech max (~70 words). Many small segments beat few big ones — they are the units of pause/resume.
- **Narration is spoken aloud**: conversational prose, no markdown, no code syntax read-outs ("the isExpired function" not "`isExpired()`"). Refer to what's on screen ("the highlighted lines").
- **Structure**: title slide → fileTree overview → the story of the change → wrap-up title slide.
- **Order by narrative, not by file.** Never walk the diff in file order. Tell the change as a story: the problem or goal first, then the core change, then how the surrounding pieces support it, then tests/verification. Group segments by concept even when that interleaves files, and use short `title` visuals as section breaks for multi-part changesets. A viewer should always know *why* they're looking at the current screen before they see the next one.
- **Visuals**:
  - `{ kind: "title", heading, subheading?, bullets? }` — intro/outro/section breaks
  - `{ kind: "fileTree", files: [{ path, status: added|modified|deleted }] }` — changeset shape
  - `{ kind: "code", filePath, language, content, startLine?, highlights?: [{ startLine, endLine, note? }], isContext? }` — code as it stands; highlight what the narration discusses (line numbers are absolute, matching startLine offset)
  - `{ kind: "diff", filePath, language, unifiedDiff, note? }` — before/after of a change
- Keep code/diff content under ~40 lines per segment; excerpt rather than dump.
- **Don't limit yourself to the diff.** A good walkthrough often needs unchanged code to make a change understandable — the caller of a modified function, the interface being implemented, the config that drives the behavior, the test that exercises it. Read those files and present them as `code` visuals with `isContext: true` (the player labels them "unchanged — shown for context"). Typical pattern: a context segment showing where something is used, followed by the diff segment that changes it.

## 3. Run the event loop — REQUIRED

`create_walkthrough` returns a `walkthroughId`. Immediately enter this loop and stay in it:

```
loop:
  event = await_event({ walkthroughId })
  if event.type == "question":
      think about the answer using your session context
      answer_question({ walkthroughId, questionId, answer })  // plain spoken prose, 2-5 sentences
      continue loop
  if event.type == "none":   // heartbeat timeout
      continue loop          // call await_event again immediately
  if event.type == "completed":
      exit loop, tell the user the walkthrough finished
```

Do not do other work between polls; the user is watching and may ask something at any moment.

**Expanding the walkthrough from a question.** If a question deserves a visual explanation rather than just a spoken one, call `update_walkthrough` with `insertAfterSegmentId` set to the segment id from the question event — the new segments splice in right where the user paused and play next after they resume. Only the new segments get audio generated; existing playback is untouched. Mention in your spoken answer that you've added a section ("I've added two screens right after this one that show..."). Use append (no anchor) only for material that belongs at the end.

## Answer style

Answers are converted to speech. No markdown, no bullet lists, no code blocks. Short sentences, conversational, specific to the question and the segment the user was on.
