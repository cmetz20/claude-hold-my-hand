import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { VisualStage } from "../visuals.js";

// Keep the heavy async libraries out of the tests.
vi.mock("shiki", () => ({
  codeToHtml: async (code: string) => `<pre class="shiki">${code}</pre>`,
}));

const mermaidRender = vi.fn();
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: (...args: unknown[]) => mermaidRender(...args),
  },
}));

afterEach(() => {
  cleanup();
  mermaidRender.mockReset();
});

describe("VisualStage", () => {
  it("renders a title visual", () => {
    const { container } = render(
      <VisualStage
        visual={{
          kind: "title",
          heading: "Welcome",
          subheading: "A tour",
          bullets: ["One", "Two"],
        }}
      />,
    );
    expect(container.querySelector('[data-kind="title"]')).toBeTruthy();
    expect(container.textContent).toContain("Welcome");
    expect(container.textContent).toContain("A tour");
    expect(container.querySelectorAll(".title-bullets li")).toHaveLength(2);
  });

  it("renders a file tree with status marks", () => {
    const { container } = render(
      <VisualStage
        visual={{
          kind: "fileTree",
          rootLabel: "packages/server",
          files: [
            { path: "a.ts", status: "added" },
            { path: "b.ts", status: "deleted" },
            { path: "c.ts", status: "unchanged" },
          ],
        }}
      />,
    );
    expect(container.textContent).toContain("packages/server");
    expect(container.querySelector(".status-added")).toBeTruthy();
    expect(container.querySelector(".status-deleted")).toBeTruthy();
    expect(container.querySelector(".status-unchanged")).toBeTruthy();
    expect(container.querySelectorAll(".filetree-item")).toHaveLength(3);
  });

  it("renders code (plain fallback) with file path, context badge, and highlight notes", () => {
    const { container } = render(
      <VisualStage
        visual={{
          kind: "code",
          language: "typescript",
          code: "const answer = 42;",
          filePath: "src/x.ts",
          isContext: true,
          highlights: [{ startLine: 1, endLine: 2, note: "the key bit" }],
        }}
      />,
    );
    expect(container.textContent).toContain("const answer = 42;");
    expect(container.textContent).toContain("src/x.ts");
    expect(container.textContent).toContain("context");
    expect(container.textContent).toContain("the key bit");
  });

  it("classifies diff lines by type", () => {
    const { container } = render(
      <VisualStage
        visual={{
          kind: "diff",
          language: "typescript",
          diff: "@@ -1 +1 @@\n-old line\n+new line\n unchanged",
          note: "swapped impl",
        }}
      />,
    );
    expect(container.querySelector(".diff-hunk")).toBeTruthy();
    expect(container.querySelector(".diff-del")).toBeTruthy();
    expect(container.querySelector(".diff-add")).toBeTruthy();
    expect(container.querySelector(".diff-ctx")).toBeTruthy();
    expect(container.textContent).toContain("swapped impl");
  });

  it("renders a diagram's SVG when Mermaid succeeds", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg><g>ok</g></svg>" });
    const { container } = render(
      <VisualStage
        visual={{
          kind: "diagram",
          source: "graph TD\n A-->B",
          caption: "the flow",
        }}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector(".diagram-svg")).toBeTruthy(),
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toContain("the flow");
  });

  it("falls back to source when Mermaid fails (finding #10)", async () => {
    mermaidRender.mockRejectedValue(new Error("parse error"));
    const { container } = render(
      <VisualStage
        visual={{ kind: "diagram", source: "graph TD\n A--oops" }}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-fallback="true"]')).toBeTruthy(),
    );
    expect(container.textContent).toContain("A--oops");
  });
});
