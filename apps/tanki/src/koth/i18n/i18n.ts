import { createContextProvider } from '@app-game/solid-utils';
import { flatten, resolveTemplate, translator } from '@solid-primitives/i18n';
import { createMemo, createSignal } from 'solid-js';
import { en, type Dictionary } from './en';
import { ja } from './ja';
import { ru } from './ru';
import { sr } from './sr';

/** Scopes a `createKothI18n` to the subtree, and reads it there. */
export const [KothI18nProvider, useKothI18n] = createContextProvider<ReturnType<typeof createKothI18n>>();

/** The game's languages, each with its name in itself and a short code for compact switches. */
export const LANGUAGES = [
  { id: 'en', name: 'English', code: 'EN' },
  { id: 'ru', name: 'Русский', code: 'RU' },
  { id: 'ja', name: '日本語', code: 'JA' },
  { id: 'sr', name: 'Српски', code: 'SR' }
] as const;

/** A language of `LANGUAGES`, as a BCP 47 tag; Serbian is written in Cyrillic. */
export type LanguageId = (typeof LANGUAGES)[number]['id'];

/**
 * The game's language: `t` translates a dotted key of `Dictionary` (`t('menu.resume')`,
 * `t('hud.kills', 3)`), and `choose` switches the language at once and keeps it for the next
 * visit. English is the default; `?lang=ru` in the address overrides the kept choice for that visit.
 */
export function createKothI18n() {
  const [language, setLanguage] = createSignal(initialLanguage());
  const dictionary = createMemo(() => flatten(DICTIONARIES[language()]));

  return {
    language,
    t: translator(dictionary, resolveTemplate),

    /** Switches to `id` and keeps it in local storage; a blocked storage only forgets it. */
    choose(id: LanguageId) {
      setLanguage(id);

      try {
        localStorage.setItem(LANGUAGE_KEY, id);
      } catch {
        // The language still applies for this visit.
      }
    }
  };
}

const DICTIONARIES: Record<LanguageId, Dictionary> = { en, ru, ja, sr };

/** The language from `?lang=` in the address, else the one kept from the last visit, else English. */
function initialLanguage(): LanguageId {
  const asked = new URLSearchParams(window.location.search).get('lang') ?? keptLanguage();
  return LANGUAGES.find((language) => language.id === asked)?.id ?? 'en';
}

/** The language kept from the last visit, if the storage can be read. */
function keptLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

/** Key of the chosen language in local storage. */
const LANGUAGE_KEY = 'tanki.language';
