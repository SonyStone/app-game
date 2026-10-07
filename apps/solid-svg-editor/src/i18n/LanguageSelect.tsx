import { createSignal, For, onSettled } from 'solid-js';

import { useI18n } from './I18nProvider';
import { availableLocales, loadCatalog, localeDisplayName, sourceLocale } from './locales';

/**
 * GodSVG's language picker: every available language with its code and, once the catalogs have loaded, how much of
 * GodSVG's text it translates. Mounting it loads all catalogs.
 */
export function LanguageSelect(props: { readonly value: string; readonly onChange: (locale: string) => void }) {
  const { t } = useI18n();
  const [coverage, setCoverage] = createSignal<Readonly<Record<string, number>>>({});

  onSettled(() => {
    let current = true;

    for (const locale of availableLocales.filter((item) => item !== sourceLocale)) {
      void loadCatalog(locale)
        .then((catalog) => {
          if (current) {
            setCoverage((previous) => ({ ...previous, [locale]: (catalog.translatedCount / catalog.messageCount) * 100 }));
          }
        })
        .catch(() => undefined);
    }

    return () => {
      current = false;
    };
  });

  const label = (locale: string) => {
    const percent = coverage()[locale];
    return percent === undefined ? localeDisplayName(locale) : `${localeDisplayName(locale)} — ${Math.floor(percent * 10) / 10}%`;
  };

  return (
    <label class="grid gap-1 text-[11px] text-[var(--muted)]">
      {t('Language')}
      <select
        class="block h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1 text-[11px] text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
        value={props.value}
        data-testid="settings-language-select"
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        <For each={availableLocales}>{(locale) => <option value={locale}>{label(locale)}</option>}</For>
      </select>
    </label>
  );
}
