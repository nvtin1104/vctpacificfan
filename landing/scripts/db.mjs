// Quick relational lookup & data-gap inspector for src/data/.
// Usage:
//   node scripts/db.mjs team <id>
//   node scripts/db.mjs player <id|handle>
//   node scripts/db.mjs gaps
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('src/data');
const load = rel => JSON.parse(readFileSync(path.join(DATA_DIR, rel), 'utf8'));
const years = readdirSync(path.join(DATA_DIR, 'seasons')).filter(d => /^\d{4}$/.test(d)).sort();

function loadSeason(name) {
  const base = name.replace(/\.json$/, '');
  return years.flatMap(year => {
    const single = path.join(DATA_DIR, 'seasons', year, name);
    const dir = path.join(DATA_DIR, 'seasons', year, base);
    const list = existsSync(single) ? JSON.parse(readFileSync(single, 'utf8')) : [];
    const sharded = existsSync(dir)
      ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().flatMap(f => JSON.parse(readFileSync(path.join(dir, f), 'utf8')))
      : [];
    return [...list, ...sharded].map(x => ({ ...x, season: Number(year) }));
  });
}

const teams = load('teams.json');
const players = load('players.json');
const rosters = loadSeason('rosters.json');
const tournaments = loadSeason('tournaments.json');
const matches = loadSeason('matches.json');

const teamById = new Map(teams.map(t => [t.id, t]));
const playerById = new Map(players.map(p => [p.id, p]));

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'team' && arg) {
  const team = teamById.get(arg);
  if (!team) {
    console.error(`Team not found: ${arg}`);
    process.exit(1);
  }
  const teamRosters = rosters.filter(r => r.team === team.id).map(r => ({
    season: r.season,
    status: r.status,
    players: r.roster.map(s => ({ ...playerById.get(s.player), ...s })),
    staff: r.staff,
    historyCount: r.history.length,
  }));
  const teamMatches = matches.filter(m => m.teams.some(s => s.team === team.id)).map(m => m.id);
  console.log(JSON.stringify({ team, rosters: teamRosters, matches: teamMatches }, null, 2));
} else if (cmd === 'player' && arg) {
  const q = arg.toLowerCase();
  const found = players.filter(p => p.id === q || p.handle.toLowerCase().includes(q));
  if (found.length === 0) {
    console.error(`Player not found: ${arg}`);
    process.exit(1);
  }
  const out = found.map(p => ({
    ...p,
    rosters: rosters.filter(r => r.roster.some(s => s.player === p.id)).map(r => ({ season: r.season, team: r.team, ...r.roster.find(s => s.player === p.id) })),
  }));
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === 'gaps') {
  console.log('Teams missing logo:', teams.filter(t => !t.logo).map(t => t.id));
  console.log('Players missing avatar:', players.filter(p => !p.avatar).map(p => p.id));
  console.log('Players missing name:', players.filter(p => !p.name).map(p => p.id));
  console.log('Players missing country:', players.filter(p => !p.country).map(p => p.id));
  console.log('Rosters with empty history:', rosters.filter(r => r.history.length === 0).map(r => r.id));
  console.log(`Totals: ${teams.length} teams, ${players.length} players, ${rosters.length} rosters, ${tournaments.length} tournaments, ${matches.length} matches`);
} else {
  console.log('Usage: node scripts/db.mjs <team <id> | player <id|handle> | gaps>');
}

