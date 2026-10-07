import type { JSX } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';

import { colorToHex } from '../../editor/colors';
import { downloadBlob } from '../../editor/export-utils';
import { isPaletteXml, palettePresets, palettesFromXml, paletteToXml, paletteWarnings, type ColorPalette } from '../../editor/palettes';
import MoveDownIcon from '../../App.icons/MoveDown.svg';
import MoveUpIcon from '../../App.icons/MoveUp.svg';
import RenameIcon from '../../icons/Rename.svg';
import SmallMoreIcon from '../inspector/icons/SmallMore.svg';
import { createDismissible } from '../ui/createDismissible';
import CopyIcon from '../ui/icons/Copy.svg';
import ExportIcon from '../ui/icons/Export.svg';
import ImportIcon from '../ui/icons/Import.svg';
import WarningIcon from '../ui/icons/Warning.svg';
import { MenuButton } from '../ui/MenuItem';
import PasteIcon from '../viewport/icons/Paste.svg';
import { decorativeIconProps } from '../../editor/svg-icon';
import DeleteIcon from '../ui/icons/Delete.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import { ColorPopup } from './ColorPopup';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * The Palettes settings page, like GodSVG's: each palette has its title, named colors, warnings, and a menu (rename,
 * apply a preset, move, delete, copy or save as XML); new palettes start empty or come from XML (a file or the
 * clipboard).
 */
export function PaletteSettings(props: {
  readonly palettes: readonly ColorPalette[];
  readonly setPalettes: (update: (palettes: readonly ColorPalette[]) => readonly ColorPalette[]) => void;
}) {
  const { t } = useI18n();
  const updatePalette = (index: number, update: (palette: ColorPalette) => ColorPalette) =>
    props.setPalettes((palettes) => palettes.map((palette, itemIndex) => (itemIndex === index ? update(palette) : palette)));
  const updateColor = (paletteIndex: number, colorIndex: number, change: Partial<ColorPalette['colors'][number]>) =>
    updatePalette(paletteIndex, (palette) => ({
      ...palette,
      colors: palette.colors.map((color, itemIndex) => (itemIndex === colorIndex ? { ...color, ...change } : color))
    }));

  const [xmlMenu, setXmlMenu] = createSignal<{ readonly canPaste: boolean }>();

  async function openXmlMenu(): Promise<void> {
    setXmlMenu({ canPaste: isPaletteXml((await readClipboardText()) ?? '') });
  }

  /** Adds the first palette of GodSVG palette XML, as GodSVG does, with a title made unique. */
  function addFromXml(text: string): void {
    const [palette] = palettesFromXml(text);
    setXmlMenu(undefined);

    if (palette) {
      props.setPalettes((palettes) => [...palettes, palette.title === '' ? palette : uniqueTitle(palette, palettes)]);
    }
  }

  return (
    <div class="grid gap-3" data-testid="settings-palettes">
      <For each={props.palettes}>
        {(palette, paletteIndex) => (
          <fieldset class="grid gap-1.5 rounded-md border border-[var(--soft-border)] p-2" data-testid={`palette-${paletteIndex()}`}>
            <div class="flex items-center gap-1.5">
              <input
                class="h-6 min-w-0 flex-1 rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 in-[.theme-light]:bg-[#f8fbff]"
                aria-label="Palette title"
                data-testid={`palette-title-${paletteIndex()}`}
                value={palette.title}
                onChange={(event) => updatePalette(paletteIndex(), (item) => ({ ...item, title: event.currentTarget.value }))}
              />
              <Show when={paletteWarnings(palette, props.palettes).length > 0}>
                <span
                  class="grid place-items-center text-[var(--warning)]"
                  title={paletteWarnings(palette, props.palettes).map((warning) => t(warning)).join('\n')}
                  data-testid={`palette-warning-${paletteIndex()}`}
                >
                  <WarningIcon {...decorativeIconProps} />
                </span>
              </Show>
              <PaletteMenu
                index={paletteIndex()}
                count={props.palettes.length}
                palette={palette}
                rename={() => document.querySelector<HTMLInputElement>(`[data-testid="palette-title-${paletteIndex()}"]`)?.select()}
                applyPreset={(preset) => updatePalette(paletteIndex(), (item) => ({ ...item, colors: palettePresets[preset].colors }))}
                move={(step) =>
                  props.setPalettes((palettes) => {
                    const next = [...palettes];
                    const [moved] = next.splice(paletteIndex(), 1);
                    return moved ? [...next.slice(0, paletteIndex() + step), moved, ...next.slice(paletteIndex() + step)] : palettes;
                  })
                }
                remove={() => props.setPalettes((palettes) => palettes.filter((_, index) => index !== paletteIndex()))}
              />
            </div>
            <For each={palette.colors}>
              {(color, colorIndex) => (
                <div class="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-1.5">
                  <PaletteSwatch value={color.value} change={(value) => updateColor(paletteIndex(), colorIndex(), { value })} />
                  <input
                    class="h-6 min-w-0 rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] in-[.theme-light]:bg-[#f8fbff]"
                    aria-label="Color value"
                    data-testid={`palette-color-value-${paletteIndex()}-${colorIndex()}`}
                    value={color.value}
                    onChange={(event) => {
                      if (colorToHex(event.currentTarget.value)) {
                        updateColor(paletteIndex(), colorIndex(), { value: event.currentTarget.value.trim() });
                      } else {
                        event.currentTarget.value = color.value;
                      }
                    }}
                  />
                  <input
                    class="h-6 min-w-0 rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 in-[.theme-light]:bg-[#f8fbff]"
                    aria-label="Color name"
                    data-testid={`palette-color-name-${paletteIndex()}-${colorIndex()}`}
                    value={color.name}
                    onChange={(event) => updateColor(paletteIndex(), colorIndex(), { name: event.currentTarget.value })}
                  />
                  <IconAction
                    label={t('Delete color')}
                    testId={`palette-color-delete-${paletteIndex()}-${colorIndex()}`}
                    onClick={() =>
                      updatePalette(paletteIndex(), (item) => ({
                        ...item,
                        colors: item.colors.filter((_, index) => index !== colorIndex())
                      }))
                    }
                  >
                    <DeleteIcon {...decorativeIconProps} />
                  </IconAction>
                </div>
              )}
            </For>
            <button
              type="button"
              class="flex h-6 cursor-pointer items-center justify-center gap-1 rounded border border-[var(--soft-border)] bg-[var(--panel-2)] text-[12px] hover:border-[var(--accent)]"
              data-testid={`palette-add-color-${paletteIndex()}`}
              onClick={() =>
                updatePalette(paletteIndex(), (item) => ({ ...item, colors: [...item.colors, { value: '#000', name: 'New color' }] }))
              }
            >
              <PlusIcon {...decorativeIconProps} /> Add color
            </button>
          </fieldset>
        )}
      </For>
      <div class="relative flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class={textButton}
          data-testid="palette-add-empty"
          onClick={() => props.setPalettes((palettes) => [...palettes, uniqueTitle(palettePresets.empty, palettes)])}
        >
          <PlusIcon {...decorativeIconProps} /> {t('New palette')}
        </button>
        <button type="button" class={textButton} data-testid="palette-add-xml" onClick={() => void openXmlMenu()}>
          <ImportIcon {...decorativeIconProps} /> {t('New palette from XML')}
        </button>
        <Show when={xmlMenu()}>
          {(menu) => (
            <XmlMenu
              canPaste={menu().canPaste}
              importFile={(text) => addFromXml(text)}
              paste={() => void readClipboardText().then((text) => addFromXml(text ?? ''))}
              close={() => setXmlMenu(undefined)}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

/** A color swatch that opens the color popup to edit the palette color. */
function PaletteSwatch(props: { readonly value: string; readonly change: (value: string) => void }) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  let button: HTMLButtonElement | undefined;

  return (
    <>
      <button
        ref={(element) => (button = element)}
        type="button"
        class="h-6 w-6 cursor-pointer rounded border border-[var(--soft-border)] hover:border-[var(--accent)]"
        style={{ background: colorToHex(props.value) ?? 'transparent' }}
        aria-label="Edit color"
        onClick={() => setAnchor(anchor() ? undefined : button)}
      />
      <Show when={anchor()}>
        {(element) => (
          <ColorPopup
            value={props.value}
            fallback={props.value}
            allowNone={false}
            allowCurrentColor={false}
            allowUrl={false}
            anchor={element()}
            onChange={props.change}
            onClose={() => setAnchor(undefined)}
          />
        )}
      </Show>
    </>
  );
}

const textButton =
  'flex h-6 cursor-pointer items-center gap-1 rounded border border-[var(--soft-border)] bg-[var(--panel-2)] px-2 text-[12px] hover:border-[var(--accent)]';

/** The clipboard's text, or `undefined` when it can't be read (no permission, no focus). */
async function readClipboardText(): Promise<string | undefined> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return undefined;
  }
}

/** GodSVG's palette menu: rename, apply a preset, move up or down, delete, and copy or save as XML. */
function PaletteMenu(props: {
  readonly index: number;
  readonly count: number;
  readonly palette: ColorPalette;
  readonly rename: () => void;
  readonly applyPreset: (preset: keyof typeof palettePresets) => void;
  readonly move: (step: -1 | 1) => void;
  readonly remove: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);
  const [presetsOpen, setPresetsOpen] = createSignal(false);
  let menu: HTMLDivElement | undefined;
  createDismissible({ open, container: () => menu, close: () => setOpen(false) });
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={(element) => (menu = element)} class="relative">
      <IconAction label={t('Edit')} testId={`palette-menu-${props.index}`} onClick={() => setOpen(!open())}>
        <SmallMoreIcon {...decorativeIconProps} />
      </IconAction>
      <Show when={open()}>
        <div
          class="popover absolute top-7 right-0 z-30 grid min-w-44 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
          data-testid={`palette-menu-popover-${props.index}`}
        >
          <MenuButton type="button" icon={RenameIcon} data-testid={`palette-rename-${props.index}`} onClick={() => run(props.rename)}>
            {t('Rename')}
          </MenuButton>
          <MenuButton type="button" icon={ImportIcon} data-testid={`palette-apply-preset-${props.index}`} onClick={() => setPresetsOpen(!presetsOpen())}>
            {t('Apply preset')}
          </MenuButton>
          <Show when={presetsOpen()}>
            <For each={Object.keys(palettePresets) as (keyof typeof palettePresets)[]}>
              {(preset) => (
                <MenuButton type="button" data-testid={`palette-preset-${props.index}-${preset}`} onClick={() => run(() => props.applyPreset(preset))}>
                  <span class="pl-4">{t(`${preset.charAt(0).toUpperCase()}${preset.slice(1)}`)}</span>
                </MenuButton>
              )}
            </For>
          </Show>
          <Show when={props.index > 0}>
            <MenuButton type="button" icon={MoveUpIcon} data-testid={`palette-move-up-${props.index}`} onClick={() => run(() => props.move(-1))}>
              {t('Move up')}
            </MenuButton>
          </Show>
          <Show when={props.index < props.count - 1}>
            <MenuButton type="button" icon={MoveDownIcon} data-testid={`palette-move-down-${props.index}`} onClick={() => run(() => props.move(1))}>
              {t('Move down')}
            </MenuButton>
          </Show>
          <MenuButton type="button" icon={DeleteIcon} data-testid={`palette-delete-${props.index}`} onClick={() => run(props.remove)}>
            {t('Delete')}
          </MenuButton>
          <MenuButton
            type="button"
            icon={CopyIcon}
            data-testid={`palette-copy-xml-${props.index}`}
            onClick={() => run(() => void navigator.clipboard.writeText(paletteToXml(props.palette)).catch(() => undefined))}
          >
            {t('Copy as XML')}
          </MenuButton>
          <MenuButton
            type="button"
            icon={ExportIcon}
            data-testid={`palette-save-xml-${props.index}`}
            onClick={() => run(() => downloadBlob(paletteToXml(props.palette), `${props.palette.title || 'palette'}.xml`, 'application/xml'))}
          >
            {t('Save as XML')}
          </MenuButton>
        </div>
      </Show>
    </div>
  );
}

/** GodSVG's "New palette from XML" options: import an XML file, or paste palette XML from the clipboard. */
function XmlMenu(props: {
  readonly canPaste: boolean;
  readonly importFile: (text: string) => void;
  readonly paste: () => void;
  readonly close: () => void;
}) {
  const { t } = useI18n();
  let menu: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  createDismissible({ open: () => true, container: () => menu, close: () => props.close() });

  return (
    <div
      ref={(element) => (menu = element)}
      class="popover absolute bottom-7 left-30 z-30 grid min-w-36 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
      data-testid="palette-xml-menu"
    >
      <input
        ref={(element) => (input = element)}
        type="file"
        accept=".xml,application/xml,text/xml"
        class="hidden"
        data-testid="palette-xml-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';

          if (file) {
            void file.text().then(props.importFile);
          }
        }}
      />
      <MenuButton type="button" icon={ImportIcon} data-testid="palette-import-xml" onClick={() => input?.click()}>
        {t('Import XML')}
      </MenuButton>
      <MenuButton type="button" icon={PasteIcon} disabled={!props.canPaste} data-testid="palette-paste-xml" onClick={props.paste}>
        {t('Paste XML')}
      </MenuButton>
    </div>
  );
}

function IconAction(props: { readonly label: string; readonly testId: string; readonly onClick: () => void; readonly children: JSX.Element }) {
  return (
    <button
      type="button"
      class="grid h-6 w-6 cursor-pointer place-items-center rounded border border-[var(--soft-border)] bg-[var(--panel-2)] hover:border-[var(--accent)]"
      title={props.label}
      aria-label={props.label}
      data-testid={props.testId}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}

/** Palette titles must be unique, as in GodSVG: a preset added twice gets a number. */
function uniqueTitle(preset: ColorPalette, palettes: readonly ColorPalette[]): ColorPalette {
  const taken = new Set(palettes.map((palette) => palette.title));
  let title = preset.title;

  for (let number = 2; taken.has(title); number += 1) {
    title = `${preset.title} ${number}`;
  }

  return { ...preset, title };
}
