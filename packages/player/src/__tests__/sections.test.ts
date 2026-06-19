import { describe, it, expect } from "vitest";
import type { Segment } from "@chmh/shared";
import { deriveTocGroups } from "../sections.js";

function seg(id: string, section?: string): Segment {
  return {
    id,
    title: id,
    narration: "x",
    visual: { kind: "title", heading: "h" },
    ...(section ? { section } : {}),
  };
}

describe("deriveTocGroups", () => {
  it("returns empty when no segment has a section", () => {
    expect(deriveTocGroups([seg("a"), seg("b")])).toEqual([]);
  });

  it("groups a single contiguous run", () => {
    const groups = deriveTocGroups([
      seg("a", "Intro"),
      seg("b", "Intro"),
      seg("c", "Intro"),
    ]);
    expect(groups).toEqual([
      { label: "Intro", startIndex: 0, count: 3, segmentIds: ["a", "b", "c"] },
    ]);
  });

  it("starts a new group when the label changes", () => {
    const groups = deriveTocGroups([
      seg("a", "Intro"),
      seg("b", "Deep Dive"),
      seg("c", "Deep Dive"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Intro", "Deep Dive"]);
    expect(groups[1]).toEqual({
      label: "Deep Dive",
      startIndex: 1,
      count: 2,
      segmentIds: ["b", "c"],
    });
  });

  it("treats a reused label as a NEW group when non-contiguous", () => {
    const groups = deriveTocGroups([
      seg("a", "Intro"),
      seg("b", "Deep Dive"),
      seg("c", "Intro"),
    ]);
    // Two distinct Intro groups, not one — this is the contiguous-runs rule.
    expect(groups.map((g) => g.label)).toEqual(["Intro", "Deep Dive", "Intro"]);
    expect(groups[0].startIndex).toBe(0);
    expect(groups[2].startIndex).toBe(2);
  });

  it("does not group unlabeled segments between labeled runs", () => {
    const groups = deriveTocGroups([
      seg("a", "Intro"),
      seg("b"),
      seg("c", "Intro"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].segmentIds).toEqual(["a"]);
    expect(groups[1].segmentIds).toEqual(["c"]);
  });
});
