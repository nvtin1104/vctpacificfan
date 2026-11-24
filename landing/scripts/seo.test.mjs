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
    const expectedXDefault = LOCALES.some(l => url === `/${l}/`) ? `${SITE}/` : SITE + url.replace(/^\/(vi|en|ko|ja)\//, '/en/');
    assert.ok(alts.some(([l, href]) => l === 'x-default' && href === expectedXDefault), `${url}: x-default should be ${expectedXDefault}`);
  }
});

test('every page has valid title, description, robots, single h1, and complete OG/Twitter tags', () => {
  const seenTitles = new Map(LOCALES.map(l => [l, new Map()]));
  const seenDescs = new Map(LOCALES.map(l => [l, new Map()]));
  const metaProp = (html, prop) => attr(html, new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'g'))[0];
  const metaName = (html, name) => attr(html, new RegExp(`<meta name="${name}" content="([^"]*)"`, 'g'))[0];

  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const url = urlOf(file);
    const lang = url.split('/')[1];

    const [title] = attr(html, /<title>([^<]+)<\/title>/g);
    assert.ok(title && title.trim().length > 0, `${url}: empty <title>`);
    assert.ok(!title.includes('| VCT Pacific Fan Hub | VCT Pacific Fan Hub'), `${url}: duplicate site name in <title>: ${title}`);
    assert.ok(title.length <= 95, `${url}: <title> too long (${title.length}): ${title}`);

    const desc = metaName(html, 'description');
    assert.ok(desc && desc.length >= 40 && desc.length <= 180, `${url}: description length ${desc?.length ?? 0} out of range: ${desc}`);

    const robots = metaName(html, 'robots');
    assert.ok(robots && robots.includes('index, follow') && robots.includes('max-image-preview:large'), `${url}: invalid robots meta: ${robots}`);

    const h1Count = [...html.matchAll(/<h1\b/g)].length;
    assert.equal(h1Count, 1, `${url}: expected 1 <h1>, found ${h1Count}`);

    for (const prop of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) {
      assert.ok(metaProp(html, prop), `${url}: missing ${prop}`);
    }
    for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
      assert.ok(metaName(html, name), `${url}: missing ${name}`);
    }

    assert.ok(!seenTitles.get(lang).has(title), `${url}: duplicate title in ${lang} with ${seenTitles.get(lang).get(title)}: ${title}`);
    seenTitles.get(lang).set(title, url);
    assert.ok(!seenDescs.get(lang).has(desc), `${url}: duplicate description in ${lang} with ${seenDescs.get(lang).get(desc)}: ${desc}`);
    seenDescs.get(lang).set(desc, url);
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

test('structured data covers key page types', () => {
  const blocks = html => attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map(b => JSON.parse(b));
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const url = urlOf(file);
    const items = blocks(html);
    const types = items.map(d => d['@type']);

    if (/^\/(vi|en|ko|ja)\/$/.test(url)) {
      assert.ok(types.includes('WebSite'), `${url}: missing WebSite`);
      assert.ok(types.includes('Organization'), `${url}: missing Organization`);
    } else if (/^\/(vi|en|ko|ja)\/\d{4}\/(teams|tournaments|schedule|offseason)\/$/.test(url)) {
      const col = items.find(d => d['@type'] === 'CollectionPage');
      assert.ok(col && col.mainEntity?.['@type'] === 'ItemList', `${url}: missing CollectionPage ItemList`);
      assert.ok(types.includes('BreadcrumbList'), `${url}: missing BreadcrumbList`);
    } else if (/^\/(vi|en|ko|ja)\/teams\/[^/]+\/$/.test(url)) {
      const team = items.find(d => d['@type'] === 'SportsTeam');
      assert.ok(team && team.alternateName, `${url}: missing SportsTeam with alternateName`);
      assert.ok(types.includes('BreadcrumbList'), `${url}: missing BreadcrumbList`);
    } else if (/^\/(vi|en|ko|ja)\/tournaments\/[^/]+\/$/.test(url)) {
      const event = items.find(d => d['@type'] === 'SportsEvent');
      assert.ok(event, `${url}: missing SportsEvent`);
      for (const sub of event.subEvent ?? []) {
        assert.ok(!/^[a-z]{2}\d{2}-[a-z0-9-]+$/i.test(sub.name), `${url}: subEvent uses raw match id: ${sub.name}`);
      }
      assert.ok(types.includes('BreadcrumbList'), `${url}: missing BreadcrumbList`);
    } else if (/^\/(vi|en|ko|ja)\/matches\/[^/]+\/$/.test(url)) {
      const event = items.find(d => d['@type'] === 'SportsEvent');
      assert.ok(event && event.startDate, `${url}: SportsEvent without startDate`);
      assert.ok(types.includes('BreadcrumbList'), `${url}: missing BreadcrumbList`);
    } else if (url.includes('/rules/')) {
      assert.ok(types.includes('FAQPage'), `${url}: missing FAQPage`);
      assert.ok(types.includes('Article'), `${url}: missing Article`);
      assert.ok(types.includes('BreadcrumbList'), `${url}: missing BreadcrumbList`);
    } else if (url.includes('/statistics/')) {
      assert.ok(types.includes('Dataset'), `${url}: missing Dataset`);
      assert.ok(types.includes('BreadcrumbList'), `${url}: missing BreadcrumbList`);
    }
  }
});

test('sitemap lists every language page', () => {
  const sitemap = readdirSync(DIST).filter(f => /^sitemap-\d+\.xml$/.test(f)).map(f => readFileSync(path.join(DIST, f), 'utf8')).join('');
  const locs = new Set(attr(sitemap, /<loc>([^<]+)<\/loc>/g));
  for (const file of pages) assert.ok(locs.has(SITE + urlOf(file)), `sitemap missing ${urlOf(file)}`);
  for (const lang of LOCALES) assert.ok(sitemap.includes(`hreflang="${lang}"`), `sitemap lacks xhtml:link alternate for ${lang}`);
  assert.ok(sitemap.includes('<lastmod>'), 'sitemap lacks <lastmod>');
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
