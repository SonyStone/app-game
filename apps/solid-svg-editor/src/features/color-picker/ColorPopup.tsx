import { Portal, type JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Show, untrack } from 'solid-js';

import { colorToHex, hexToRgb, hslToRgb, hsvToRgb, rgbToHex, rgbToHsl, rgbToHsv, type Hsv } from '../../editor/colors';
import { decorativeIconProps } from '../../editor/svg-icon';
import ConfigIcon from '../../icons/Config.svg';
import EyedropperIcon from '../../icons/Eyedropper.svg';
import GoBackIcon from '../../icons/GoBack.svg';
import NoneColorIcon from '../../icons/NoneColor.svg';
import { createDismissible } from '../ui/createDismissible';
import { useColorSources } from './color-sources';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * GodSVG's color popup, opened from a color field. The picker page edits the color in RGB, HSV, or HSL with a
 * saturation/value square, a hue bar, channel sliders, a hex field, and the browser eyedropper where available; the
 * utilities page lists `none`, `currentColor`, the document's gradients, and the user's palettes with search.
 *
 * Every change is reported through `onChange` right away; the caller groups a popup session into one undo step. A
 * press outside the popup (other than on `anchor`) or Escape calls `onClose`.
 */
export function ColorPopup(props: {
  /** The attribute's current value, `''` when unset. */
  readonly value: string;
  /** The color the element renders when the attribute is unset, used as the starting color. */
  readonly fallback: string;
  readonly allowNone: boolean;
  readonly allowCurrentColor: boolean;
  readonly allowUrl: boolean;
  /** The element that opened the popup; the popup is placed below it (or above when there is no room). */
  readonly anchor: HTMLElement;
  readonly onChange: (value: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  let popup: HTMLDivElement | undefined;
  createDismissible({ open: () => true, container: () => popup, alsoInside: () => props.anchor, close: () => props.onClose() });

  const startValue = untrack(() => props.value);
  const [page, setPage] = createSignal(lastPage);
  const [paint, setPaint] = createSignal(untrack(() => props.value || props.fallback));
  const [hsv, setHsv] = createSignal(hsvOf(untrack(paint)) ?? { h: 0, s: 0, v: 0 });
  const position = popupPosition(untrack(() => props.anchor.getBoundingClientRect()));

  /** Applies a paint picked from a keyword, swatch, hex field, or reset; colors also move the picker. */
  function pickPaint(value: string): void {
    const next = hsvOf(value);

    if (next) {
      setHsv((current) => (next.s === 0 || next.v === 0 ? { ...next, h: current.h } : next));
    }

    setPaint(value);
    props.onChange(value);
  }

  /** Applies a color edited in the picker, keeping the hue of grays so the hue bar does not jump. */
  function pickHsv(next: Hsv): void {
    setHsv(next);
    const hex = rgbToHex(hsvToRgb(next));
    setPaint(hex);
    props.onChange(hex);
  }

  // Mount inside the app root, where the theme's CSS variables are defined; escaping the inspector avoids clipping.
  const mount = untrack(() => props.anchor.closest('.app-root') ?? document.body);

  return (
    <Portal mount={mount}>
      <div
        ref={(element) => (popup = element)}
        class="fixed z-200 grid w-60 gap-2 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-2 text-[var(--text)] shadow-[0_12px_28px_#0008]"
        style={{ left: `${position.left}px`, top: `${position.top}px` }}
        role="dialog"
        aria-label="Color picker"
        data-testid="color-popup"
      >
        <Show
          when={page() === 'picker'}
          fallback={
            <ColorUtilities
              paint={paint()}
              allowNone={props.allowNone}
              allowCurrentColor={props.allowCurrentColor}
              allowUrl={props.allowUrl}
              pick={pickPaint}
            />
          }
        >
          <ColorPickerPage
            hsv={hsv()}
            paint={paint()}
            startValue={startValue}
            allowNone={props.allowNone}
            allowCurrentColor={props.allowCurrentColor}
            pickHsv={pickHsv}
            pickPaint={pickPaint}
          />
        </Show>
        <button
          type="button"
          class="flex h-6 cursor-pointer items-center justify-center gap-1.5 rounded border border-[var(--soft-border)] bg-[var(--panel-2)] text-[11px] hover:border-[var(--accent)]"
          data-testid="color-popup-switch-page"
          onClick={() => {
            lastPage = page() === 'picker' ? 'utilities' : 'picker';
            setPage(lastPage);
          }}
        >
          <Show when={page() === 'picker'} fallback={<GoBackIcon {...decorativeIconProps} />}>
            <ConfigIcon {...decorativeIconProps} />
          </Show>
          {page() === 'picker' ? t('Color utilities') : t('Back to color picker')}
        </button>
      </div>
    </Portal>
  );
}

/** The page shown last, kept for the next popup like GodSVG does. */
let lastPage: 'picker' | 'utilities' = 'picker';

/** The color model of the channel sliders, kept for the next popup. */
let lastModel: ColorModel = 'rgb';

type ColorModel = 'rgb' | 'hsv' | 'hsl';

function hsvOf(paint: string): Hsv | undefined {
  const rgb = hexToRgb(colorToHex(paint) ?? '');
  return rgb ? rgbToHsv(rgb) : undefined;
}

const popupWidth = 240;
const popupHeight = 360;

function popupPosition(anchor: DOMRect): { readonly left: number; readonly top: number } {
  const left = Math.min(Math.max(4, anchor.left), window.innerWidth - popupWidth - 4);
  const below = anchor.bottom + 4;
  const top = below + popupHeight > window.innerHeight ? Math.max(4, anchor.top - popupHeight - 4) : below;
  return { left, top };
}

function ColorPickerPage(props: {
  readonly hsv: Hsv;
  readonly paint: string;
  readonly startValue: string;
  readonly allowNone: boolean;
  readonly allowCurrentColor: boolean;
  readonly pickHsv: (hsv: Hsv) => void;
  readonly pickPaint: (paint: string) => void;
}) {
  const { t } = useI18n();
  const [model, setModel] = createSignal(lastModel);
  const hex = createMemo(() => rgbToHex(hsvToRgb(props.hsv)));
  const isColor = () => colorToHex(props.paint) !== undefined;
  const eyeDropper = (globalThis as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;

  return (
    <div class="grid gap-2" data-testid="color-picker-page">
      <SaturationValueArea hsv={props.hsv} pick={props.pickHsv} />
      <HueBar hsv={props.hsv} pick={props.pickHsv} />
      <div class="flex gap-1" role="tablist" aria-label={t('Color models')}>
        <For each={['rgb', 'hsv', 'hsl'] as const}>
          {(item) => (
            <button
              type="button"
              role="tab"
              aria-selected={model() === item ? 'true' : 'false'}
              class={[
                'h-5.5 flex-1 cursor-pointer rounded border border-[var(--soft-border)] bg-[var(--panel-2)] text-[11px] uppercase',
                { 'border-[var(--accent)]': model() === item }
              ]}
              data-testid={`color-model-${item}`}
              onClick={() => {
                lastModel = item;
                setModel(item);
              }}
            >
              {item}
            </button>
          )}
        </For>
      </div>
      <ChannelSliders model={model()} hsv={props.hsv} pick={props.pickHsv} />
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="h-6 w-6 shrink-0 cursor-pointer rounded border border-[var(--soft-border)]"
          style={{ background: swatchBackground(props.startValue) }}
          title={`Reset to the starting color (${props.startValue || 'unset'})`}
          data-testid="color-popup-reset"
          disabled={props.paint === props.startValue}
          onClick={() => props.pickPaint(props.startValue)}
        />
        <input
          class="h-6 min-w-0 flex-1 rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] in-[.theme-light]:bg-[#f8fbff]"
          aria-label="Hex color"
          data-testid="color-popup-hex"
          value={isColor() ? hex() : props.paint}
          onChange={(event) => {
            const next = colorToHex(event.currentTarget.value);

            if (next) {
              props.pickPaint(next);
            } else {
              event.currentTarget.value = isColor() ? hex() : props.paint;
            }
          }}
        />
        <Show when={eyeDropper}>
          {(EyeDropper) => (
            <PopupIconButton
              label="Pick a color from the screen"
              testId="color-popup-eyedropper"
              onClick={() => {
                void new (EyeDropper())()
                  .open()
                  .then((result) => props.pickPaint(result.sRGBHex))
                  .catch(() => undefined);
              }}
            >
              <EyedropperIcon {...decorativeIconProps} />
            </PopupIconButton>
          )}
        </Show>
        <Show when={props.allowNone}>
          <PopupIconButton label="No color (none)" testId="color-popup-none" active={props.paint === 'none'} onClick={() => props.pickPaint('none')}>
            <NoneColorIcon {...decorativeIconProps} />
          </PopupIconButton>
        </Show>
        <Show when={props.allowCurrentColor}>
          <PopupIconButton
            label="Inherit the color attribute (currentColor)"
            testId="color-popup-current-color"
            active={props.paint === 'currentColor'}
            onClick={() => props.pickPaint('currentColor')}
          >
            <span class="text-[10px] font-semibold">cC</span>
          </PopupIconButton>
        </Show>
      </div>
    </div>
  );
}

/** Saturation (x) and value (y) for the current hue, GodSVG's "SV square". */
function SaturationValueArea(props: { readonly hsv: Hsv; readonly pick: (hsv: Hsv) => void }) {
  const pickAt = (element: HTMLElement, event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    props.pick({ h: props.hsv.h, s: clamp01((event.clientX - rect.left) / rect.width), v: clamp01(1 - (event.clientY - rect.top) / rect.height) });
  };

  return (
    <div
      class="relative h-32 cursor-crosshair touch-none rounded"
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${props.hsv.h} 100% 50%))` }}
      role="slider"
      aria-label="Saturation and value"
      aria-valuetext={`saturation ${Math.round(props.hsv.s * 100)}%, value ${Math.round(props.hsv.v * 100)}%`}
      data-testid="color-popup-sv"
      {...dragHandlers(pickAt)}
    >
      <div
        class="pointer-events-none absolute h-3 w-3 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#000a]"
        style={{ left: `${props.hsv.s * 100}%`, top: `${(1 - props.hsv.v) * 100}%` }}
      />
    </div>
  );
}

function HueBar(props: { readonly hsv: Hsv; readonly pick: (hsv: Hsv) => void }) {
  return (
    <Track
      label="Hue"
      testId="color-popup-hue"
      background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
      ratio={props.hsv.h / 360}
      pick={(ratio) => props.pick({ ...props.hsv, h: ratio * 360 })}
    />
  );
}

/** Three channel sliders with number fields in the chosen model; tracks show the color along each channel. */
function ChannelSliders(props: { readonly model: ColorModel; readonly hsv: Hsv; readonly pick: (hsv: Hsv) => void }) {
  const channels = createMemo(() => channelsFor(props.model, props.hsv));

  return (
    <div class="grid gap-1" data-testid="color-popup-channels">
      <For each={channels()} keyed={false}>
        {(channel) => (
          <div class="grid grid-cols-[14px_minmax(0,1fr)_40px] items-center gap-1.5">
            <span class="text-[11px] text-[var(--muted)] uppercase">{channel().letter}</span>
            <Track
              label={channel().letter}
              testId={`color-popup-channel-${channel().letter}`}
              background={channel().track}
              ratio={channel().value / channel().max}
              pick={(ratio) => props.pick(channel().apply(ratio * channel().max))}
            />
            <input
              class="h-5.5 min-w-0 rounded border border-[var(--soft-border)] bg-[#080b12] px-1 text-right font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] in-[.theme-light]:bg-[#f8fbff]"
              inputmode="numeric"
              aria-label={`${channel().letter} value`}
              data-testid={`color-popup-channel-input-${channel().letter}`}
              value={Math.round(channel().value)}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);

                if (Number.isFinite(value)) {
                  props.pick(channel().apply(Math.min(channel().max, Math.max(0, value))));
                } else {
                  event.currentTarget.value = String(Math.round(channel().value));
                }
              }}
            />
          </div>
        )}
      </For>
    </div>
  );
}

type Channel = {
  readonly letter: string;
  readonly value: number;
  readonly max: number;
  readonly track: string;
  readonly apply: (value: number) => Hsv;
};

function channelsFor(model: ColorModel, hsv: Hsv): readonly Channel[] {
  const keepHue = (next: Hsv) => (next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next);

  if (model === 'hsv') {
    const at = (change: Partial<Hsv>) => rgbToHex(hsvToRgb({ ...hsv, ...change }));
    return [
      { letter: 'h', value: hsv.h, max: 360, track: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)', apply: (h) => ({ ...hsv, h }) },
      { letter: 's', value: hsv.s * 100, max: 100, track: `linear-gradient(to right, ${at({ s: 0 })}, ${at({ s: 1 })})`, apply: (s) => ({ ...hsv, s: s / 100 }) },
      { letter: 'v', value: hsv.v * 100, max: 100, track: `linear-gradient(to right, ${at({ v: 0 })}, ${at({ v: 1 })})`, apply: (v) => ({ ...hsv, v: v / 100 }) }
    ];
  }

  const rgb = hsvToRgb(hsv);

  if (model === 'hsl') {
    const hsl = { ...rgbToHsl(rgb), h: hsv.h };
    const at = (change: Partial<typeof hsl>) => rgbToHex(hslToRgb({ ...hsl, ...change }));
    const fromHsl = (change: Partial<typeof hsl>) => keepHue(rgbToHsv(hslToRgb({ ...hsl, ...change })));
    return [
      { letter: 'h', value: hsl.h, max: 360, track: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)', apply: (h) => ({ ...fromHsl({ h }), h }) },
      { letter: 's', value: hsl.s * 100, max: 100, track: `linear-gradient(to right, ${at({ s: 0 })}, ${at({ s: 1 })})`, apply: (s) => fromHsl({ s: s / 100 }) },
      { letter: 'l', value: hsl.l * 100, max: 100, track: `linear-gradient(to right, #000, ${at({ l: 0.5 })}, #fff)`, apply: (l) => fromHsl({ l: l / 100 }) }
    ];
  }

  const at = (change: Partial<typeof rgb>) => rgbToHex({ ...rgb, ...change });
  const fromRgb = (change: Partial<typeof rgb>) => keepHue(rgbToHsv({ ...rgb, ...change }));
  return [
    { letter: 'r', value: rgb.r, max: 255, track: `linear-gradient(to right, ${at({ r: 0 })}, ${at({ r: 255 })})`, apply: (r) => fromRgb({ r }) },
    { letter: 'g', value: rgb.g, max: 255, track: `linear-gradient(to right, ${at({ g: 0 })}, ${at({ g: 255 })})`, apply: (g) => fromRgb({ g }) },
    { letter: 'b', value: rgb.b, max: 255, track: `linear-gradient(to right, ${at({ b: 0 })}, ${at({ b: 255 })})`, apply: (b) => fromRgb({ b }) }
  ];
}

/** A horizontal gradient track with a marker; drag to pick, arrow keys step by 1%. */
function Track(props: {
  readonly label: string;
  readonly testId: string;
  readonly background: string;
  readonly ratio: number;
  readonly pick: (ratio: number) => void;
}) {
  const pickAt = (element: HTMLElement, event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    props.pick(clamp01((event.clientX - rect.left) / rect.width));
  };

  return (
    <div
      class="relative h-3 cursor-ew-resize touch-none rounded-sm outline-none focus-visible:shadow-[0_0_0_1px_var(--accent)]"
      style={{ background: props.background }}
      role="slider"
      tabindex={0}
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.ratio * 100)}
      data-testid={props.testId}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.1 : 0.01;

        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          props.pick(clamp01(props.ratio + step));
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          props.pick(clamp01(props.ratio - step));
        }
      }}
      {...dragHandlers(pickAt)}
    >
      <div
        class="pointer-events-none absolute top-1/2 h-4 w-1.5 -translate-1/2 rounded-sm border border-white shadow-[0_0_0_1px_#000a]"
        style={{ left: `${clamp01(props.ratio) * 100}%` }}
      />
    </div>
  );
}

/** Pointer handlers that call `pickAt` on press and while dragging with the pointer captured. */
function dragHandlers(pickAt: (element: HTMLElement, event: PointerEvent) => void) {
  return {
    onPointerDown: (event: PointerEvent & { currentTarget: HTMLElement }) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pickAt(event.currentTarget, event);
    },
    onPointerMove: (event: PointerEvent & { currentTarget: HTMLElement }) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        pickAt(event.currentTarget, event);
      }
    }
  };
}

/** `none`, `currentColor`, the document's gradients, and the palettes, filtered by a name search. */
function ColorUtilities(props: {
  readonly paint: string;
  readonly allowNone: boolean;
  readonly allowCurrentColor: boolean;
  readonly allowUrl: boolean;
  readonly pick: (paint: string) => void;
}) {
  const { t } = useI18n();
  const sources = useColorSources();
  const [search, setSearch] = createSignal('');
  const reserved = createMemo(() => [
    ...(props.allowNone ? [{ value: 'none', name: 'No color', background: swatchBackground('none') }] : []),
    ...(props.allowCurrentColor ? [{ value: 'currentColor', name: 'Current color', background: 'currentColor' }] : []),
    ...(props.allowUrl
      ? sources.gradients().map((gradient) => ({
          value: `url(#${gradient.id})`,
          name: `${gradient.kind === 'linear' ? 'Linear' : 'Radial'} gradient #${gradient.id}`,
          background: gradient.preview
        }))
      : [])
  ]);
  const palettes = createMemo(() =>
    sources
      .palettes()
      .map((palette) => ({ ...palette, colors: palette.colors.filter((color) => isSubsequence(search(), color.name)) }))
      .filter((palette) => palette.colors.length > 0)
  );

  return (
    <div class="grid max-h-80 gap-2 overflow-auto" data-testid="color-utilities-page">
      <input
        class="h-6 rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 text-[12px] in-[.theme-light]:bg-[#f8fbff]"
        placeholder={t('Search color')}
        aria-label={t('Search color')}
        data-testid="color-utilities-search"
        value={search()}
        onInput={(event) => setSearch(event.currentTarget.value)}
      />
      <Show when={reserved().length > 0}>
        <SwatchGrid colors={reserved()} paint={props.paint} pick={props.pick} />
      </Show>
      <For each={palettes()}>
        {(palette) => (
          <div class="grid gap-1">
            <div class="truncate text-center text-[11px] text-[var(--muted)]">{palette.title}</div>
            <SwatchGrid
              colors={palette.colors.map((color) => ({ ...color, background: swatchBackground(color.value) }))}
              paint={props.paint}
              pick={props.pick}
            />
          </div>
        )}
      </For>
    </div>
  );
}

function SwatchGrid(props: {
  readonly colors: readonly { readonly value: string; readonly name: string; readonly background: string }[];
  readonly paint: string;
  readonly pick: (paint: string) => void;
}) {
  return (
    <div class="flex flex-wrap gap-1">
      <For each={props.colors}>
        {(color) => (
          <button
            type="button"
            class={[
              'h-6 w-6 cursor-pointer rounded border border-[var(--soft-border)] hover:border-[var(--accent)]',
              { 'shadow-[0_0_0_2px_var(--accent)]': sameColor(color.value, props.paint) }
            ]}
            style={{ background: color.background }}
            title={`${color.name} (${color.value})`}
            aria-label={color.name}
            data-testid={`color-swatch-${color.value}`}
            onClick={() => props.pick(color.value)}
          />
        )}
      </For>
    </div>
  );
}

function PopupIconButton(props: {
  readonly label: string;
  readonly testId: string;
  readonly active?: boolean;
  readonly onClick: () => void;
  readonly children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class={[
        'grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded border border-[var(--soft-border)] bg-[var(--panel-2)] hover:border-[var(--accent)]',
        { 'border-[var(--accent)]': props.active === true }
      ]}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active === true ? 'true' : 'false'}
      data-testid={props.testId}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}

/** CSS background for a paint: its color, or a checkerboard for `none` and other non-colors. */
function swatchBackground(paint: string): string {
  const hex = colorToHex(paint);
  return hex ?? 'repeating-conic-gradient(#8b93a7 0 25%, #303747 0 50%) 0 0 / 8px 8px';
}

function sameColor(a: string, b: string): boolean {
  return a === b || (colorToHex(a) !== undefined && colorToHex(a) === colorToHex(b));
}

/** Case-insensitive subsequence match, GodSVG's color search. */
function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  const lower = haystack.toLowerCase();

  for (const char of needle.toLowerCase()) {
    index = lower.indexOf(char, index) + 1;

    if (index === 0) {
      return false;
    }
  }

  return true;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
