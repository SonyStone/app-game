import type { JSX } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';

import { colorToHex } from '../../editor/colors';
import { palettePresets, type ColorPalette } from '../../editor/palettes';
import { decorativeIconProps } from '../../editor/svg-icon';
import DeleteIcon from '../ui/icons/Delete.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import { ColorPopup } from './ColorPopup';

/**
 * The Palettes settings page, like GodSVG's: rename palettes, edit, add, or remove their named colors, remove
 * palettes, and add new ones from the Empty, Pure, or Grayscale presets.
 */
export function PaletteSettings(props: {
  readonly palettes: readonly ColorPalette[];
  readonly setPalettes: (update: (palettes: readonly ColorPalette[]) => readonly ColorPalette[]) => void;
}) {
  const updatePalette = (index: number, update: (palette: ColorPalette) => ColorPalette) =>
    props.setPalettes((palettes) => palettes.map((palette, itemIndex) => (itemIndex === index ? update(palette) : palette)));
  const updateColor = (paletteIndex: number, colorIndex: number, change: Partial<ColorPalette['colors'][number]>) =>
    updatePalette(paletteIndex, (palette) => ({
      ...palette,
      colors: palette.colors.map((color, itemIndex) => (itemIndex === colorIndex ? { ...color, ...change } : color))
    }));

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
              <IconAction
                label="Delete palette"
                testId={`palette-delete-${paletteIndex()}`}
                onClick={() => props.setPalettes((palettes) => palettes.filter((_, index) => index !== paletteIndex()))}
              >
                <DeleteIcon {...decorativeIconProps} />
              </IconAction>
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
                    label="Delete color"
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
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[12px] text-[var(--muted)]">Add palette:</span>
        <For each={Object.entries(palettePresets)}>
          {([key, preset]) => (
            <button
              type="button"
              class="h-6 cursor-pointer rounded border border-[var(--soft-border)] bg-[var(--panel-2)] px-2 text-[12px] capitalize hover:border-[var(--accent)]"
              data-testid={`palette-add-${key}`}
              onClick={() => props.setPalettes((palettes) => [...palettes, uniqueTitle(preset, palettes)])}
            >
              {key}
            </button>
          )}
        </For>
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
