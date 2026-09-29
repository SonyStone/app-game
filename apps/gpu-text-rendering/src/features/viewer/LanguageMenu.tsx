import { DropdownMenuItem, DropdownMenuRadioItem, DropdownMenuSeparator } from '@app-game/components/ui/dropdown-menu';
import type { JSX } from '@solidjs/web';
import arrowBack from '@tabler/icons/outline/arrow-left.svg?url';
import chevron from '@tabler/icons/outline/chevron-right.svg?url';
import languageIcon from '@tabler/icons/outline/language.svg?url';
import { createEffect, createSignal, For, Show, untrack } from 'solid-js';
import { languages, type createViewerI18n } from './i18n/createViewerI18n';
import s from './viewer.module.scss';

/** Replaces menu contents with language choices, handling focus return and RTL keyboard navigation. */
export function LanguageMenu(props: {
  i18n: ReturnType<typeof createViewerI18n>;
  /** Builds the main menu and places the supplied language trigger among its items. */
  children: (languageItem: JSX.Element) => JSX.Element;
}) {
  const t = untrack(() => props.i18n.t);
  const [languageMenu, setLanguageMenu] = createSignal(false);
  let languageTrigger: HTMLButtonElement | undefined;
  let submenu: HTMLDivElement | undefined;
  let wasOpen = false;
  createEffect(languageMenu, (open) => {
    if (open) submenu?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    else if (wasOpen) languageTrigger?.focus();
    wasOpen = open;
  });
  return (
    <div
      onKeyDown={(event) => {
        if (
          languageMenu() &&
          (event.key === 'Escape' || event.key === (props.i18n.direction() === 'rtl' ? 'ArrowRight' : 'ArrowLeft'))
        ) {
          event.preventDefault();
          event.stopPropagation();
          setLanguageMenu(false);
        }
      }}
    >
      <Show
        when={languageMenu()}
        fallback={props.children(
          <DropdownMenuItem
            ref={languageTrigger}
            class={[s.menuItem, s.languageTrigger]}
            aria-haspopup="menu"
            aria-label={t('language')}
            aria-expanded="false"
            onClick={(event) => {
              event.preventDefault();
              setLanguageMenu(true);
            }}
            onKeyDown={(event) => {
              if (event.key === (props.i18n.direction() === 'rtl' ? 'ArrowLeft' : 'ArrowRight')) {
                event.preventDefault();
                event.stopPropagation();
                setLanguageMenu(true);
              }
            }}
          >
            <img src={languageIcon} alt="" />
            <b>{t('language')}</b>
            <bdi class={s.currentLanguage}>
              {languages.find((language) => language.value === props.i18n.locale())?.label}
            </bdi>
            <img class={s.directionalIcon} src={chevron} alt="" />
          </DropdownMenuItem>
        )}
      >
        <div ref={submenu} role="menu" aria-label={t('language')}>
          <DropdownMenuItem
            class={[s.menuItem, s.languageTrigger]}
            aria-label={t('backToMenu')}
            onClick={(event) => {
              event.preventDefault();
              setLanguageMenu(false);
            }}
          >
            <img class={s.directionalIcon} src={arrowBack} alt="" />
            <b>{t('language')}</b>
          </DropdownMenuItem>
          <DropdownMenuSeparator class={s.separator} />
          <For each={languages}>
            {(language) => (
              <DropdownMenuRadioItem
                class={s.menuItem}
                checked={props.i18n.locale() === language.value}
                onClick={(event) => {
                  event.preventDefault();
                  props.i18n.setLocale(language.value);
                }}
              >
                <bdi lang={language.value}>{language.label}</bdi>
              </DropdownMenuRadioItem>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
