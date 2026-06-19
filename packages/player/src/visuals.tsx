import { useEffect, useRef, useState } from "react";
import type {
  Visual,
  TitleVisual,
  FileTreeVisual,
  CodeVisual,
  DiffVisual,
  DiagramVisual,
} from "@chmh/shared";

export function VisualStage({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case "title":
      return <TitleView v={visual} />;
    case "fileTree":
      return <FileTreeView v={visual} />;
    case "code":
      return <CodeView v={visual} />;
    case "diff":
      return <DiffView v={visual} />;
    case "diagram":
      return <DiagramView v={visual} />;
  }
}

// ── title ─────────────────────────────────────────────────────

function TitleView({ v }: { v: TitleVisual }) {
  return (
    <div className="visual visual-title" data-kind="title">
      <h1 className="title-heading">{v.heading}</h1>
      {v.subheading && <p className="title-subheading">{v.subheading}</p>}
      {v.bullets && v.bullets.length > 0 && (
        <ul className="title-bullets">
          {v.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── fileTree ──────────────────────────────────────────────────

const STATUS_MARK: Record<FileTreeVisual["files"][number]["status"], string> = {
  added: "+",
  modified: "~",
  deleted: "−",
  unchanged: " ",
};

function FileTreeView({ v }: { v: FileTreeVisual }) {
  return (
    <div className="visual visual-filetree" data-kind="fileTree">
      {v.rootLabel && <div className="filetree-root">{v.rootLabel}</div>}
      <ul className="filetree-list">
        {v.files.map((f, i) => (
          <li key={i} className={`filetree-item status-${f.status}`}>
            <span className="filetree-mark" aria-hidden="true">
              {STATUS_MARK[f.status]}
            </span>
            <span className="filetree-path">{f.path}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── code ──────────────────────────────────────────────────────

function CodeView({ v }: { v: CodeVisual }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(v.code, { lang: v.language, theme: "github-dark" }),
      )
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setHtml(null); // fall back to plain text
      });
    return () => {
      cancelled = true;
    };
  }, [v.code, v.language]);

  return (
    <div className="visual visual-code" data-kind="code">
      {v.filePath && (
        <div className="code-filepath">
          {v.filePath}
          {v.isContext && (
            <span className="code-context-badge">unchanged — context</span>
          )}
        </div>
      )}
      {html ? (
        <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="code-block code-block-plain">
          <code>{v.code}</code>
        </pre>
      )}
      {v.highlights && v.highlights.length > 0 && (
        <ul className="code-highlights">
          {v.highlights.map((h, i) => (
            <li key={i}>
              <span className="code-highlight-lines">
                L{h.startLine}
                {h.endLine !== h.startLine ? `–${h.endLine}` : ""}
              </span>
              {h.note && <span className="code-highlight-note">{h.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── diff ──────────────────────────────────────────────────────

type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

function DiffView({ v }: { v: DiffVisual }) {
  const lines = v.diff.split("\n");
  return (
    <div className="visual visual-diff" data-kind="diff">
      {v.filePath && <div className="diff-filepath">{v.filePath}</div>}
      <pre className="diff-block">
        {lines.map((line, i) => (
          <div key={i} className={`diff-line diff-${classifyDiffLine(line)}`}>
            {line || " "}
          </div>
        ))}
      </pre>
      {v.note && <div className="diff-note">{v.note}</div>}
    </div>
  );
}

// ── diagram (Mermaid) ─────────────────────────────────────────

let mermaidReady = false;
let diagramSeq = 0;

function DiagramView({ v }: { v: DiagramVisual }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mmd-${++diagramSeq}`);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSvg(null);

    import("mermaid")
      .then(async ({ default: mermaid }) => {
        if (!mermaidReady) {
          mermaid.initialize({ startOnLoad: false, theme: "dark" });
          mermaidReady = true;
        }
        const { svg } = await mermaid.render(idRef.current, v.source);
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        // Invalid Mermaid must not blank the segment — show the source instead.
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [v.source]);

  return (
    <div className="visual visual-diagram" data-kind="diagram">
      {failed ? (
        <div className="diagram-fallback" data-fallback="true">
          <div className="diagram-fallback-note">
            Could not render this diagram — showing its source:
          </div>
          <pre className="code-block code-block-plain">
            <code>{v.source}</code>
          </pre>
        </div>
      ) : svg ? (
        <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="diagram-loading">Rendering diagram…</div>
      )}
      {v.caption && <div className="diagram-caption">{v.caption}</div>}
    </div>
  );
}
