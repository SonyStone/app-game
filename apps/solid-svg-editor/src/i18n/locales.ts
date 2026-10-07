import { parsePo, type PoCatalog } from './po';

// GodSVG's translations (MIT), copied from its `translations/` folder. Each file is loaded on first use.
const loaders = import.meta.glob<string>('./translations/*.po', { query: '?raw', import: 'default' });
const catalogs = new Map<string, Promise<PoCatalog>>();

/** The source language: messages are written in English, so it needs no catalog. */
export const sourceLocale = 'en';

/** Locale codes with a translation, English first, joke locales last, others alphabetically. */
export const availableLocales: readonly string[] = [
  sourceLocale,
  ...Object.keys(loaders)
    .map((path) => path.replace(/^.*\/|\.po$/g, ''))
    .sort((a, b) => Number(a === 'lolcat') - Number(b === 'lolcat') || a.localeCompare(b))
];

/** Loads and parses a locale's catalog once; later calls share the result. Rejects for unknown locales. */
export function loadCatalog(locale: string): Promise<PoCatalog> {
  const cached = catalogs.get(locale);

  if (cached) {
    return cached;
  }

  const loader = loaders[`./translations/${locale}.po`];
  const catalog = loader ? loader().then(parsePo) : Promise.reject(new Error(`No translation for ${locale}`));
  catalogs.set(locale, catalog);
  return catalog;
}

/** A language name with its code, as GodSVG lists them: `Russian (RU)`, `Brazilian Portuguese (pt-BR)`. */
export function localeDisplayName(locale: string): string {
  const tag = locale.replace('_', '-');
  const name = specialLocaleNames[locale] ?? new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? locale;
  const code = tag.includes('-') ? tag.replace(/-(.*)$/, (_, region: string) => `-${region.toUpperCase()}`) : tag.toUpperCase();
  return `${name} (${code})`;
}

const specialLocaleNames: Readonly<Record<string, string>> = {
  pt_BR: 'Brazilian Portuguese',
  zh_CN: 'Simplified Chinese',
  lolcat: 'Lolcat'
};

/** Replaces GodSVG-style `{name}` placeholders; placeholders without a value are kept. */
export function formatMessage(template: string, values: Readonly<Record<string, string | number>> | undefined): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** The locale to use for a stored or browser language: an available code, else English. */
export function resolveLocale(language: unknown): string {
  if (typeof language !== 'string') {
    return sourceLocale;
  }

  const normalized = language.replace('-', '_');
  return (
    availableLocales.find((locale) => locale.toLowerCase() === normalized.toLowerCase()) ??
    availableLocales.find((locale) => locale.toLowerCase() === normalized.split('_')[0]?.toLowerCase()) ??
    sourceLocale
  );
}
