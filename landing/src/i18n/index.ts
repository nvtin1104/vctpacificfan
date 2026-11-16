import vi from '../data/i18n/vi.json';
import en from '../data/i18n/en.json';
import ko from '../data/i18n/ko.json';
import ja from '../data/i18n/ja.json';

export const LOCALES = ['vi', 'en', 'ko', 'ja'] as const;
export type Lang = (typeof LOCALES)[number];
export type Localized = Record<Lang, string>;

export const DEFAULT_LANG: Lang = 'vi';
export const HTML_LANG: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US', ko: 'ko-KR', ja: 'ja-JP' };
export const OG_LOCALE: Record<Lang, string> = { vi: 'vi_VN', en: 'en_US', ko: 'ko_KR', ja: 'ja_JP' };
export const LANG_LABEL: Record<Lang, string> = { vi: 'Tiếng Việt', en: 'English', ko: '한국어', ja: '日本語' };

type Dict = typeof vi;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type Key = Leaves<Dict>;

const DICTS: Record<Lang, unknown> = { vi, en, ko, ja };

export const isLang = (value: unknown): value is Lang => LOCALES.includes(value as Lang);

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : undefined;
}

export const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;

// `{year}` in UI strings defaults to the current season (the season.json flagged "current").
const seasonFiles = import.meta.glob<{ year: number; current?: boolean }>('../data/seasons/*/season.json', { eager: true, import: 'default' });
const seasonList = Object.values(seasonFiles).sort((a, b) => a.year - b.year);
const DEFAULT_YEAR = (seasonList.find(s => s.current) ?? seasonList.at(-1))?.year ?? new Date().getFullYear();

/**
 * Returns a translator bound to one language. Falls back to English, then the key itself.
 * `defaults` fills placeholders for every call, e.g. `useT(lang, { year: 2028 })` on a season page.
 */
export function useT(lang: Lang, defaults: Record<string, string | number> = {}) {
  const base = { year: DEFAULT_YEAR, ...defaults };
  return (key: Key, vars?: Record<string, string | number>) => fill(lookup(DICTS[lang], key) ?? lookup(en, key) ?? key, { ...base, ...vars });
}

/** Loose lookup for keys built at runtime (e.g. `countries.${code}`); returns the fallback when missing. */
export function tryT(lang: Lang, key: string, fallback = key) {
  return lookup(DICTS[lang], key) ?? lookup(en, key) ?? fallback;
}

export const loc = (field: Localized, lang: Lang) => field[lang] || field.en;

/** `/schedule` → `/vi/schedule/`. Every internal URL ends with a slash to match Cloudflare Pages directory routing. */
export function localePath(lang: Lang, path = '/') {
  const clean = path.replace(/^\/+|\/+$/g, '');
  return clean ? `/${lang}/${clean}/` : `/${lang}/`;
}

/** Strips the language prefix: `/vi/teams/t1/` → `/teams/t1`. */
export function stripLang(pathname: string) {
  const rest = pathname.replace(/^\/(vi|en|ko|ja)(?=\/|$)/, '').replace(/\/+$/, '');
  return rest || '/';
}

export const langPaths = () => LOCALES.map(lang => ({ params: { lang } }));

const MONTH_DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
const FULL: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };

/** Formats a YYYY-MM-DD range for build-time rendering (date-only values are treated as UTC calendar days). */
export function formatDateRange(start: string | null, end: string | null, lang: Lang): string | null {
  if (!start) return null;
  const s = new Date(`${start}T00:00:00Z`);
  if (!end || end === start) return new Intl.DateTimeFormat(HTML_LANG[lang], FULL).format(s);
  const e = new Date(`${end}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat(HTML_LANG[lang], s.getUTCFullYear() === e.getUTCFullYear() ? MONTH_DAY : FULL);
  return `${fmt.format(s)} – ${new Intl.DateTimeFormat(HTML_LANG[lang], FULL).format(e)}`;
}

export const formatMoney = (amount: number, lang: Lang) =>
  new Intl.NumberFormat(HTML_LANG[lang], { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
