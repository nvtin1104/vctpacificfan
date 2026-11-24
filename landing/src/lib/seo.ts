import { LOCALES, localePath, type Lang } from '../i18n';

/** Absolute URL on the canonical origin (astro.config `site`). */
export const absolute = (site: URL | undefined, path: string) => new URL(path, site ?? 'https://vctpacific.likecactus.com').href;

/** hreflang alternates for a language-less path, plus x-default (root language picker for '/', English for all other routes). */
export function alternates(site: URL | undefined, path: string) {
  const isRoot = path === '/' || path === '';
  return [
    ...LOCALES.map(lang => ({ hreflang: lang, href: absolute(site, localePath(lang, path)) })),
    { hreflang: 'x-default', href: absolute(site, isRoot ? '/' : localePath('en', path)) },
  ];
}

export const ogImagePath = (kind: 'default' | 'match' | 'tournament' | 'team', id?: string) =>
  kind === 'default' ? '/og/default.png' : `/og/${kind}/${id}.png`;

/** What an og:image needs: URL plus the real size and type of the file behind it. */
export type OgImage = { src: string; width: number; height: number; type: string; alt?: string };

/** Build-time generated card (see src/pages/og/[...slug].png.ts): always 1200×630 PNG. */
export const generatedOg = (src: string, alt?: string): OgImage => ({ src, width: 1200, height: 630, type: 'image/png', ...(alt && { alt }) });

/** An original image file used as-is (e.g. a season banner); reports its own dimensions and type. */
export const fileOg = (image: { src: string; width: number; height: number; format: string }, alt?: string): OgImage => ({
  src: image.src,
  width: image.width,
  height: image.height,
  type: image.format === 'jpg' || image.format === 'jpeg' ? 'image/jpeg' : `image/${image.format}`,
  alt,
});

export const pageTitle = (title: string, siteName: string) =>
  title === siteName || title.includes(siteName) ? title : `${title} | ${siteName}`;

/** Normalize whitespace and cleanly truncate meta descriptions to fit search snippets. */
export function truncateDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max - 1);
  if (cut.includes(' ') && !/\s/.test(clean[max - 1] ?? '')) {
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  }
  cut = cut.replace(/[,;:\-·\s]+$/, '');
  return cut.endsWith('.') ? cut : `${cut}…`;
}

export type PageMeta = {
  lang: Lang;
  /** Language-less path, e.g. `/teams/t1`. */
  path: string;
  title: string;
  description: string;
  /** Path of a generated card, or a full OgImage; defaults to the season banner (else the generated default card). */
  ogImage?: string | OgImage;
  ogType?: 'website' | 'article';
  ogImageAlt?: string;
  modifiedTime?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>[];
};
