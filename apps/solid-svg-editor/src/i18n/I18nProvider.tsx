import type { JSX } from '@solidjs/web';
import { createContext, createEffect, createSignal, useContext, type Accessor } from 'solid-js';

import { formatMessage, loadCatalog, sourceLocale } from './locales';
import type { PoCatalog } from './po';

/** Translates GodSVG's English UI strings for the current language. */
export type Translator = {
  readonly locale: Accessor<string>;
  /**
   * The translation of an English message, with `{name}` placeholders filled from `values`. Messages without a
   * translation, and all messages until the language's catalog has loaded, come back in English. Reactive: reading
   * it in JSX updates the text when the language changes.
   */
  readonly t: (message: string, values?: Readonly<Record<string, string | number>>) => string;
};

const I18nContext = createContext<Translator>({ locale: () => sourceLocale, t: formatMessage });

/** The translator of the nearest provider; outside one, messages stay in English. */
export function useI18n(): Translator {
  return useContext(I18nContext);
}

/** Translates its subtree into `locale`, loading the catalog when the locale changes. */
export function I18nProvider(props: { readonly locale: string; readonly children: JSX.Element }) {
  const [catalog, setCatalog] = createSignal<PoCatalog>();

  createEffect(
    () => props.locale,
    (locale) => {
      let current = true;

      if (locale === sourceLocale) {
        setCatalog(undefined);
      } else {
        void loadCatalog(locale)
          .then((loaded) => current && setCatalog(loaded))
          .catch(() => current && setCatalog(undefined));
      }

      return () => {
        current = false;
      };
    }
  );

  const translator: Translator = {
    locale: () => props.locale,
    t: (message, values) => formatMessage(catalog()?.translations.get(message) ?? message, values)
  };

  return <I18nContext value={translator}>{props.children}</I18nContext>;
}
