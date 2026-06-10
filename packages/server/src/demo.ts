/**
 * Demo harness: serves a fixture walkthrough and plays the role of Claude on
 * the other end of the event loop (answers questions with canned text).
 * Run with: npm run dev:demo
 */
import type { SegmentInput } from "@chmh/shared";
import { openBrowser, playerUrl, startHost } from "./host.js";
import { log } from "./log.js";
import { sessions } from "./session.js";
import * as store from "./store.js";

const fixtureSegments: SegmentInput[] = [
  {
    title: "Welcome",
    narration:
      "Welcome to the walkthrough of the session timeout fix. In the next two minutes we'll look at the three files that changed, why the bug happened, and how the new keep-alive logic works. Press space at any time to pause and ask a question.",
    visual: {
      kind: "title",
      heading: "Session Timeout Fix",
      subheading: "3 files changed · demo walkthrough",
      bullets: [
        "Root cause: stale expiry check",
        "New keep-alive heartbeat",
        "Regression test added",
      ],
    },
  },
  {
    title: "What changed",
    narration:
      "Here's the shape of the changeset. The session manager was modified to fix the expiry comparison, a new heartbeat module was added to keep active sessions alive, and a regression test pins down the original bug.",
    visual: {
      kind: "fileTree",
      files: [
        { path: "src/auth/sessionManager.ts", status: "modified" },
        { path: "src/auth/heartbeat.ts", status: "added" },
        { path: "test/sessionTimeout.test.ts", status: "added" },
      ],
    },
  },
  {
    title: "The bug",
    narration:
      "This is the heart of the fix. The old code compared the session expiry against the time the session was created, not the current time, so sessions could outlive their expiry forever. The highlighted line now compares against Date.now, and the grace window moved into a named constant.",
    visual: {
      kind: "diff",
      filePath: "src/auth/sessionManager.ts",
      language: "typescript",
      unifiedDiff: `--- a/src/auth/sessionManager.ts
+++ b/src/auth/sessionManager.ts
@@ -41,9 +41,10 @@ export class SessionManager {
+  private static GRACE_MS = 30_000;
+
   isExpired(session: Session): boolean {
-    // BUG: compared against creation time
-    return session.expiresAt < session.createdAt;
+    return session.expiresAt + SessionManager.GRACE_MS < Date.now();
   }
`,
      note: "expiresAt was compared to createdAt — always false",
    },
  },
  {
    title: "Where expiry is checked",
    narration:
      "Before we look at the new heartbeat, here's the unchanged middleware that calls the expiry check on every request. Nothing here was modified — it's shown so you can see why a wrong isExpired result silently let stale sessions through.",
    visual: {
      kind: "code",
      filePath: "src/middleware/requireSession.ts",
      language: "typescript",
      isContext: true,
      startLine: 12,
      content: `export function requireSession(manager: SessionManager) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = manager.fromRequest(req);
    if (!session || manager.isExpired(session)) {
      return res.status(401).json({ error: "session expired" });
    }
    req.session = session;
    next();
  };
}`,
      highlights: [{ startLine: 15, endLine: 15, note: "every request flows through this check" }],
    },
  },
  {
    title: "Keep-alive heartbeat",
    narration:
      "The new heartbeat module pings active sessions every sixty seconds. Note the highlighted section: it only extends sessions that have seen user activity, so idle sessions still expire on schedule.",
    visual: {
      kind: "code",
      filePath: "src/auth/heartbeat.ts",
      language: "typescript",
      content: `import { SessionManager } from "./sessionManager";

const HEARTBEAT_INTERVAL_MS = 60_000;

export function startHeartbeat(manager: SessionManager): () => void {
  const timer = setInterval(() => {
    for (const session of manager.activeSessions()) {
      if (session.lastActivityAt > session.lastHeartbeatAt) {
        manager.extend(session.id);
      }
      session.lastHeartbeatAt = Date.now();
    }
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}`,
      highlights: [
        { startLine: 8, endLine: 10, note: "only active sessions get extended" },
      ],
    },
  },
  {
    title: "Wrap-up",
    narration:
      "That's the whole change. The expiry check is fixed, active sessions stay alive through the heartbeat, and the regression test fails on the old code and passes on the new. Thanks for watching — ask anything, or close the tab when you're done.",
    visual: {
      kind: "title",
      heading: "Done!",
      bullets: [
        "isExpired() now uses Date.now()",
        "Heartbeat extends only active sessions",
        "Regression test covers the original bug",
      ],
    },
  },
];

async function main(): Promise<void> {
  await store.pruneOld();
  await startHost();
  const session = await sessions.create("Demo: Session Timeout Fix", fixtureSegments);
  log(`demo walkthrough ${session.walkthrough.id} at ${playerUrl()}`);
  openBrowser(playerUrl());

  // Play Claude's role: answer questions with canned text.
  for (;;) {
    const event = await session.awaitEvent(60_000);
    if (event.type === "question") {
      log(`question received: "${event.text}" — sending canned answer`);
      await session.answerQuestion(
        event.questionId,
        `Good question about ${event.segment.title}. This is the demo harness, so I'm a canned answer rather than the real Claude. In a live session, the Claude that wrote the change would answer you here, with full context. You asked: ${event.text}`
      );
    } else if (event.type === "completed") {
      log("walkthrough completed — demo keeps serving for replay. Ctrl+C to exit.");
    }
  }
}

main().catch((err) => {
  log("demo fatal:", err);
  process.exit(1);
});
