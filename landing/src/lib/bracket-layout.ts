/**
 * Pure bracket layout: turns bracket sections + progression pointers into node coordinates and SVG
 * connector paths. No Astro imports so `node --test` can run it directly (Node type stripping).
 */

export type Target = { match: string; slot: 0 | 1 } | { qualifies: number } | { eliminated: true };
export interface LayoutSectionInput {
  id: string;
  rounds: { id: string; matches: string[] }[];
}
export interface LayoutOptions {
  nodeW: number;
  nodeH: number;
  colGap: number;
  rowGap: number;
}
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  col: number;
}
export interface LayoutEdge {
  from: string;
  to: string;
  d: string;
}
export interface LayoutSection {
  id: string;
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export const DEFAULT_LAYOUT: LayoutOptions = { nodeW: 196, nodeH: 76, colGap: 36, rowGap: 22 };

const targetMatch = (t: Target | undefined) => (t && 'match' in t ? t.match : null);

export function layoutBracket(
  sections: LayoutSectionInput[],
  progression: Record<string, { winner: Target; loser: Target }>,
  opts: LayoutOptions = DEFAULT_LAYOUT,
): LayoutSection[] {
  const { nodeW, nodeH, colGap, rowGap } = opts;
  const pitch = nodeH + rowGap;

  return sections.map(section => {
    const inSection = new Set(section.rounds.flatMap(r => r.matches));
    const maxRows = Math.max(1, ...section.rounds.map(r => r.matches.length));
    const fullHeight = maxRows * pitch - rowGap;
    const y = new Map<string, number>();
    const nodes: LayoutNode[] = [];

    section.rounds.forEach((round, col) => {
      const n = round.matches.length;
      const wanted = round.matches.map((id, idx) => {
        // Feeders = earlier matches in this section whose winner advances into `id`.
        const feeders = [...y.keys()].filter(f => targetMatch(progression[f]?.winner) === id);
        if (feeders.length) return feeders.reduce((sum, f) => sum + y.get(f)!, 0) / feeders.length;
        if (n === maxRows) return idx * pitch;
        const spacing = fullHeight / n;
        return spacing * idx + spacing / 2 - nodeH / 2;
      });
      // Keep matches of one round in order and non-overlapping.
      for (let i = 1; i < wanted.length; i++) wanted[i] = Math.max(wanted[i], wanted[i - 1] + pitch);
      round.matches.forEach((id, idx) => {
        const top = Math.max(0, Math.round(wanted[idx]));
        y.set(id, top);
        nodes.push({ id, x: col * (nodeW + colGap), y: top, col });
      });
    });

    const edges: LayoutEdge[] = [];
    for (const node of nodes) {
      const to = targetMatch(progression[node.id]?.winner);
      if (!to || !inSection.has(to)) continue;
      const target = nodes.find(n => n.id === to)!;
      const x1 = node.x + nodeW;
      const y1 = node.y + nodeH / 2;
      const x2 = target.x;
      const y2 = target.y + nodeH / 2;
      const mid = x1 + (x2 - x1) / 2;
      edges.push({ from: node.id, to, d: `M${x1} ${y1}H${mid}V${y2}H${x2}` });
    }

    const width = Math.max(...nodes.map(n => n.x)) + nodeW;
    const height = Math.max(fullHeight, ...nodes.map(n => n.y + nodeH));
    return { id: section.id, width, height, nodes, edges };
  });
}

/** Follows winner pointers from a match: the projected route of whoever wins it. */
export function winnerRoute(start: string, progression: Record<string, { winner: Target; loser: Target }>) {
  const route: string[] = [];
  const seen = new Set<string>();
  let current: string | null = start;
  while (current && !seen.has(current)) {
    seen.add(current);
    route.push(current);
    current = targetMatch(progression[current]?.winner);
  }
  return route;
}
