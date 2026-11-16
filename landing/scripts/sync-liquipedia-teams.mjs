// Sync team name and logo from Liquipedia's MediaWiki API into src/data/teams.json and public/images/teams/.
// Usage: node scripts/sync-liquipedia-teams.mjs [--team <id>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const API = 'https://liquipedia.net/valorant/api.php';
const HEADERS = {
  'User-Agent': 'valorant-pacific-fan/1.0 (https://vctpacific.likecactus.com)',
  'Accept-Encoding': 'gzip',
};
const TEAMS_PATH = path.resolve('src/data/teams.json');
const LOGO_DIR = path.resolve('public/images/teams');
const DELAY_MS = 2000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(argv) {
  const idx = argv.indexOf('--team');
  return { teamId: idx !== -1 ? argv[idx + 1] : null };
}

async function fetchJson(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Liquipedia API ${res.status} for ${url}`);
  return res.json();
}

/** Extract key=value fields from the first {{Infobox team ...}} block in wikitext. */
function parseInfobox(wikitext) {
  const start = wikitext.search(/\{\{\s*Infobox team\b/i);
  if (start === -1) return {};
  let depth = 0;
  let end = wikitext.length;
  for (let i = start; i < wikitext.length - 1; i++) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
      depth++;
      i++;
    } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const block = wikitext.slice(start, end);
  const fields = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s*\|\s*([a-zA-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/<!--[\s\S]*?-->/g, '').trim();
    if (value) fields[m[1].toLowerCase()] = value;
  }
  return fields;
}

function extFromMimeOrUrl(mime, url) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  const ext = path.extname(new URL(url).pathname).replace(/^\./, '').toLowerCase();
  return ext || 'png';
}

async function resolveImageInfo(filename) {
  const normalized = filename.replace(/^File:/i, '').trim();
  const data = await fetchJson({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|mime|size',
    titles: `File:${normalized}`,
  });
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.imageinfo?.[0] ?? null;
}

async function syncTeam(team) {
  const lpUrl = team.socials?.liquipedia;
  if (!lpUrl) {
    console.log(`- ${team.id}: skipped (no socials.liquipedia)`);
    return false;
  }
  const title = decodeURIComponent(new URL(lpUrl).pathname.replace(/^\/valorant\//, ''));
  const data = await fetchJson({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1',
    titles: title,
  });
  const page = Object.values(data.query?.pages ?? {})[0];
  const wikitext = page?.revisions?.[0]?.slots?.main?.['*'] ?? '';
  if (!wikitext) throw new Error(`${team.id}: empty wikitext for "${title}"`);

  const info = parseInfobox(wikitext);
  let changed = false;

  if (info.name && info.name !== team.name) {
    console.log(`- ${team.id}: name "${team.name}" -> "${info.name}"`);
    team.name = info.name;
    changed = true;
  }

  // Prefer dark-mode logo on this dark-themed site, fall back to default infobox image.
  const imageFile = info.imagedark || info.image;
  if (imageFile) {
    const imageInfo = await resolveImageInfo(imageFile);
    if (!imageInfo?.url) throw new Error(`${team.id}: could not resolve image "${imageFile}"`);

    const imgRes = await fetch(imageInfo.url, { headers: HEADERS });
    if (!imgRes.ok) throw new Error(`${team.id}: failed to download ${imageInfo.url} (${imgRes.status})`);

    const ext = extFromMimeOrUrl(imageInfo.mime, imageInfo.url);
    const filename = `${team.id}.${ext}`;
    mkdirSync(LOGO_DIR, { recursive: true });
    writeFileSync(path.join(LOGO_DIR, filename), Buffer.from(await imgRes.arrayBuffer()));

    const logoPath = `/images/teams/${filename}`;
    if (team.logo !== logoPath) {
      team.logo = logoPath;
      changed = true;
    }
    console.log(`- ${team.id}: logo saved to ${logoPath} (${imageInfo.width}x${imageInfo.height})`);
  } else {
    console.log(`- ${team.id}: no image found in infobox`);
  }

  return changed;
}

async function main() {
  const { teamId } = parseArgs(process.argv.slice(2));
  const teams = JSON.parse(readFileSync(TEAMS_PATH, 'utf8'));
  const targets = teamId ? teams.filter(t => t.id === teamId) : teams;
  if (targets.length === 0) {
    console.error(`Team not found: ${teamId}`);
    process.exit(1);
  }

  let updated = 0;
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await sleep(DELAY_MS);
    if (await syncTeam(targets[i])) updated++;
  }

  writeFileSync(TEAMS_PATH, JSON.stringify(teams, null, 2) + '\n', 'utf8');
  console.log(`Done. ${updated} team(s) updated in src/data/teams.json.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

