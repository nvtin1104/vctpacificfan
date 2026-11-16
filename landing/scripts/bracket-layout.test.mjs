import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutBracket, winnerRoute, DEFAULT_LAYOUT } from '../src/lib/bracket-layout.ts';

const [kickoff] = JSON.parse(readFileSync(new URL('../src/data/seasons/2027/brackets.json', import.meta.url), 'utf8'));
const layout = layoutBracket(kickoff.sections, kickoff.progression);

test('every bracket match gets exactly one node', () => {
  const nodes = layout.flatMap(s => s.nodes.map(n => n.id));
  const expected = kickoff.sections.flatMap(s => s.rounds.flatMap(r => r.matches));
  assert.deepEqual(nodes.sort(), expected.sort());
});

test('nodes in a column never overlap', () => {
  for (const section of layout) {
    const byCol = Object.groupBy(section.nodes, n => n.col);
    for (const col of Object.values(byCol)) {
      const ys = col.map(n => n.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= DEFAULT_LAYOUT.nodeH, `${section.id} column overlap`);
    }
  }
});

test('a match sits level with or between the matches that feed it', () => {
  const upper = layout.find(s => s.id === 'upper');
  const y = id => upper.nodes.find(n => n.id === id).y;
  assert.equal(y('ko27-u2-1'), y('ko27-u1-1'));
  assert.equal(y('ko27-u3-1'), (y('ko27-u2-1') + y('ko27-u2-2')) / 2);
});

test('connectors only join matches in the same section', () => {
  for (const section of layout) {
    const ids = new Set(section.nodes.map(n => n.id));
    for (const e of section.edges) assert.ok(ids.has(e.from) && ids.has(e.to));
    assert.ok(section.width > 0 && section.height > 0);
  }
});

test('winner route of an opening match reaches the upper final', () => {
  assert.deepEqual(winnerRoute('ko27-u1-1', kickoff.progression), ['ko27-u1-1', 'ko27-u2-1', 'ko27-u3-1', 'ko27-u4-1']);
});
