import { HTML_LANG, loc, localePath, type Lang } from '../i18n';
import { countryName, refId, sideName, type Match, type ResolvedPlayer, type Roster, type Team, type Tournament } from './data';
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
  alternateName: team.data.tag,
  sport: 'VALORANT',
  url: absolute(site, localePath(lang, `/teams/${team.id}`)),
  ...(team.data.logo && { logo: absolute(site, team.data.logo) }),
});

export function websiteLd(site: URL | undefined, lang: Lang, name: string, description: string) {
  const url = absolute(site, localePath(lang));
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}#website`,
    name,
    alternateName: 'VCT Pacific Fan Hub',
    url,
    inLanguage: HTML_LANG[lang],
    description,
    publisher: { '@id': `${absolute(site, '/')}#organization` },
  };
}

export function organizationLd(site: URL | undefined, name: string, description: string) {
  const root = absolute(site, '/');
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${root}#organization`,
    name,
    url: root,
    logo: {
      '@type': 'ImageObject',
      url: absolute(site, '/icon-192.png'),
      width: 192,
      height: 192,
    },
    description,
  };
}

export function collectionPageLd({
  site,
  lang,
  path,
  name,
  description,
  items,
}: {
  site: URL | undefined;
  lang: Lang;
  path: string;
  name: string;
  description: string;
  items: { name: string; path: string }[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: absolute(site, localePath(lang, path)),
    inLanguage: HTML_LANG[lang],
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: absolute(site, localePath(lang, item.path)),
      })),
    },
  };
}

export function faqPageLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}

export function articleLd({
  site,
  lang,
  path,
  headline,
  description,
  dateModified,
  image,
  siteName,
}: {
  site: URL | undefined;
  lang: Lang;
  path: string;
  headline: string;
  description: string;
  dateModified: string;
  image: string;
  siteName: string;
}) {
  const root = absolute(site, '/');
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url: absolute(site, localePath(lang, path)),
    inLanguage: HTML_LANG[lang],
    dateModified,
    image: absolute(site, image),
    author: { '@type': 'Organization', name: siteName, url: root },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: root,
      logo: { '@type': 'ImageObject', url: absolute(site, '/icon-192.png') },
    },
  };
}

export function datasetLd({
  site,
  lang,
  path,
  name,
  description,
  dateModified,
  siteName,
}: {
  site: URL | undefined;
  lang: Lang;
  path: string;
  name: string;
  description: string;
  dateModified: string;
  siteName: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    url: absolute(site, localePath(lang, path)),
    inLanguage: HTML_LANG[lang],
    dateModified,
    creator: { '@type': 'Organization', name: siteName, url: absolute(site, '/') },
  };
}

export function tournamentLd(t: Tournament, matches: Match[], teams: Map<string, Team>, site: URL | undefined, lang: Lang) {
  const seen = new Set<string>();
  const competitors: Team[] = [];
  for (const slot of t.data.slots) {
    const id = refId(slot.team);
    if (!id || seen.has(id)) continue;
    const team = teams.get(id);
    if (team) {
      seen.add(id);
      competitors.push(team);
    }
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: t.data.name,
    description: loc(t.data.description, lang),
    inLanguage: HTML_LANG[lang],
    sport: 'VALORANT',
    url: absolute(site, localePath(lang, `/tournaments/${t.id}`)),
    image: absolute(site, ogImagePath('tournament', t.id)),
    ...(t.data.startDate && { startDate: t.data.startDate }),
    ...(t.data.endDate && { endDate: t.data.endDate }),
    eventStatus: EVENT_STATUS,
    eventAttendanceMode: t.data.location ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode',
    location: place(t, lang),
    organizer: ORGANIZER,
    ...(competitors.length && { competitor: competitors.map(team => sportsTeam(team, site, lang)) }),
    ...(matches.length && {
      subEvent: matches.map(m => {
        const [a, b] = m.data.teams.map(s => sideName(s, teams, lang));
        const startDate = m.data.startTime ?? t.data.startDate ?? undefined;
        return {
          '@type': 'SportsEvent',
          name: `${a} vs ${b} - ${loc(m.data.stage, lang)}`,
          url: absolute(site, localePath(lang, `/matches/${m.id}`)),
          ...(startDate && { startDate }),
        };
      }),
    }),
  };
}

export function matchLd(m: Match, t: Tournament, teams: Map<string, Team>, site: URL | undefined, lang: Lang, description?: string) {
  const [a, b] = m.data.teams.map(s => sideName(s, teams, lang));
  const competitors = m.data.teams.map(s => teams.get(refId(s.team) ?? '')).filter((x): x is Team => !!x);
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${a} vs ${b} - ${t.data.name}`,
    description: description ?? `${loc(m.data.stage, lang)} · ${m.data.format} · ${t.data.name}`,
    inLanguage: HTML_LANG[lang],
    sport: 'VALORANT',
    url: absolute(site, localePath(lang, `/matches/${m.id}`)),
    image: absolute(site, ogImagePath('match', m.id)),
    // Google requires startDate; fall back to the event window until Riot publishes match times.
    startDate: m.data.startTime ?? t.data.startDate ?? undefined,
    ...(!m.data.startTime && t.data.endDate && { endDate: t.data.endDate }),
    eventStatus: EVENT_STATUS,
    eventAttendanceMode: t.data.location ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode',
    location: place(t, lang),
    organizer: ORGANIZER,
    superEvent: { '@type': 'SportsEvent', name: t.data.name, url: absolute(site, localePath(lang, `/tournaments/${t.id}`)) },
    ...(competitors.length && { competitor: competitors.map(team => sportsTeam(team, site, lang)) }),
  };
}

export function teamLd(
  team: Team,
  players: ResolvedPlayer[],
  site: URL | undefined,
  lang: Lang,
  staff: Roster['data']['staff'] = [],
  description?: string,
) {
  const sameAs = [team.data.socials.liquipedia, team.data.socials.website, team.data.socials.x, team.data.socials.youtube].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    ...sportsTeam(team, site, lang),
    ...(description && { description }),
    image: absolute(site, ogImagePath('team', team.id)),
    location: { '@type': 'Country', name: countryName(team.data.country, lang) },
    ...(team.data.orgRegion === 'PAC' && {
      memberOf: { '@type': 'SportsOrganization', name: 'VCT Pacific', sport: 'VALORANT' },
    }),
    ...(sameAs.length && { sameAs }),
    athlete: players.map(p => ({
      '@type': 'Person',
      name: p.handle,
      ...(p.name && { alternateName: p.name }),
      ...(p.avatar && { image: absolute(site, p.avatar) }),
      ...(p.country && { nationality: countryName(p.country, lang) }),
    })),
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
