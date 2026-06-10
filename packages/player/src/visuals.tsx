import { useEffect, useState } from "react";
import { codeToTokens, type ThemedToken } from "shiki";
import type { Highlight, Visual } from "@chmh/shared";

// ---------- shiki tokenization ----------

function useTokens(code: string, lang: string): ThemedToken[][] | null {
  const [lines, setLines] = useState<ThemedToken[][] | null>(null);
  useEffect(() => {
    let alive = true;
    setLines(null);
    codeToTokens(code, { lang: lang as never, theme: "github-dark" })
      .then((r) => alive && setLines(r.tokens))
      .catch(() =>
        alive &&
        setLines(
          code.split("\n").map((l) => [{ content: l, offset: 0 } as ThemedToken])
        )
      );
    return () => {
      alive = false;
    };
  }, [code, lang]);
  return lines;
}

function TokenLine({ tokens }: { tokens: ThemedToken[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: t.color }}>
          {t.content}
        </span>
      ))}
      {tokens.length === 0 ? " " : null}
    </>
  );
}

// ---------- visuals ----------

function TitleVisual({ v }: { v: Extract<Visual, { kind: "title" }> }) {
  return (
    <div className="visual-title">
      <h1>{v.heading}</h1>
      {v.subheading && <p className="subheading">{v.subheading}</p>}
      {v.bullets && (
        <ul>
          {v.bullets.map((b, i) => (
            <li key={i} style={{ animationDelay: `${0.3 + i * 0.35}s` }}>
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const statusIcon = { added: "+", modified: "~", deleted: "−" } as const;

function FileTreeVisual({ v }: { v: Extract<Visual, { kind: "fileTree" }> }) {
  return (
    <div className="visual-filetree">
      {v.files.map((f, i) => (
        <div
          key={f.path}
          className={`file-row ${f.status}`}
          style={{ animationDelay: `${i * 0.25}s` }}
        >
          <span className="file-status">{statusIcon[f.status]}</span>
          <span className="file-path">{f.path}</span>
          <span className="file-badge">{f.status}</span>
        </div>
      ))}
    </div>
  );
}

function CodeVisual({ v }: { v: Extract<Visual, { kind: "code" }> }) {
  const lines = useTokens(v.content, v.language);
  const start = v.startLine ?? 1;
  const isHighlighted = (lineNo: number): Highlight | undefined =>
    v.highlights?.find((h) => lineNo >= h.startLine && lineNo <= h.endLine);
  return (
    <div className="visual-code">
      <div className="code-header">
        {v.filePath}
        {v.isContext && (
          <span className="context-badge">unchanged — shown for context</span>
        )}
      </div>
      <pre className="code-pane">
        {lines === null ? (
          <div className="code-loading">highlighting…</div>
        ) : (
          lines.map((tokens, i) => {
            const lineNo = start + i;
            const hl = isHighlighted(lineNo);
            const isNoteAnchor = hl && lineNo === hl.startLine && hl.note;
            return (
              <div key={i} className={`code-line${hl ? " highlighted" : ""}`}>
                <span className="line-no">{lineNo}</span>
                <span className="line-content">
                  <TokenLine tokens={tokens} />
                </span>
                {isNoteAnchor && <span className="line-note">◀ {hl.note}</span>}
              </div>
            );
          })
        )}
      </pre>
    </div>
  );
}

function DiffVisual({ v }: { v: Extract<Visual, { kind: "diff" }> }) {
  const lines = v.unifiedDiff.replace(/\n$/, "").split("\n");
  return (
    <div className="visual-code">
      <div className="code-header">
        {v.filePath}
        {v.note && <span className="diff-note">{v.note}</span>}
      </div>
      <pre className="code-pane">
        {lines.map((line, i) => {
          let cls = "ctx";
          if (line.startsWith("+++") || line.startsWith("---")) cls = "meta";
          else if (line.startsWith("@@")) cls = "hunk";
          else if (line.startsWith("+")) cls = "add";
          else if (line.startsWith("-")) cls = "del";
          return (
            <div key={i} className={`diff-line ${cls}`}>
              <span className="line-content">{line || " "}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

export function VisualStage({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case "title":
      return <TitleVisual v={visual} />;
    case "fileTree":
      return <FileTreeVisual v={visual} />;
    case "code":
      return <CodeVisual v={visual} />;
    case "diff":
      return <DiffVisual v={visual} />;
  }
}
