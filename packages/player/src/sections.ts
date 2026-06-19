import type { Segment } from "@chmh/shared";

export interface TocGroup {
  label: string;
  startIndex: number;
  count: number;
  segmentIds: string[];
}

/**
 * Derive table-of-contents groups from contiguous runs of `segment.section`.
 *
 * Per the architecture decision, a section is a *contiguous run* of segments
 * sharing a label — reusing a label later in the timeline starts a NEW group,
 * so the result is unambiguous. Segments without a section label are not
 * grouped; if no segment has a label, the result is empty and the player shows
 * no ToC.
 */
export function deriveTocGroups(segments: Segment[]): TocGroup[] {
  const groups: TocGroup[] = [];
  let current: TocGroup | null = null;

  segments.forEach((seg, index) => {
    const label = seg.section;
    if (!label) {
      current = null;
      return;
    }
    if (current && current.label === label) {
      current.count += 1;
      current.segmentIds.push(seg.id);
    } else {
      current = {
        label,
        startIndex: index,
        count: 1,
        segmentIds: [seg.id],
      };
      groups.push(current);
    }
  });

  return groups;
}
