import { resolveTemplate, translator } from '@solid-primitives/i18n';
import { useSearchParams } from '@solidjs/router';
import type { ViewerStatus } from '../createViewerState';
import de from './de.json';
import en from './en.json';
import es from './es.json';
import he from './he.json';
import ja from './ja.json';
import ru from './ru.json';
import zh from './zh.json';

/** Router-owned locale; absent or unsupported language falls back to English without rewriting other URL state. */
export function createViewerI18n() {
  const [params, setParams] = useSearchParams();
  const locale = () => resolveLocale(params.lang);
  const t = translator(() => dictionaries[locale()], resolveTemplate);
  return {
    locale,
    t,
    direction: () => (locale() === 'he' ? ('rtl' as const) : ('ltr' as const)),
    /** Pushes a navigable history entry without scrolling or reloading the current document. */
    setLocale(value: string) {
      const next = resolveLocale(value);
      if (next !== locale() || (next === 'en' && params.lang !== undefined))
        setParams({ lang: next === 'en' ? undefined : next }, { replace: false, scroll: false });
    },
    /** Localizes UI progress; original library errors remain available as technical details. */
    status(status: ViewerStatus) {
      if (status.phase === 'loading') return t('loading');
      if (status.phase === 'preparing') return t('preparing');
      if (status.phase === 'error') return t('error');
      if (status.phase !== 'ready') return status.message;
      if (status.resourceBytes === undefined) return status.message;
      const memory = (status.resourceBytes / 1048576).toFixed(1);
      return status.preparationMs === undefined
        ? t('resources', { memory })
        : t('prepared', { memory, time: String(Math.round(status.preparationMs)) });
    }
  };
}

/** Native labels let users recognize their language regardless of the current UI locale. */
export const languages = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '简体中文' },
  { value: 'he', label: 'עברית' }
] as const;

/** Supported locale identifiers used in the lang query parameter. */
export type Locale = (typeof languages)[number]['value'];

/** Accept only known scalar URL values; browser language and stored preferences do not override English. */
export function resolveLocale(value: unknown): Locale {
  return languages.some((language) => language.value === value) ? (value as Locale) : 'en';
}

const dictionaries = { en, ru, es, de, ja, zh, he } satisfies Record<Locale, typeof en>;
