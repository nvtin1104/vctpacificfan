import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { seasonRedirects } from './scripts/season-redirects.mjs';

const LOCALES = { vi: 'vi', en: 'en', ko: 'ko', ja: 'ja' };

const seasonsDir = path.resolve('src/data/seasons');
const seasonConfigs = readdirSync(seasonsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
  .map(d => JSON.parse(readFileSync(path.join(seasonsDir, d.name, 'season.json'), 'utf8')));
const currentSeason = seasonConfigs.find(s => s.current) ?? seasonConfigs.at(-1);
const seasonAsOf = new Map(seasonConfigs.map(s => [String(s.year), s.asOf]));

export default defineConfig({
  // Canonical origin for <link rel="canonical">, hreflang, Open Graph URLs and sitemap.xml.
  site: process.env.SITE_URL || 'https://vctpacific.likecactus.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  // Fetch a page on hover so switching events in the season strip feels instant.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  i18n: {
    locales: Object.keys(LOCALES),
    defaultLocale: 'vi',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    sitemap({
      filter: page => /\/(vi|en|ko|ja)(\/|$)/.test(new URL(page).pathname),
      i18n: { defaultLocale: 'vi', locales: LOCALES },
      serialize(item) {
        const m = new URL(item.url).pathname.match(/^\/(?:vi|en|ko|ja)\/(\d{4})\//);
        const asOf = (m && seasonAsOf.get(m[1])) || currentSeason?.asOf;
        return asOf ? { ...item, lastmod: `${asOf}T00:00:00.000Z` } : item;
      },
    }),
    // Appends "/<lang>/schedule → /<lang>/<current season>/schedule" style rules to dist/_redirects.
    seasonRedirects({ locales: Object.keys(LOCALES) }),
  ],
  server: { port: 4323 },
  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true },
    // Native resvg binary must stay a runtime require, not be bundled into the prerender chunk.
    ssr: { external: ['@resvg/resvg-js'] },
    optimizeDeps: { exclude: ['@resvg/resvg-js'] },
  },
});
