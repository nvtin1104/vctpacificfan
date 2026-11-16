// Astro integration: after the build, append season-aware redirect rules to dist/_redirects (Cloudflare Pages).
// Season sections live at /<lang>/<year>/<section>/; the short URLs /<lang>/<section>/ always point at the
// season flagged "current": true in src/data/seasons/<year>/season.json, so they move on when a new season starts.
import { appendFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEASONS_DIR = path.resolve('src/data/seasons');
const SECTIONS = ['tournaments', 'schedule', 'teams', 'statistics'];

export async function readSeasons() {
  const dirs = (await readdir(SEASONS_DIR, { withFileTypes: true })).filter(d => d.isDirectory() && /^\d{4}$/.test(d.name));
  const seasons = await Promise.all(dirs.map(async d => JSON.parse(await readFile(path.join(SEASONS_DIR, d.name, 'season.json'), 'utf8'))));
  return seasons.sort((a, b) => a.year - b.year);
}

export async function buildRules(defaultLang = 'vi') {
  const seasons = await readSeasons();
  const current = (seasons.find(s => s.current) ?? seasons.at(-1)).year;
  const explainer = [...seasons].reverse().find(s => s.explainer && s.year <= current) ?? [...seasons].reverse().find(s => s.explainer);
  const lines = [`# Generated from src/data/seasons at build time — current season ${current}.`];
  // Short section URLs → current season (302: they move every season).
  for (const section of SECTIONS) {
    lines.push(`/:lang/${section}  /:lang/${current}/${section}/  302`);
    lines.push(`/${section}  /${defaultLang}/${current}/${section}/  302`);
  }
  if (explainer) {
    lines.push(`/:lang/rules  /:lang/${explainer.year}/rules/  302`, `/rules  /${defaultLang}/${explainer.year}/rules/  302`);
  }
  // Year-specific legacy URLs from before seasons had their own folder (permanent).
  for (const s of seasons.filter(x => x.explainer)) lines.push(`/:lang/rules-${s.year}  /:lang/${s.year}/rules/  301`);
  return lines.join('\n') + '\n';
}

/** @param {{ locales: string[] }} options */
export function seasonRedirects({ locales }) {
  return {
    name: 'season-redirects',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const file = path.join(fileURLToPath(dir), '_redirects');
        await appendFile(file, '\n' + (await buildRules(locales[0])));
        logger.info('Appended season redirects to _redirects');
      },
    },
  };
}
