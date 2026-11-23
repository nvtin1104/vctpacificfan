import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { LOCALES, loc, tryT, type Key, type Lang } from '../i18n';
import type { Target } from './bracket-layout';

type Translate = (key: Key, vars?: Record<string, string | number>) => string;

export type Tournament = CollectionEntry<'tournaments'>;
export type Team = CollectionEntry<'teams'>;
export type Player = CollectionEntry<'players'>;
export type Roster = CollectionEntry<'rosters'>;
export type Match = CollectionEntry<'matches'>;
export type Bracket = CollectionEntry<'brackets'>;
export type Statistics = CollectionEntry<'statistics'>;
export type MatchSide = Match['data']['teams'][number];
export type TournamentKind = Tournament['data']['kind'];

export type ResolvedPlayer = {
  id: string;
  handle: string;
  name: string | null;
  avatar?: string;
  country: string | null;
  role: Roster['data']['roster'][number]['role'];
  igl: boolean;
  sub: boolean;
  status: 'official' | 'reported';
  socials: Player['data']['socials'];
};

// ---------- Seasons ----------
// Each src/data/seasons/<year>/season.json describes one season. Adding a year = adding a folder.
export type SeasonConfig = typeof import('../data/seasons/2027/season.json');
const seasonModules = import.meta.glob<SeasonConfig>('../data/seasons/*/season.json', { eager: true, import: 'default' });

/** All seasons, oldest first. */
export const SEASONS: SeasonConfig[] = Object.values(seasonModules).sort((a, b) => a.year - b.year);
/** The season flagged `"current": true` (falls back to the newest one). */
export const CURRENT_SEASON: number = (SEASONS.find(s => s.current) ?? SEASONS.at(-1)!).year;
export const seasonConfig = (year: number) => SEASONS.find(s => s.year === year) ?? SEASONS.at(-1)!;
/** Current season's config: map pool, stipends, sources. */
export const season = seasonConfig(CURRENT_SEASON);
export const seasonYears = () => SEASONS.map(s => s.year);
/** Season-scoped sections live under /<lang>/<year>/<section>/. */
export const SEASON_SECTIONS = ['tournaments', 'schedule', 'teams', 'statistics', 'rules'] as const;
export type SeasonSection = (typeof SEASON_SECTIONS)[number];
export const seasonPath = (year: number, section: SeasonSection) => `/${year}/${section}`;
// Optional season banner: src/data/seasons/<year>/<season.banner.file>. Used as the home hero and as the
// default share image. `.src` of the import publishes the original file unchanged (hashed URL under /_astro).
const bannerFiles = import.meta.glob<ImageMetadata>('../data/seasons/*/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });
export function seasonBanner(year: number) {
  const config = seasonConfig(year);
  if (config.year !== year || !config.banner) return null;
  const image = bannerFiles[`../data/seasons/${year}/${config.banner.file}`];
  return image ? { image, alt: config.banner.alt } : null;
}

/** Link to a season section; seasons without their own format explainer link to the latest one that has it. */
export function sectionPath(year: number, section: SeasonSection) {
  if (section === 'rules' && !seasonConfig(year).explainer) {
    const fallback = [...SEASONS].reverse().find(s => s.explainer && s.year <= year) ?? [...SEASONS].reverse().find(s => s.explainer);
    if (fallback) return seasonPath(fallback.year, 'rules');
  }
  return seasonPath(year, section);
}
/** `/2027/schedule` → { year: 2027, section: 'schedule' } (null for pages outside a season section). */
export function parseSeasonPath(path: string) {
  const m = path.match(/^\/(\d{4})\/([a-z-]+)/);
  return m && (SEASON_SECTIONS as readonly string[]).includes(m[2]) ? { year: Number(m[1]), section: m[2] as SeasonSection } : null;
}
/** getStaticPaths for /[lang]/[season]/… pages; `only` limits which seasons get the page. */
export const seasonStaticPaths = (only: (s: SeasonConfig) => boolean = () => true) =>
  LOCALES.flatMap(lang => SEASONS.filter(only).map(s => ({ params: { lang, season: String(s.year) } })));

type Ref = { id: string } | null | undefined;
export const refId = (ref: Ref) => ref?.id ?? null;

async function load() {
  const [tournaments, teams, players, rosters, matches, brackets, statistics] = await Promise.all([
    getCollection('tournaments'),
    getCollection('teams'),
    getCollection('players'),
    getCollection('rosters'),
    getCollection('matches'),
    getCollection('brackets'),
    getCollection('statistics'),
  ]);
  const byStart = (a: Tournament, b: Tournament) => (a.data.startDate ?? '9999').localeCompare(b.data.startDate ?? '9999');
  tournaments.sort((a, b) => a.data.season - b.data.season || a.data.tier - b.data.tier || byStart(a, b));
  matches.sort((a, b) => (a.data.startTime ?? '9999').localeCompare(b.data.startTime ?? '9999') || a.data.order - b.data.order);
  rosters.sort((a, b) => a.data.season - b.data.season);

  const tournament = new Map(tournaments.map(t => [t.id, t]));
  const team = new Map(teams.map(t => [t.id, t]));
  const player = new Map(players.map(p => [p.id, p]));
  const match = new Map(matches.map(m => [m.id, m]));
  const bracketFor = new Map(brackets.map(b => [refId(b.data.tournament)!, b]));
  const statsFor = new Map(statistics.map(s => [refId(s.data.tournament)!, s]));
  /** `${teamId}:${year}` → roster */
  const roster = new Map(rosters.map(r => [`${refId(r.data.team)}:${r.data.season}`, r]));

  /** Bracket progression keyed by match id across all brackets. */
  const progression = new Map<string, { winner: Target; loser: Target }>();
  for (const b of brackets) for (const [id, p] of Object.entries(b.data.progression)) progression.set(id, p as { winner: Target; loser: Target });

  return { tournaments, teams, players, rosters, matches, brackets, statistics, tournament, team, player, match, bracketFor, statsFor, roster, progression };
}

let cache: ReturnType<typeof load> | undefined;
/**
 * Loads every collection and returns lookup maps for relational queries. Cached for the whole build;
 * in dev it reloads per request so JSON edits (and season folders added or removed) show up at once.
 */
export const db = () => (import.meta.env.DEV ? load() : (cache ??= load()));

// ---------- Season-scoped queries ----------
export const tournamentsOf = async (year: number) => (await db()).tournaments.filter(t => t.data.season === year);
export const matchesOf = async (year: number) => (await db()).matches.filter(m => m.data.season === year);
export const statisticsOf = async (year: number) => (await db()).statistics.filter(s => s.data.season === year);
export const byKind = async (year: number, kind: TournamentKind) => (await tournamentsOf(year)).filter(t => t.data.kind === kind);
export const firstOfKind = async (year: number, kind: TournamentKind) => (await byKind(year, kind))[0];

/** Teams that have a roster entry in `year`, with that roster. */
export async function teamsOf(year: number) {
  const { rosters, team } = await db();
  return rosters.filter(r => r.data.season === year).map(r => ({ team: team.get(refId(r.data.team)!)!, roster: r }));
}

/** Join a season roster's player foreign keys against the global `players` table. */
export function resolvedRoster(r: Roster['data'], playersMap: Map<string, Player>): ResolvedPlayer[] {
  return r.roster.map(slot => {
    const id = refId(slot.player)!;
    const p = playersMap.get(id)!;
    return {
      id,
      handle: p.data.handle,
      name: p.data.name,
      avatar: p.data.avatar,
      country: p.data.country,
      role: slot.role ?? p.data.role,
      igl: slot.igl,
      sub: slot.sub,
      status: slot.status,
      socials: p.data.socials,
    };
  });
}

/** A team's roster for `year`, or its latest one when `year` is omitted. */
export async function rosterOf(teamId: string, year?: number) {
  const { rosters, roster } = await db();
  if (year) return roster.get(`${teamId}:${year}`);
  return rosters.filter(r => refId(r.data.team) === teamId).at(-1);
}

/** Seasons a team has a roster in, newest first. */
export async function seasonsOfTeam(teamId: string) {
  const { rosters } = await db();
  return rosters.filter(r => refId(r.data.team) === teamId).map(r => r.data.season).sort((a, b) => b - a);
}

/** Season a page belongs to: a tournament page → its season, a match page → its tournament's season. */
export async function seasonOfPath(path: string) {
  const { tournament, match } = await db();
  const year = path.match(/^\/(\d{4})(\/|$)/)?.[1];
  if (year) return Number(year);
  const slug = path.match(/^\/tournaments\/([^/]+)/)?.[1];
  if (slug && tournament.has(slug)) return tournament.get(slug)!.data.season;
  const matchId = path.match(/^\/matches\/([^/]+)/)?.[1];
  if (matchId && match.has(matchId)) return match.get(matchId)!.data.season;
  return CURRENT_SEASON;
}

export const tournamentOf = async (m: Match) => (await db()).tournament.get(refId(m.data.tournament)!)!;

export const teamIds = (m: Match) => m.data.teams.map(s => refId(s.team)).filter((id): id is string => !!id);

export function sideName(side: MatchSide, teams: Map<string, Team>, lang: Lang, short = false) {
  const team = side.team ? teams.get(side.team.id) : undefined;
  if (team) return short ? team.data.tag : team.data.name;
  return loc(side.placeholder, lang);
}

export function matchTitle(m: Match, teams: Map<string, Team>, lang: Lang) {
  const [a, b] = m.data.teams.map(s => sideName(s, teams, lang));
  return `${a} vs ${b}`;
}

/** Tournaments whose qualifiesTo points at `id`. */
export async function feedersOf(id: string) {
  const { tournaments } = await db();
  return tournaments.filter(t => t.data.qualifiesTo.some(q => refId(q.tournament) === id));
}

/** Tournaments a team is (or can be) part of in `year`: direct slots plus its domestic circuit. */
export async function journeyOf(team: Team, year: number) {
  const list = await tournamentsOf(year);
  const seeded = list.filter(t => t.data.slots.some(s => refId(s.team) === team.id));
  if (team.data.orgRegion !== 'PAC') return { seeded, circuit: [] };
  const domestic = list.filter(t => t.data.kind === 'regional' && t.data.region === team.data.region);
  const wild = list.find(t => t.data.kind === 'wild-card');
  const circuit = domestic.length ? domestic : wild ? [wild] : [];
  return { seeded, circuit };
}

export const countryName = (code: string | null | undefined, lang: Lang) => (code ? tryT(lang, `countries.${code}`, code) : '');
export const regionName = (code: string, lang: Lang) => tryT(lang, `regions.${code}`, code);
export const orgRegionName = (code: string, lang: Lang) => tryT(lang, `orgRegions.${code}`, code);

/** "Winner UB R2 #1" style pointer → human label for a bracket target. */
export function targetLabel(target: Target | undefined, matches: Map<string, Match>, lang: Lang, t: Translate) {
  if (!target) return '';
  if ('qualifies' in target) return t('bracket.qualifies', { n: target.qualifies });
  if ('eliminated' in target) return t('bracket.eliminated');
  const m = matches.get(target.match);
  return m ? loc(m.data.stage, lang) : target.match;
}

/** Live matches, then upcoming matches that already have a start time. */
export async function nextTimedMatches(limit = 6) {
  const { matches } = await db();
  const live = matches.filter(m => m.data.status === 'live');
  const upcoming = matches.filter(m => m.data.status === 'upcoming' && m.data.startTime);
  return [...live, ...upcoming].slice(0, limit);
}

export async function upcomingTournaments(limit = 4, year = CURRENT_SEASON) {
  return (await tournamentsOf(year))
    .filter(t => t.data.status !== 'completed' && t.data.startDate)
    .sort((a, b) => a.data.startDate!.localeCompare(b.data.startDate!))
    .slice(0, limit);
}

/** The season's headline event: the Pacific circuit event that is running or comes next (else the last one). */
export async function featuredEvent(year = CURRENT_SEASON) {
  const pacific = (await tournamentsOf(year))
    .filter(t => t.data.tier === 2 && t.data.kind !== 'offseason' && t.data.startDate)
    .sort((a, b) => a.data.startDate!.localeCompare(b.data.startDate!));
  return pacific.find(t => t.data.status !== 'completed') ?? pacific.at(-1);
}
