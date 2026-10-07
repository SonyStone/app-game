import { createSignal, For, onSettled, Show } from 'solid-js';

import { godSvgCredits, godSvgLicense, thirdPartyComponents } from '../../editor/godsvg-credits';
import { useI18n } from '../../i18n/I18nProvider';
import { availableLocales, loadCatalog, localeDisplayName, sourceLocale } from '../../i18n/locales';

/** GodSVG's About tabs: authors (with translators from each translation), donors, the license, and third-party licenses. */
export function AboutContent() {
  const { t } = useI18n();
  const [tab, setTab] = createSignal<'authors' | 'donors' | 'license' | 'third-party'>('authors');
  const [translators, setTranslators] = createSignal<readonly { readonly locale: string; readonly names: readonly string[] }[]>([]);

  onSettled(() => {
    let current = true;
    const locales = availableLocales.filter((locale) => locale !== sourceLocale);

    void Promise.all(
      locales.map(async (locale) => {
        const credits = (await loadCatalog(locale).catch(() => undefined))?.translations.get('translation-credits') ?? '';
        return { locale, names: credits.split(',').map((name) => name.trim()).filter(Boolean) };
      })
    ).then((items) => {
      if (current) {
        setTranslators(items.filter((item) => item.names.length > 0));
      }
    });

    return () => {
      current = false;
    };
  });

  const tabs = [
    { id: 'authors', label: 'Authors' },
    { id: 'donors', label: 'Donors' },
    { id: 'license', label: 'License' },
    { id: 'third-party', label: 'Third-party licenses' }
  ] as const;

  return (
    <div class="grid gap-2" data-testid="about-content">
      <div class="flex flex-wrap gap-1" role="tablist">
        <For each={tabs}>
          {(item) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === item.id ? 'true' : 'false'}
              class="cursor-pointer rounded border border-[var(--soft-border)] px-2 py-0.5 aria-selected:border-[var(--accent)] aria-selected:text-[var(--accent)]"
              data-testid={`about-tab-${item.id}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.label)}
            </button>
          )}
        </For>
      </div>
      <Show when={tab() === 'authors'}>
        <p class="m-0">
          {t('Project Founder and Manager')}: {godSvgCredits.projectFounderAndManager}
        </p>
        <NameGrid title={t('Developers')} names={godSvgCredits.authors} />
        <div class="grid gap-1" data-testid="about-translators">
          <h3 class="m-0 text-[13px]">{t('Translators')}</h3>
          <For each={translators()}>
            {(item) => (
              <div class="grid gap-0.5">
                <span class="text-[var(--muted)]">{localeDisplayName(item.locale)}</span>
                <div class="flex flex-wrap gap-1">
                  <For each={item.names.map(parseCredit)}>
                    {(credit) => (
                      <span class="inline-flex items-center gap-1 rounded border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 py-0.5">
                        {credit.name}
                        <Show when={credit.email}>
                          {(email) => (
                            <button
                              type="button"
                              class="cursor-pointer border-0 bg-transparent p-0 text-[var(--accent)]"
                              title={t('Copy email')}
                              aria-label={t('Copy email')}
                              onClick={() => void navigator.clipboard.writeText(email()).catch(() => undefined)}
                            >
                              ✉
                            </button>
                          )}
                        </Show>
                      </span>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={tab() === 'donors'}>
        <NameGrid title={t('Diamond donors')} names={withAnonymous(godSvgCredits.diamondDonors)} />
        <NameGrid title={t('Golden donors')} names={withAnonymous(godSvgCredits.goldenDonors)} />
        <NameGrid title={t('Donors')} names={withAnonymous(godSvgCredits.donors)} />
      </Show>
      <Show when={tab() === 'license'}>
        <pre class="m-0 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] whitespace-pre-wrap" data-testid="about-license">
          {godSvgLicense}
        </pre>
      </Show>
      <Show when={tab() === 'third-party'}>
        <ul class="m-0 grid list-none gap-1.5 p-0" data-testid="about-third-party">
          <For each={thirdPartyComponents}>
            {(component) => (
              <li>
                <strong>{component.name}</strong>
                <div class="text-[var(--muted)]">
                  © {component.copyright} — {component.license}
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

/** A translator credit, `Name` or `Name <email>`, as GodSVG's translation files write them. */
function parseCredit(credit: string): { readonly name: string; readonly email: string | undefined } {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(credit);
  return match ? { name: match[1] ?? credit, email: match[2] } : { name: credit, email: undefined };
}

function withAnonymous(group: { readonly names: readonly string[]; readonly anonymous: number }): readonly string[] {
  return [...group.names, ...Array.from({ length: group.anonymous }, () => 'Anonymous')];
}

function NameGrid(props: { readonly title: string; readonly names: readonly string[] }) {
  return (
    <Show when={props.names.length > 0}>
      <div class="grid gap-1">
        <h3 class="m-0 text-[13px]">{props.title}</h3>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1">
          <For each={props.names}>
            {(name) => <span class="rounded border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 py-0.5">{name}</span>}
          </For>
        </div>
      </div>
    </Show>
  );
}
