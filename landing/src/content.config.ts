import { defineCollection, reference } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { seasonFile } from './lib/season-loader';

/**
 * Relational JSON "database". Every collection is a JSON array whose entries carry an `id`.
 * Season data lives in src/data/seasons/<year>/<collection>.json; seasonFile() loads every year and stamps
 * each entry with `season`. Teams (identity only) are global in src/data/teams.json.
 * Cross-collection links use reference() so Astro validates and resolves them at build time;
 * scripts/data.test.mjs re-checks the same invariants (plus bracket progression) without a build.
 */

const localized = z.object({
  vi: z.string().min(1),
  en: z.string().min(1),
  ko: z.string().min(1),
  ja: z.string().min(1),
});

const source = z.object({ label: z.string(), url: z.url() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const season = z.number().int().min(2020);

export const MAPS = ['Abyss', 'Ascent', 'Bind', 'Breeze', 'Corrode', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Summit', 'Sunset'] as const;
const mapName = z.enum(MAPS);
const side = z.enum(['attack', 'defense']);
const teamIndex = z.union([z.literal(0), z.literal(1)]);

export const TOURNAMENT_KINDS = ['kickoff', 'cup', 'masters', 'champions', 'kickoff-qualifier', 'regional', 'wild-card', 'lcq', 'offseason'] as const;

const tournaments = defineCollection({
  loader: seasonFile('tournaments.json'),
  schema: z.object({
    season,
    /** Role in the season structure, so pages can find e.g. a season's Kickoff without hard-coded ids. */
    kind: z.enum(TOURNAMENT_KINDS),
    name: z.string(),
    shortName: z.string(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Region or country this event belongs to (ISO 3166 alpha-2, or PAC / INTL / WILD). */
    region: z.string(),
    location: z.object({ city: localized, country: z.string().length(2), venue: z.string().nullable() }).nullable(),
    startDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
    datesConfirmed: z.boolean(),
    status: z.enum(['upcoming', 'ongoing', 'completed']),
    format: z.object({ summary: localized, teams: z.number().int().nullable(), confirmed: z.boolean() }),
    prizePool: z.number().nullable(),
    slots: z.array(
      z.object({
        team: reference('teams').nullable(),
        label: localized,
        from: reference('tournaments').nullable(),
      }),
    ),
    qualifiesTo: z.array(z.object({ tournament: reference('tournaments'), spots: z.number().int().nullable(), note: localized })),
    description: localized,
    sources: z.array(source),
  }),
});

/** Team identity, stable across seasons. Per-season data (status, roster, staff) lives in `rosters`. */
const teams = defineCollection({
  loader: file('src/data/teams.json'),
  schema: z.object({
    name: z.string(),
    tag: z.string().max(5),
    logo: z.string().optional(),
    region: z.string(),
    orgRegion: z.enum(['PAC', 'EMEA', 'AMER', 'CN']).default('PAC'),
    country: z.string().length(2),
    colors: z.object({ primary: z.string(), secondary: z.string() }),
    socials: z.object({ liquipedia: z.url().optional(), x: z.url().optional(), youtube: z.url().optional(), website: z.url().optional() }),
  }),
});

const role = z.enum(['Duelist', 'Initiator', 'Controller', 'Sentinel', 'Flex']);

/** Global player identity table (src/data/players.json), referenced by rosters, matches and statistics. */
const players = defineCollection({
  loader: file('src/data/players.json'),
  schema: z.object({
    handle: z.string(),
    name: z.string().nullable(),
    avatar: z.string().optional(),
    country: z.string().length(2).nullable(),
    role: role.nullable(),
    socials: z
      .object({
        liquipedia: z.url().optional(),
        vlr: z.url().optional(),
        x: z.url().optional(),
        youtube: z.url().optional(),
        twitch: z.url().optional(),
      })
      .default({}),
  }),
});

/** One entry per team per season. Id convention: `<team>-<year>`. */
const rosters = defineCollection({
  loader: seasonFile('rosters.json'),
  schema: z.object({
    season,
    team: reference('teams'),
    status: z.enum(['partner', 'open_qualifier', 'invited']),
    partnerSince: z.number().int().nullable(),
    capsule: z.object({ name: z.string().nullable(), confirmed: z.boolean() }),
    roster: z.array(
      z.object({
        player: reference('players'),
        role: role.nullable(),
        igl: z.boolean(),
        sub: z.boolean(),
        status: z.enum(['official', 'reported']),
      }),
    ),
    staff: z.array(z.object({ handle: z.string(), position: z.enum(['head-coach', 'coach', 'analyst']), status: z.enum(['official', 'reported']) })),
    history: z.array(z.object({ year: z.number().int(), event: z.string(), placement: z.string(), url: z.url().optional() })),
    source: source,
    asOf: isoDate,
  }),
});

const matchTeam = z.object({ team: reference('teams').nullable(), placeholder: localized, score: z.number().int().nullable() });

const matches = defineCollection({
  loader: seasonFile('matches.json'),
  schema: z.object({
    season,
    tournament: reference('tournaments'),
    section: z.enum(['upper', 'middle', 'lower', 'playoffs', 'group']),
    round: z.string(),
    order: z.number().int(),
    stage: localized,
    format: z.enum(['Bo1', 'Bo3', 'Bo5']),
    startTime: z.iso.datetime({ offset: true }).nullable(),
    status: z.enum(['upcoming', 'live', 'completed']),
    teams: z.tuple([matchTeam, matchTeam]),
    winner: teamIndex.nullable(),
    skirmish: z
      .object({
        players: z.tuple([z.string(), z.string()]),
        score: z.tuple([z.number().int(), z.number().int()]),
        winner: teamIndex,
        choice: z.enum(['map', 'side']),
      })
      .nullable(),
    veto: z
      .array(
        z.object({
          team: teamIndex.nullable(),
          action: z.enum(['ban', 'pick', 'decider']),
          map: mapName,
          side: z.object({ team: teamIndex, side }).nullable(),
        }),
      )
      .nullable(),
    maps: z
      .array(
        z.object({
          map: mapName,
          score: z.tuple([z.number().int(), z.number().int()]),
          picker: teamIndex.nullable(),
          vodUrl: z.url().nullable(),
          players: z.array(
            z.object({
              team: teamIndex,
              player: reference('players').optional(),
              handle: z.string(),
              agent: z.string(),
              k: z.number().int(),
              d: z.number().int(),
              a: z.number().int(),
              acs: z.number(),
              adr: z.number(),
              kast: z.number(),
              fk: z.number().int(),
            }),
          ),
        }),
      )
      .nullable(),
    vodUrl: z.url().nullable(),
  }),
});

const target = z.union([
  z.object({ match: z.string(), slot: teamIndex }),
  z.object({ qualifies: z.number().int() }),
  z.object({ eliminated: z.literal(true) }),
]);

const brackets = defineCollection({
  loader: seasonFile('brackets.json'),
  schema: z.object({
    season,
    tournament: reference('tournaments'),
    type: z.enum(['triple-elimination', 'double-elimination', 'single-elimination']),
    confirmed: z.boolean(),
    note: localized,
    sections: z.array(
      z.object({
        id: z.enum(['upper', 'middle', 'lower', 'playoffs']),
        title: localized,
        rounds: z.array(z.object({ id: z.string(), title: localized, matches: z.array(reference('matches')) })),
      }),
    ),
    progression: z.record(z.string(), z.object({ winner: target, loser: target })),
  }),
});

const statistics = defineCollection({
  loader: seasonFile('statistics.json'),
  schema: z.object({
    season,
    tournament: reference('tournaments'),
    status: z.enum(['pending', 'partial', 'final']),
    updatedAt: isoDate.nullable(),
    source: source,
    agents: z.array(z.object({ agent: z.string(), picks: z.number().int(), pickRate: z.number(), winRate: z.number() })),
    maps: z.array(z.object({ map: mapName, played: z.number().int(), picks: z.number().int(), bans: z.number().int(), atkWinRate: z.number(), defWinRate: z.number() })),
    players: z.array(
      z.object({
        player: reference('players').optional(),
        handle: z.string(),
        team: reference('teams'),
        maps: z.number().int(),
        rounds: z.number().int(),
        acs: z.number(),
        kd: z.number(),
        kast: z.number(),
        adr: z.number(),
        fkpr: z.number(),
      }),
    ),
  }),
});

export const collections = { tournaments, teams, players, rosters, matches, brackets, statistics };
