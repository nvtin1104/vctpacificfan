// Post-build checks on dist/: canonical + hreflang, JSON-LD, OG images, sitemap coverage and internal links.
// Run after `pnpm build` with `pnpm test:seo`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const SITE = (process.env.SITE_URL || 'https://vctpacific.likecactus.com').replace(/\/$/, '');
const LOCALES = ['vi', 'en', 'ko', 'ja'];

const walk = dir => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const pages = LOCALES.flatMap(l => walk(path.join(DIST, l))).filter(f => f.endsWith('.html'));
const urlOf = file => '/' + path.relative(DIST, file).replaceAll('\\', '/').replace(/index\.html$/, '');
const fileFor = pathname => {
  const clean = decodeURIComponent(pathname.split(/[?#]/)[0]);
  const target = path.join(DIST, clean);
  return clean.endsWith('/') ? path.join(target, 'index.html') : target;
};
const attr = (html, re) => [...html.matchAll(re)].map(m => m[1]);

test('dist contains every language', () => {
  assert.ok(existsSync(DIST), 'run pnpm build first');
  for (const l of LOCALES) assert.ok(existsSync(path.join(DIST, l, 'index.html')), `missing /${l}/`);
  assert.ok(pages.length >= 4 * 10);
});

test('each page has a self canonical and full hreflang set', () => {
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const url = urlOf(file);
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/g);
    assert.deepEqual(canonical, [SITE + url], `${url}: canonical`);
    const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
    assert.deepEqual(alts.map(a => a[0]).sort(), [...LOCALES, 'x-default'].sort(), `${url}: hreflang set`);
    for (const [, href] of alts) assert.ok(existsSync(fileFor(new URL(href).pathname)), `${url}: alternate ${href} missing`);
    const lang = url.split('/')[1];
    assert.ok(alts.some(([l, href]) => l === lang && href === SITE + url), `${url}: self alternate`);
  }
});

test('JSON-LD parses and OG images exist', () => {
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const url = urlOf(file);
    for (const block of attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(block);
      assert.equal(data['@context'], 'https://schema.org', `${url}: JSON-LD context`);
    }
    const [og] = attr(html, /<meta property="og:image" content="([^"]+)"/g);
    assert.ok(og, `${url}: og:image`);
    assert.ok(existsSync(fileFor(new URL(og).pathname)), `${url}: ${og} not generated`);
  }
});

test('match pages carry SportsEvent structured data', () => {
  const matchPages = pages.filter(f => urlOf(f).includes('/matches/'));
  assert.ok(matchPages.length > 0);
  for (const file of matchPages) {
    const html = readFileSync(file, 'utf8');
    const types = attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map(b => JSON.parse(b)['@type']);
    assert.ok(types.includes('SportsEvent'), `${urlOf(file)}: no SportsEvent`);
    const event = attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map(b => JSON.parse(b)).find(d => d['@type'] === 'SportsEvent');
    assert.ok(event.startDate, `${urlOf(file)}: SportsEvent without startDate`);
  }
});

test('sitemap lists every language page', () => {
  const sitemap = readdirSync(DIST).filter(f => /^sitemap-\d+\.xml$/.test(f)).map(f => readFileSync(path.join(DIST, f), 'utf8')).join('');
  const locs = new Set(attr(sitemap, /<loc>([^<]+)<\/loc>/g));
  for (const file of pages) assert.ok(locs.has(SITE + urlOf(file)), `sitemap missing ${urlOf(file)}`);
  assert.ok(sitemap.includes('hreflang="ko-KR"'), 'sitemap lacks xhtml:link alternates');
});

test('internal links resolve to built files', () => {
  const broken = new Set();
  for (const file of [...pages, path.join(DIST, 'index.html'), path.join(DIST, '404.html')]) {
    const html = readFileSync(file, 'utf8');
    for (const href of attr(html, /\shref="(\/[^"]*)"/g)) {
      if (href.startsWith('//')) continue;
      if (!existsSync(fileFor(href))) broken.add(`${urlOf(file)} → ${href}`);
    }
  }
  assert.deepEqual([...broken], []);
});
