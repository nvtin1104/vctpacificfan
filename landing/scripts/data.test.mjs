// Referential-integrity and translation checks for the relational JSON in src/data/.
// Run with `pnpm test` before pushing data changes; Astro's zod schemas catch shape errors at build time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const load = name => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));
// Season data: src/data/seasons/<year>/<collection>.json. Each entry gets the folder's year, like the loader does.
const YEARS = readdirSync(new URL('../src/data/seasons/', import.meta.url)).filter(d => /^\d{4}$/.test(d)).map(Number).sort();
const fromSeasons = name =>
  YEARS.flatMap(year => {
    const base = name.replace(/\.json$/, '');
    const single = new URL(`../src/data/seasons/${year}/${name}`, import.meta.url);
    const dir = new URL(`../src/data/seasons/${year}/${base}/`, import.meta.url);
    const entries = existsSync(single) ? JSON.parse(readFileSync(single, 'utf8')) : [];
    const sharded = existsSync(dir)
      ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().flatMap(f => JSON.parse(readFileSync(new URL(f, dir), 'utf8')))
      : [];
    return [...entries, ...sharded].map(x => ({ ...x, season: year }));
  });
const seasons = YEARS.map(year => load(`seasons/${year}/season.json`));
const tournaments = fromSeasons('tournaments.json');
const rosters = fromSeasons('rosters.json');
const matches = fromSeasons('matches.json');
const brackets = fromSeasons('brackets.json');
const statistics = fromSeasons('statistics.json');
const teams = load('teams.json');
const players = load('players.json');
const LOCALES = ['vi', 'en', 'ko', 'ja'];
const dicts = Object.fromEntries(LOCALES.map(l => [l, load(`i18n/${l}.json`)]));

const ids = list => new Set(list.map(x => x.id));
const T = ids(tournaments);
const TEAM = ids(teams);
const PLAYER = ids(players);
const M = new Map(matches.map(m => [m.id, m]));

test('ids are unique and slug-safe', () => {
  for (const [name, list] of Object.entries({ tournaments, teams, players, rosters, matches, brackets, statistics })) {
    assert.equal(ids(list).size, list.length, `duplicate id in ${name}`);
    for (const { id } of list) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name}: bad id "${id}"`);
  }
});

test('tournament references resolve', () => {
  for (const t of tournaments) {
    for (const slot of t.slots) {
      if (slot.team) assert.ok(TEAM.has(slot.team), `${t.id}: unknown team ${slot.team}`);
      if (slot.from) assert.ok(T.has(slot.from), `${t.id}: unknown source event ${slot.from}`);
    }
    for (const q of t.qualifiesTo) assert.ok(T.has(q.tournament), `${t.id}: unknown target ${q.tournament}`);
    if (t.startDate && t.endDate) assert.ok(t.startDate <= t.endDate, `${t.id}: start after end`);
  }
});

test('season folders are consistent', () => {
  assert.ok(YEARS.length > 0, 'no season folders');
  seasons.forEach((s, i) => assert.equal(s.year, YEARS[i], `seasons/${YEARS[i]}/season.json has year ${s.year}`));
  assert.equal(seasons.filter(s => s.current).length, 1, 'exactly one season.json must set "current": true');
  const T = new Map(tournaments.map(t => [t.id, t]));
  for (const m of matches) assert.equal(T.get(m.tournament)?.season, m.season, `${m.id} is filed in another season than its tournament`);
  for (const b of brackets) assert.equal(T.get(b.tournament)?.season, b.season, `${b.id} bracket filed in the wrong season`);
  for (const t of tournaments) for (const q of t.qualifiesTo) assert.equal(T.get(q.tournament)?.season, t.season, `${t.id} → ${q.tournament} crosses seasons`);
});

test('rosters: one per team per season, id <team>-<year>, and valid player FKs', () => {
  const seen = new Set();
  for (const r of rosters) {
    assert.ok(TEAM.has(r.team), `${r.id}: unknown team ${r.team}`);
    assert.equal(r.id, `${r.team}-${r.season}`, `${r.id}: id should be ${r.team}-${r.season}`);
    assert.ok(!seen.has(r.id), `duplicate roster ${r.id}`);
    seen.add(r.id);
    for (const slot of r.roster) assert.ok(PLAYER.has(slot.player), `${r.id}: unknown player ${slot.player}`);
  }
});

test('each season with a Kickoff seeds all of its partner teams', () => {
  for (const year of YEARS) {
    const kickoff = tournaments.find(t => t.season === year && t.kind === 'kickoff');
    if (!kickoff) continue;
    const seeded = new Set(kickoff.slots.map(s => s.team).filter(Boolean));
    for (const r of rosters.filter(x => x.season === year && x.status === 'partner')) assert.ok(seeded.has(r.team), `${year}: ${r.team} missing from Kickoff`);
  }
});

test('match references resolve and results are consistent', () => {
  for (const m of matches) {
    assert.ok(T.has(m.tournament), `${m.id}: unknown tournament`);
    for (const side of m.teams) if (side.team) assert.ok(TEAM.has(side.team), `${m.id}: unknown team ${side.team}`);
    if (m.status === 'completed') {
      assert.notEqual(m.winner, null, `${m.id}: completed without winner`);
      assert.ok(m.teams.every(s => s.score !== null), `${m.id}: completed without scores`);
    } else {
      assert.equal(m.winner, null, `${m.id}: winner set before completion`);
    }
    if (m.startTime) assert.ok(!Number.isNaN(Date.parse(m.startTime)), `${m.id}: bad startTime`);
  }
});

test('bracket progression is complete, in-bracket and acyclic', () => {
  for (const b of brackets) {
    assert.ok(T.has(b.tournament), `${b.id}: unknown tournament`);
    const inBracket = new Set(b.sections.flatMap(s => s.rounds.flatMap(r => r.matches)));
    const used = new Set();
    let qualifiers = 0;
    for (const id of inBracket) {
      assert.ok(M.has(id), `${b.id}: unknown match ${id}`);
      assert.equal(M.get(id).tournament, b.tournament, `${id} belongs to another tournament`);
      const p = b.progression[id];
      assert.ok(p, `${b.id}: no progression for ${id}`);
      for (const target of [p.winner, p.loser]) {
        if ('qualifies' in target) qualifiers++;
        if (!('match' in target)) continue;
        assert.ok(inBracket.has(target.match), `${id} -> ${target.match} leaves the bracket`);
        const key = `${target.match}:${target.slot}`;
        assert.ok(!used.has(key), `slot ${key} is fed twice`);
        used.add(key);
      }
      const seen = new Set();
      for (let cur = id; cur; cur = b.progression[cur]?.winner?.match) {
        assert.ok(!seen.has(cur), `cycle through ${cur}`);
        seen.add(cur);
      }
    }
    for (const key of Object.keys(b.progression)) assert.ok(inBracket.has(key), `${b.id}: progression for unknown ${key}`);
    if (b.type === 'triple-elimination') assert.equal(qualifiers, 3, 'triple elimination should hand out 3 berths');
  }
});

test('statistics reference real tournaments and teams', () => {
  for (const s of statistics) {
    assert.ok(T.has(s.tournament));
    for (const p of s.players) assert.ok(TEAM.has(p.team), `stats: unknown team ${p.team}`);
  }
});

test('every localized field has all four languages', () => {
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((child, i) => walk(child, `${path}[${i}]`));
    if (!node || typeof node !== 'object') return;
    const keys = Object.keys(node);
    if (keys.some(k => LOCALES.includes(k)) && keys.every(k => LOCALES.includes(k))) {
      for (const l of LOCALES) assert.ok(typeof node[l] === 'string' && node[l].trim(), `${path}.${l} missing`);
      return;
    }
    for (const k of keys) walk(node[k], `${path}.${k}`);
  };
  walk({ tournaments, matches, brackets, seasons }, 'data');
});

test('UI dictionaries share keys and placeholders', () => {
  const flat = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v]] : flat(v, `${prefix}${k}.`)));
  const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i).sort().join(',');
  const base = new Map(flat(dicts.vi));
  for (const l of LOCALES.slice(1)) {
    const other = new Map(flat(dicts[l]));
    assert.deepEqual([...other.keys()].sort(), [...base.keys()].sort(), `${l}.json keys differ from vi.json`);
    for (const [k, v] of base) {
      assert.ok(other.get(k).trim(), `${l}: empty ${k}`);
      assert.equal(vars(other.get(k)), vars(v), `${l}: placeholders differ for ${k}`);
    }
  }
});
