import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { formatDateRange } from '../../i18n';
import { CURRENT_SEASON, db, refId, resolvedRoster, rosterOf, sideName } from '../../lib/data';

/**
 * Build-time Open Graph images (1200×630 PNG) for the site, every match, tournament and team.
 * Text is English so a single Latin font set covers it; fonts come from @fontsource so the
 * Cloudflare build image needs no system fonts.
 */

const font = (pkg: string, file: string) => readFileSync(path.resolve('node_modules/@fontsource', pkg, 'files', file));
const FONTS = [
  { name: 'Inter', data: font('inter', 'inter-latin-600-normal.woff'), weight: 600 as const, style: 'normal' as const },
  { name: 'Inter', data: font('inter', 'inter-latin-800-normal.woff'), weight: 800 as const, style: 'normal' as const },
];

// Site logo, embedded as a data URI (satori cannot fetch files).
const LOGO = `data:image/jpeg;base64,${readFileSync(path.resolve('src/assets/logo.jpg')).toString('base64')}`;

function teamLogoUri(logoPath?: string) {
  if (!logoPath) return LOGO;
  const file = path.resolve('public', logoPath.replace(/^\//, ''));
  if (!existsSync(file)) return LOGO;
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext || 'png'}`;
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

type Node = { type: string; props: Record<string, unknown> };
const h = (style: Record<string, unknown>, ...children: (Node | string)[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

function card({ eyebrow, title, subtitle, meta, accent = '#ff4655', logo = LOGO }: { eyebrow: string; title: string[]; subtitle: string; meta: string; accent?: string; logo?: string }) {
  // Flat card: near-black panel, hairline border, one accent bar. Satori sizes boxes as content-box,
  // so the padded area is an explicit inner frame instead of root padding.
  return h(
    { width: 1200, height: 630, overflow: 'hidden', background: '#0f1519', color: '#f9f9f9', fontFamily: 'Inter', fontWeight: 600, position: 'relative' },
    h({ position: 'absolute', left: 40, top: 40, width: 1118, height: 548, background: '#0f0f0f', border: '1px solid #303030', borderRadius: 16 }),
    h({ position: 'absolute', left: 41, top: 41, width: 1118, height: 6, background: accent, borderRadius: 3 }),
    h(
      { position: 'absolute', left: 96, top: 96, width: 1008, height: 440, flexDirection: 'column' },
      h(
        { height: 88, alignItems: 'center', justifyContent: 'space-between' },
        h({ fontSize: 24, color: '#a3a3a3', textTransform: 'uppercase', maxWidth: 860 }, eyebrow),
        { type: 'img', props: { src: logo, width: 88, height: 88, style: { borderRadius: 12, objectFit: 'contain' } } },
      ),
      h(
        { flexDirection: 'column', flexGrow: 1, justifyContent: 'center', fontWeight: 800 },
        ...title.map(line => {
          const size = title.length > 2 ? 60 : 84;
          return h({ height: Math.round(size * 1.2), fontSize: size, letterSpacing: -1, color: line === 'vs' ? '#525252' : '#f9f9f9' }, line);
        }),
      ),
      h(
        { height: 104, flexDirection: 'column', justifyContent: 'flex-end' },
        h({ height: 40, fontSize: 30, color: '#f9f9f9' }, subtitle),
        h({ height: 34, fontSize: 24, color: '#8fa3b0' }, meta),
        h({ height: 26, fontSize: 18, color: '#525252', marginTop: 4 }, 'VCT Pacific Fan Hub · Unofficial fan site'),
      ),
    ),
  );
}

export const getStaticPaths = (async () => {
  const { matches, tournaments, teams } = await db();
  return [
    { params: { slug: 'default' } },
    ...matches.map(m => ({ params: { slug: `match/${m.id}` } })),
    ...tournaments.map(t => ({ params: { slug: `tournament/${t.id}` } })),
    ...teams.map(t => ({ params: { slug: `team/${t.id}` } })),
  ];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const { match, tournament, team, player } = await db();
  const [kind, id] = String(params.slug).split('/');
  let node: Node;

  if (kind === 'match') {
    const m = match.get(id)!;
    const event = tournament.get(refId(m.data.tournament)!)!;
    const [a, b] = m.data.teams.map(s => sideName(s, team, 'en'));
    const when = m.data.startTime
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(m.data.startTime)) + ' UTC'
      : `Time TBA · ${formatDateRange(event.data.startDate, event.data.endDate, 'en') ?? 'TBA'}`;
    node = card({ eyebrow: event.data.name, title: [a, 'vs', b], subtitle: `${m.data.stage.en} · ${m.data.format}`, meta: when });
  } else if (kind === 'tournament') {
    const t = tournament.get(id)!;
    const where = t.data.location ? `${t.data.location.city.en}, ${t.data.location.country}` : t.data.region;
    node = card({
      eyebrow: ['', 'International', 'VCT Pacific', 'Domestic & Qualifiers'][t.data.tier],
      title: [t.data.shortName],
      subtitle: t.data.name,
      meta: `${formatDateRange(t.data.startDate, t.data.endDate, 'en') ?? 'Dates TBA'} · ${where}`,
    });
  } else if (kind === 'team') {
    const t = team.get(id)!;
    const rosterEntry = await rosterOf(id);
    const r = rosterEntry?.data;
    const players = r ? resolvedRoster(r, player) : [];
    const regionLabel = { PAC: 'Asia-Pacific', EMEA: 'EMEA', AMER: 'Americas', CN: 'China' }[t.data.orgRegion] ?? t.data.orgRegion;
    node = card({
      eyebrow: r
        ? r.status === 'invited'
          ? `${regionLabel} · Invited Team`
          : `VCT Pacific ${r.season} · ${r.status === 'partner' ? 'Partner' : 'Open Qualifier'}`
        : `${regionLabel} · Invited Team`,
      title: [t.data.name],
      subtitle: `${t.data.tag} · ${players.map(p => p.handle).join(' · ') || regionLabel}`,
      meta: r ? `Roster as of ${r.asOf}` : `Region: ${regionLabel}`,
      accent: t.data.colors.primary,
      logo: teamLogoUri(t.data.logo),
    });
  } else {
    node = card({ eyebrow: `Season ${CURRENT_SEASON}`, title: ['VCT Pacific', String(CURRENT_SEASON)], subtitle: '8 Partners · 4 Open Qualifiers · 3 tickets to Seoul', meta: 'Schedule · Brackets · Teams · Stats · Format' });
  }

  const svg = await satori(node as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts: FONTS });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
