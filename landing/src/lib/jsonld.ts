import { loc, localePath, type Lang } from '../i18n';
import { refId, sideName, type Match, type ResolvedPlayer, type Roster, type Team, type Tournament } from './data';
import { absolute, ogImagePath } from './seo';

const EVENT_STATUS = 'https://schema.org/EventScheduled';
const ORGANIZER = { '@type': 'Organization', name: 'Riot Games', url: 'https://www.riotgames.com' };

function place(t: Tournament, lang: Lang) {
  const location = t.data.location;
  if (!location) return { '@type': 'VirtualLocation', url: 'https://valorantesports.com' };
  return {
    '@type': 'Place',
    name: [location.venue, loc(location.city, lang)].filter(Boolean).join(', '),
    address: { '@type': 'PostalAddress', addressLocality: loc(location.city, lang), addressCountry: location.country },
  };
}

const sportsTeam = (team: Team, site: URL | undefined, lang: Lang) => ({
  '@type': 'SportsTeam',
  name: team.data.name,
  sport: 'VALORANT',
  url: absolute(site, localePath(lang, `/teams/${team.id}`)),
  ...(team.data.logo && { logo: absolute(site, team.data.logo) }),
});

export function tournamentLd(t: Tournament, matches: Match[], site: URL | undefined, lang: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: t.data.name,
    description: loc(t.data.description, lang),
    sport: 'VALORANT',
    url: absolute(site, localePath(lang, `/tournaments/${t.id}`)),
    image: absolute(site, ogImagePath('tournament', t.id)),
    ...(t.data.startDate && { startDate: t.data.startDate }),
    ...(t.data.endDate && { endDate: t.data.endDate }),
    eventStatus: EVENT_STATUS,
    eventAttendanceMode: t.data.location ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode',
    location: place(t, lang),
    organizer: ORGANIZER,
    ...(matches.length && {
      subEvent: matches.map(m => ({ '@type': 'SportsEvent', name: m.id, url: absolute(site, localePath(lang, `/matches/${m.id}`)) })),
    }),
  };
}

export function matchLd(m: Match, t: Tournament, teams: Map<string, Team>, site: URL | undefined, lang: Lang) {
  const [a, b] = m.data.teams.map(s => sideName(s, teams, lang));
  const competitors = m.data.teams.map(s => teams.get(refId(s.team) ?? '')).filter((x): x is Team => !!x);
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${a} vs ${b} - ${t.data.name}`,
    description: `${loc(m.data.stage, lang)} · ${m.data.format} · ${t.data.name}`,
    sport: 'VALORANT',
    url: absolute(site, localePath(lang, `/matches/${m.id}`)),
    image: absolute(site, ogImagePath('match', m.id)),
    // Google requires startDate; fall back to the event window until Riot publishes match times.
    startDate: m.data.startTime ?? t.data.startDate ?? undefined,
    ...(!m.data.startTime && t.data.endDate && { endDate: t.data.endDate }),
    eventStatus: EVENT_STATUS,
    eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
    location: place(t, lang),
    organizer: ORGANIZER,
    superEvent: { '@type': 'SportsEvent', name: t.data.name, url: absolute(site, localePath(lang, `/tournaments/${t.id}`)) },
    ...(competitors.length && { competitor: competitors.map(team => sportsTeam(team, site, lang)) }),
  };
}

export function teamLd(team: Team, players: ResolvedPlayer[], site: URL | undefined, lang: Lang, staff: Roster['data']['staff'] = []) {
  const sameAs = [team.data.socials.liquipedia, team.data.socials.website, team.data.socials.x, team.data.socials.youtube].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    ...sportsTeam(team, site, lang),
    image: absolute(site, ogImagePath('team', team.id)),
    ...(sameAs.length && { sameAs }),
    athlete: players.map(p => ({ '@type': 'Person', name: p.handle, ...(p.name && { alternateName: p.name }) })),
    ...(staff.length && { coach: staff.map(s => ({ '@type': 'Person', name: s.handle })) }),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[], site: URL | undefined, lang: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: absolute(site, localePath(lang, item.path)) })),
  };
}
