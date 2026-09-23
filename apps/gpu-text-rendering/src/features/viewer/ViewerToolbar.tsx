import { Button } from '@app-game/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@app-game/components/ui/dropdown-menu';
import arrowBack from '@tabler/icons/outline/arrow-left.svg?url';
import chevron from '@tabler/icons/outline/chevron-right.svg?url';
import dots from '@tabler/icons/outline/dots.svg?url';
import folder from '@tabler/icons/outline/folder-open.svg?url';
import languageIcon from '@tabler/icons/outline/language.svg?url';
import grid from '@tabler/icons/outline/layout-grid.svg?url';
import expand from '@tabler/icons/outline/maximize.svg?url';
import collapse from '@tabler/icons/outline/minimize.svg?url';
import { createEffect, createSignal, For, Show, untrack } from 'solid-js';
import noticesUrl from '../document/pdf/wasm/third-party-notices.txt?url';
import type { ViewerState } from './createViewerState';
import { languages, type createViewerI18n } from './i18n/createViewerI18n';
import s from './viewer.module.scss';

/** Compact shared desktop/touch toolbar. Secondary actions stay inside the Solid-UI dropdown. */
export function ViewerToolbar(props: {
  viewer: ViewerState;
  i18n: ReturnType<typeof createViewerI18n>;
  filename?: string;
  profile: 'glyphs' | 'curves';
  exporting: boolean;
  canExport: boolean;
  fullscreen: boolean;
  fullscreenSupported: boolean;
  onOpen: (file: File) => void;
  onDemo: () => void;
  onExport: () => void;
  onFullscreen: () => void;
}) {
  const t = untrack(() => props.i18n.t);
  let input: HTMLInputElement | undefined;
  return (
    <div id="toolbar" class={s.toolbar} role="group" aria-label={t('controls')}>
      <input
        ref={input}
        hidden
        type="file"
        accept=".pdf,.gdoc,application/pdf"
        aria-label={t('open')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) props.onOpen(file);
          event.currentTarget.value = '';
        }}
      />
      <Button
        class={s.iconButton}
        variant="ghost"
        size="icon"
        aria-label={t('open')}
        title={t('openHint')}
        onClick={() => input?.click()}
      >
        <img src={folder} alt="" />
      </Button>
      <Button
        class={s.iconButton}
        variant="ghost"
        size="icon"
        aria-label={t('overview')}
        title={t('overview')}
        disabled={props.viewer.state().phase !== 'ready'}
        onClick={props.viewer.showOverview}
      >
        <img src={grid} alt="" />
      </Button>
      <Button
        class={s.iconButton}
        variant="ghost"
        size="icon"
        aria-label={props.fullscreen ? t('exitFullscreen') : t('enterFullscreen')}
        title={
          props.fullscreenSupported
            ? props.fullscreen
              ? t('exitFullscreen')
              : t('enterFullscreen')
            : t('fullscreenUnsupported')
        }
        disabled={!props.fullscreenSupported}
        onClick={props.onFullscreen}
      >
        <img src={props.fullscreen ? collapse : expand} alt="" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger class={s.iconButton} aria-label={t('more')} title={t('more')}>
          <img src={dots} alt="" />
        </DropdownMenuTrigger>
        <DropdownMenuContent class={s.menu} aria-label={t('menu')}>
          <ViewerMenu {...props} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A language submenu replaces the menu body so it fits narrow screens without a second floating panel. */
function ViewerMenu(props: Parameters<typeof ViewerToolbar>[0]) {
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
        fallback={
          <>
            <div class={s.documentInfo}>
              <strong dir="auto">{props.filename ?? t('demo')}</strong>
              <span>{t('privacy')}</span>
            </div>
            <Show when={props.canExport}>
              <DropdownMenuItem class={s.menuItem} disabled={props.exporting} onClick={props.onExport}>
                {props.exporting ? t('exporting') : t('download')}
              </DropdownMenuItem>
            </Show>
            <Show when={props.filename}>
              <DropdownMenuItem class={s.menuItem} onClick={props.onDemo}>
                {t('back')}
              </DropdownMenuItem>
            </Show>
            <DropdownMenuSeparator class={s.separator} />
            <DropdownMenuCheckboxItem
              class={s.menuItem}
              checked={props.viewer.autoZoom()}
              onClick={(event) => {
                event.preventDefault();
                props.viewer.setAutoZoom(!props.viewer.autoZoom());
              }}
            >
              {t('autoZoom')}
            </DropdownMenuCheckboxItem>
            <Show when={props.profile === 'glyphs'}>
              <DropdownMenuCheckboxItem
                class={s.menuItem}
                checked={props.viewer.grids()}
                onClick={(event) => {
                  event.preventDefault();
                  props.viewer.setGrids(!props.viewer.grids());
                }}
              >
                {t('grids')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                class={s.menuItem}
                checked={props.viewer.vectorOnly()}
                onClick={(event) => {
                  event.preventDefault();
                  props.viewer.setVectorOnly(!props.viewer.vectorOnly());
                }}
              >
                {t('vectorOnly')}
              </DropdownMenuCheckboxItem>
            </Show>
            <DropdownMenuSeparator class={s.separator} />
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
            <DropdownMenuSeparator class={s.separator} />
            <div class={s.documentInfo}>
              <span>{t('help')}</span>
              <output>{props.i18n.status(props.viewer.state())}</output>
            </div>
            <DropdownMenuItem
              class={s.menuItem}
              onClick={() => window.open(noticesUrl, '_blank', 'noopener,noreferrer')}
            >
              {t('licenses')}
            </DropdownMenuItem>
            <DropdownMenuItem
              class={s.menuItem}
              onClick={() =>
                window.open('https://wdobbie.com/post/war-and-peace-and-webgl/', '_blank', 'noopener,noreferrer')
              }
            >
              {t('about')}
            </DropdownMenuItem>
          </>
        }
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
