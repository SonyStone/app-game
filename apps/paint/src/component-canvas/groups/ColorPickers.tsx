import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import type { Point } from '@app-game/paint-core/camera';
import { averageOpaque } from '@app-game/paint-core/colorSample';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, untrack } from 'solid-js';
import { ColorPanel, ColorPickerLoupe, type PickerPreview } from '../../features/color';
import {
  ColorWheel,
  gamutMasks,
  harmonies,
  type ColorWheelSettings,
  type GamutMask,
  type Harmony
} from '../../features/color-wheel';
import { mergeSimilar } from '../../features/color/mergeSimilar';
import { CoolorusWheel, defaultCoolorusSettings, type CoolorusSettings } from '../../features/coolorus-wheel';
import { HueTriangle } from '../../features/hue-triangle';
import { LightingOrb, type OrbChip, type OrbPoint } from '../../features/lighting-orb';
import { ColorPanel as DesktopColorPanel } from '../../variants/desktop/ColorPanel';
import { ColorPanel as InfiniteColorPanel } from '../../variants/infinite/ColorPanel';
import {
  defaultInfiniteColorSettings,
  type InfiniteColorSettings
} from '../../variants/infinite/createInfiniteColorSettings';
import { historyLimit, RecentColorsStrip } from '../../variants/infinite/RecentColorsStrip';
import { ColorsPopover, type ColorMode } from '../../variants/procreate/ColorsPopover';
import { ColorCard } from '../../variants/puck/ColorCard';
import { ColorDisc } from '../../variants/zen/ColorDisc';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, InfiniteFrame, puckBoxes, PuckFrame, ZenFrame } from '../frames';
import { ProcreateFrame } from '../ProcreateFrame';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';
import { TestStrip } from '../TestStrip';

/**
 * Color pickers: each picker alone and inside Studio's Color panel, both with test strips, the variants' pickers and
 * Infinite Painter's color panel, Lighting Orb and Recent Colors strip, then the OKLCH wheel's gamut masks and
 * harmonies, where strips would add nothing: those rows compare guides, not colors. Every specimen keeps its own color
 * and wheel settings, starting from the same ones, and nothing reaches Paint's own settings.
 */
export function ColorPickers() {
  return (
    <CanvasGroup
      id="color-pickers"
      title="Color pickers"
      omitted={
        <>
          Not here: the square alone (it is part of the Color panel); the panel's background color, hex field and
          recents (the same for every picker; the panel keeps its recents with Paint's on this address); a custom gamut
          mask (draw one on any wheel of the mask row). The Procreate disc lives inside its Colors popover, so it comes
          with it.
        </>
      }
    >
      <CanvasRow title="Picker alone" note="in the Color panel's width">
        <PickerSpecimen id="color-pickers/alone/triangle" label="Triangle" part="triangle">
          {(color, setColor) => <HueTriangle color={color()} onChange={setColor} onSettle={() => {}} />}
        </PickerSpecimen>
        <PickerSpecimen id="color-pickers/alone/oklch-wheel" label="OKLCH wheel" part="oklch-wheel">
          {(color, setColor) => <Wheel color={color()} onChange={setColor} />}
        </PickerSpecimen>
        <PickerSpecimen id="color-pickers/alone/coolorus" label="Coolorus (RYB, lightness lock)" part="coolorus">
          {(color, setColor) => <Coolorus color={color()} onChange={setColor} />}
        </PickerSpecimen>
        <ProcreateSpecimen />
      </CanvasRow>

      <CanvasRow title="In the Color panel" note="as Studio shows it; only the picker differs">
        <For each={panelPickers}>
          {(picker) => (
            <PanelSpecimen id={`color-pickers/panel/${picker.id}`} label={picker.label} picker={picker.id} />
          )}
        </For>
      </CanvasRow>

      <CanvasRow title="In the variants" note="each in its variant's frame">
        <PuckColorSpecimen />
        <DesktopColorSpecimen />
        <PickerSpecimen id="color-pickers/variants/zen-disc" label="Zen disc" part="zen-disc">
          {(color, setColor) => (
            <ZenFrame>
              <ColorDisc color={color()} onInput={setColor} onCommit={() => {}} />
            </ZenFrame>
          )}
        </PickerSpecimen>
      </CanvasRow>

      <CanvasRow title="Pick from canvas" note="press and drag on the drawing; releasing picks the color">
        <For each={loupes}>
          {(loupe) => (
            <LoupeSpecimen
              id={`color-pickers/pick/${loupe.id}`}
              label={loupe.label}
              size={loupe.size}
              placement={loupe.placement}
            />
          )}
        </For>
      </CanvasRow>

      <CanvasRow
        title="Infinite Painter"
        note="the color panel's four tabs, the Lighting Orb and the Recent Colors strip"
      >
        <InfinitePanelSpecimen
          id="color-pickers/infinite/wheel"
          label="Color panel: HSB wheel"
          settings={{ tab: 'wheel' }}
        />
        <InfinitePanelSpecimen
          id="color-pickers/infinite/wheel-tone-lock"
          label="Color panel: wheel with Tone Lock and Compare tone"
          settings={{ tab: 'wheel', toneLock: true, compareTone: true }}
        />
        <InfinitePanelSpecimen
          id="color-pickers/infinite/sliders"
          label="Color panel: color sliders"
          settings={{ tab: 'sliders' }}
        />
        <InfinitePanelSpecimen
          id="color-pickers/infinite/swatches"
          label="Color panel: swatch palettes"
          settings={{ tab: 'swatches' }}
        />
        <InfinitePanelSpecimen
          id="color-pickers/infinite/orb"
          label="Color panel: Lighting Orb"
          settings={{ tab: 'orb' }}
        />
        <OrbSpecimen id="color-pickers/infinite/orb-low" label="Lighting Orb, low contrast" contrast={0.2} />
        <OrbSpecimen id="color-pickers/infinite/orb-high" label="Lighting Orb, high contrast" contrast={0.9} />
        <StripSpecimen />
      </CanvasRow>

      <CanvasRow title="OKLCH wheel: gamut mask">
        <For each={Object.entries(gamutMasks) as [Exclude<GamutMask, 'custom'>, { label: string }][]}>
          {([mask, { label }]) => (
            <Specimen id={`color-pickers/wheel-mask/${mask}`} label={label}>
              <PickerBox>
                <Wheel color={startColor} settings={{ mask }} />
              </PickerBox>
            </Specimen>
          )}
        </For>
      </CanvasRow>

      <CanvasRow title="OKLCH wheel: harmony">
        <For each={Object.entries(harmonies) as [Harmony, { label: string }][]}>
          {([harmony, { label }]) => (
            <Specimen id={`color-pickers/wheel-harmony/${harmony}`} label={label}>
              <PickerBox>
                <Wheel color={startColor} settings={{ harmony }} />
              </PickerBox>
            </Specimen>
          )}
        </For>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** A picker in the Color panel's content width, with a test strip in its color. */
function PickerSpecimen(props: {
  id: string;
  label: string;
  /** The page part it is, for the page constructor. */
  part?: string;
  children: (color: () => string, setColor: (color: string) => void) => JSX.Element;
}) {
  const [color, setColor] = createSignal(startColor);

  return (
    <Specimen
      id={props.id}
      label={props.label}
      part={props.part}
      below={<TestStrip brush={stripBrush({ color: color() })} width={panelContentWidth} />}
    >
      <PickerBox>{props.children(color, setColor)}</PickerBox>
    </Specimen>
  );
}

/** Studio's Color panel showing `picker`, in Studio's panel frame, with a test strip in the edited color. */
function PanelSpecimen(props: { id: string; label: string; picker: (typeof panelPickers)[number]['id'] }) {
  const [brush, setBrush] = createSignal<Brush>(stripBrush({ backgroundColor: '#ffffff' }));
  const [picker, setPicker] = createSignal<string>(untrack(() => props.picker));

  return (
    <Specimen
      id={props.id}
      label={props.label}
      part="studio-color"
      below={<TestStrip brush={brush()} width={panelWidth} />}
    >
      <div class={styles.studioPanel}>
        <ColorPanel
          brush={brush()}
          onChange={(patch) => setBrush((current) => ({ ...current, ...patch }))}
          alternatives={{
            chosen: picker(),
            onChoose: setPicker,
            options: [
              {
                id: 'triangle',
                label: 'Triangle',
                render: (control) => (
                  <HueTriangle color={control.color} onChange={control.onChange} onSettle={control.onSettle} />
                )
              },
              {
                id: 'wheel',
                label: 'Wheel',
                render: (control) => (
                  <Wheel color={control.color} onChange={control.onChange} onSettle={control.onSettle} />
                )
              },
              {
                id: 'coolorus',
                label: 'Coolorus',
                render: (control) => (
                  <Coolorus color={control.color} onChange={control.onChange} onSettle={control.onSettle} />
                )
              }
            ]
          }}
        />
      </div>
    </Specimen>
  );
}

/**
 * The OKLCH wheel with settings of its own, starting from Paint's defaults overridden by `settings`. Without
 * `onChange` it keeps its color itself.
 */
function Wheel(props: {
  color: string;
  onChange?: (color: string) => void;
  onSettle?: () => void;
  settings?: Partial<Omit<ColorWheelSettings, 'picker'>>;
}) {
  const [own, setOwn] = createSignal(untrack(() => props.color));
  const [settings, setSettings] = createSignal<Omit<ColorWheelSettings, 'picker'>>({
    harmony: 'none',
    mask: 'none',
    maskAngle: 0,
    customMask: [],
    ...untrack(() => props.settings)
  });

  return (
    <ColorWheel
      color={props.onChange ? props.color : own()}
      onChange={(color) => (props.onChange ?? setOwn)(color)}
      onSettle={() => props.onSettle?.()}
      settings={settings()}
      onSettings={(patch) => setSettings((current) => ({ ...current, ...patch }))}
    />
  );
}

/** The Coolorus wheel with settings of its own, starting from its defaults. */
function Coolorus(props: { color: string; onChange: (color: string) => void; onSettle?: () => void }) {
  const [settings, setSettings] = createSignal<CoolorusSettings>(defaultCoolorusSettings);

  return (
    <CoolorusWheel
      color={props.color}
      onChange={props.onChange}
      onSettle={() => props.onSettle?.()}
      settings={settings()}
      onSettings={(patch) => setSettings((current) => ({ ...current, ...patch }))}
    />
  );
}

/**
 * The Procreate variant's Colors popover on its Disc, with a test strip in its color. Its recents are this specimen's
 * own; Mixing, which opens the drawing session's palette window, does nothing here.
 */
function ProcreateSpecimen() {
  const [color, setColor] = createSignal(startColor);
  const [secondary, setSecondary] = createSignal('#ffffff');
  const [recent, setRecent] = createSignal<readonly string[]>([]);
  const [mode, setMode] = createSignal<ColorMode>('disc');

  return (
    <Specimen
      id="color-pickers/alone/procreate-disc"
      label="Procreate disc (in its Colors popover)"
      part="procreate-colors"
      below={<TestStrip brush={stripBrush({ color: color() })} width={procreateColorsWidth + 40} />}
    >
      <ProcreateFrame width={procreateColorsWidth} label="Colors">
        <ColorsPopover
          color={color()}
          secondary={secondary()}
          recent={recent()}
          mode={mode()}
          onMode={setMode}
          onInput={setColor}
          onCommit={(chosen) => setRecent((list) => [chosen, ...list.filter((entry) => entry !== chosen)].slice(0, 10))}
          onSwap={() => {
            const current = color();
            setColor(secondary());
            setSecondary(current);
          }}
          mixing={false}
          onMixing={() => {}}
        />
      </ProcreateFrame>
    </Specimen>
  );
}

/**
 * The Puck variant's Color card, with a test strip in its color. Mix, which opens the drawing session's palette
 * window, does nothing here; the card keeps recent colors with Paint's on this address.
 */
function PuckColorSpecimen() {
  const [color, setColor] = createSignal(startColor);
  const [background, setBackground] = createSignal('#ffffff');

  return (
    <Specimen
      id="color-pickers/variants/puck-card"
      label="Puck color card"
      part="puck-color"
      below={<TestStrip brush={stripBrush({ color: color() })} width={puckBoxes.color.width + 32} />}
    >
      <PuckFrame boxes={[puckBoxes.color]}>
        <ColorCard
          box={puckBoxes.color}
          color={color()}
          background={background()}
          onColor={setColor}
          onSwap={() => {
            const current = color();
            setColor(background());
            setBackground(current);
          }}
          mixing={false}
          onMixing={() => {}}
          done={() => {}}
        />
      </PuckFrame>
    </Specimen>
  );
}

/** The Desktop variant's Color panel, as wide as its dock, with a test strip in the foreground color. */
function DesktopColorSpecimen() {
  const [colors, setColors] = createSignal({ color: startColor, backgroundColor: '#ffffff' });
  const [target, setTarget] = createSignal<'color' | 'backgroundColor'>('color');

  return (
    <Specimen
      id="color-pickers/variants/desktop-panel"
      label="Desktop color panel"
      part="desktop-color"
      below={<TestStrip brush={stripBrush({ color: colors().color })} width={desktopDockWidth} />}
    >
      <DesktopFrame width={desktopDockWidth}>
        <DesktopColorPanel
          foreground={colors().color}
          background={colors().backgroundColor}
          target={target()}
          onTarget={setTarget}
          onChange={(patch) => setColors((current) => ({ ...current, ...patch }))}
        />
      </DesktopFrame>
    </Specimen>
  );
}

/**
 * The canvas color picker's loupe over a small drawing of its own, at `size` and `placement` (see
 * `ColorPickerLoupe`). It always shows a pick: pressing moves it with the pointer, releasing makes the color under it
 * the current one, and a cancelled press leaves the current color as it was.
 */
function LoupeSpecimen(props: Omit<Parameters<typeof ColorPickerLoupe>[0], 'preview'> & { id: string; label: string }) {
  const drawing = paintDrawing();
  const [point, setPoint] = createSignal<Point>(loupeStart);
  const [current, setCurrent] = createSignal('#e8806e');
  const [pressed, setPressed] = createSignal(false);
  const preview = createMemo((): PickerPreview => ({
    point: point(),
    current: current(),
    size: 1,
    loupeSide,
    ...sampleDrawing(drawing, point())
  }));

  return (
    <Specimen id={props.id} label={props.label}>
      <div
        class={styles.pickArea}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setPressed(true);
          setPoint(areaPoint(event));
        }}
        onPointerMove={(event) => {
          if (pressed()) {
            setPoint(areaPoint(event));
          }
        }}
        onPointerUp={() => {
          setPressed(false);
          setCurrent(preview().color ?? current());
        }}
        onPointerCancel={() => setPressed(false)}
      >
        {drawing}
        <ColorPickerLoupe preview={preview()} size={props.size} placement={props.placement} />
      </div>
    </Specimen>
  );
}

/** A pointer's point in CSS pixels of the pick area, inside it, wherever the canvas camera zooms. */
function areaPoint(event: PointerEvent & { currentTarget: HTMLElement }): Point {
  const area = event.currentTarget;
  const bounds = area.getBoundingClientRect();
  const scale = area.offsetWidth / bounds.width;

  return {
    x: Math.min(Math.max((event.clientX - bounds.left) * scale, 0), pickAreaSize.width - 1),
    y: Math.min(Math.max((event.clientY - bounds.top) * scale, 0), pickAreaSize.height - 1)
  };
}

/** Soft strokes on paper at the screen's resolution, like a corner of a painting, for the loupe to magnify. */
function paintDrawing(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pickAreaSize.width * devicePixelRatio);
  canvas.height = Math.round(pickAreaSize.height * devicePixelRatio);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return canvas;
  }

  context.scale(devicePixelRatio, devicePixelRatio);
  context.fillStyle = '#f6f4ef';
  context.fillRect(0, 0, pickAreaSize.width, pickAreaSize.height);
  context.filter = 'blur(4px)';
  context.lineCap = 'round';
  const stroke = (color: string, width: number, path: (context: CanvasRenderingContext2D) => void) => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    path(context);
    context.stroke();
  };
  stroke('#c0532b', 40, (path) => {
    path.moveTo(-20, 110);
    path.quadraticCurveTo(170, 360, 360, 140);
  });
  stroke('#c0532b', 16, (path) => path.arc(275, 70, 30, Math.PI * 0.9, Math.PI * 2.6));
  stroke('#2f4b6e', 24, (path) => {
    path.moveTo(20, 290);
    path.lineTo(80, 200);
  });

  return canvas;
}

/** The color under `point` and the view around it, as the canvas picker's live samples give them. */
function sampleDrawing(drawing: HTMLCanvasElement, point: Point): Pick<PickerPreview, 'color' | 'loupe'> {
  const context = drawing.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return { color: undefined };
  }

  const scale = drawing.width / pickAreaSize.width;
  const side = Math.round(loupeSide * scale);
  const x = Math.floor(point.x * scale),
    y = Math.floor(point.y * scale);
  const left = Math.min(Math.max(x - Math.floor(side / 2), 0), drawing.width - side);
  const top = Math.min(Math.max(y - Math.floor(side / 2), 0), drawing.height - side);

  return {
    color: averageOpaque(context.getImageData(x, y, 1, 1).data),
    loupe: { side, pixels: context.getImageData(left, top, side, side).data }
  };
}

/**
 * The Infinite Painter variant's color panel with `settings` over the defaults, in its frame, with a test strip in its
 * color. It keeps its own color, history and settings; a commit makes the color before it the previous one, so a tap
 * on the previous color swaps the two. The eyedropper does nothing here.
 */
function InfinitePanelSpecimen(props: { id: string; label: string; settings: Partial<InfiniteColorSettings> }) {
  const [color, setColor] = createSignal(startColor);
  const [committed, setCommitted] = createSignal(startColor);
  const [previous, setPrevious] = createSignal('#3d6a8c');
  const [recent, setRecent] = createSignal<readonly string[]>(infiniteRecent);
  const [settings, setSettings] = createSignal<InfiniteColorSettings>({
    ...defaultInfiniteColorSettings,
    ...untrack(() => props.settings)
  });

  return (
    <Specimen
      id={props.id}
      label={props.label}
      below={<TestStrip brush={stripBrush({ color: color() })} width={infinitePanelWidth + 40} />}
    >
      <InfiniteFrame>
        <InfiniteColorPanel
          color={color()}
          previous={previous()}
          recent={recent()}
          settings={settings()}
          onSettings={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          onInput={setColor}
          onCommit={(chosen) => {
            setColor(chosen);
            if (chosen !== committed()) {
              setPrevious(committed());
              setCommitted(chosen);
            }

            setRecent((list) => mergeSimilar(list, chosen).slice(0, historyLimit));
          }}
          onEyedropper={() => {}}
        />
      </InfiniteFrame>
    </Specimen>
  );
}

/** The Lighting Orb alone, with its chips, at `contrast`; a pick shows in the test strip. */
function OrbSpecimen(props: { id: string; label: string; contrast: number }) {
  const [color, setColor] = createSignal(defaultInfiniteColorSettings.orb.base);
  const [picker, setPicker] = createSignal<OrbPoint>(defaultInfiniteColorSettings.orb.picker);
  const [selected, setSelected] = createSignal<OrbChip>(defaultInfiniteColorSettings.orb.selected);

  return (
    <Specimen
      id={props.id}
      label={props.label}
      below={<TestStrip brush={stripBrush({ color: color() })} width={260} />}
    >
      <InfiniteFrame width={260}>
        <LightingOrb
          lights={{ ...defaultInfiniteColorSettings.orb, contrast: props.contrast }}
          picker={picker()}
          selected={selected()}
          onSelect={setSelected}
          onPicker={setPicker}
          onInput={setColor}
          onCommit={setColor}
        />
      </InfiniteFrame>
    </Specimen>
  );
}

/** The Recent Colors strip at the main toolbar's height, holding a history; a pick shows in the test strip. */
function StripSpecimen() {
  const [color, setColor] = createSignal(infiniteRecent[0]!);

  return (
    <Specimen
      id="color-pickers/infinite/recent-strip"
      label="Recent Colors strip (drag along it)"
      below={<TestStrip brush={stripBrush({ color: color() })} width={180} />}
    >
      <InfiniteFrame width={180} height={340}>
        <RecentColorsStrip colors={infiniteRecent} height={300} onPick={setColor} />
      </InfiniteFrame>
    </Specimen>
  );
}

/** The Color panel's content width, which pickers fill in Studio. */
function PickerBox(props: { children: JSX.Element }) {
  return <div class={styles.pickerBox}>{props.children}</div>;
}

/** Paint's default brush at a test strip's size. */
function stripBrush(patch: Partial<Brush>): Brush {
  return { ...defaultBrush(), size: 12, ...patch, color: patch.color ?? startColor };
}

const startColor = '#c8553d';

/** A history for the Infinite Painter specimens, newest first: greens and earth tones, as in the manual. */
const infiniteRecent = [
  '#c8553d',
  '#9a9a9a',
  '#1f4a2c',
  '#5b8a55',
  '#173326',
  '#e7e2cf',
  '#7e9a6a',
  '#a9b99a',
  '#6a4512',
  '#3b2d0c'
];

/** The Infinite Painter variant's color panel width. */
const infinitePanelWidth = 300;

const panelPickers = [
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'wheel', label: 'Wheel' },
  { id: 'coolorus', label: 'Coolorus' }
] as const;

/** The loupe's variants: the one Paint shows, a larger one, and both above the point for a finger. */
const loupes = [
  { id: 'center', label: 'Centered (as in Paint)', size: 120, placement: 'center' },
  { id: 'center-large', label: 'Centered, larger', size: 180, placement: 'center' },
  { id: 'above', label: 'Above the finger', size: 120, placement: 'above' },
  { id: 'above-large', label: 'Above the finger, larger', size: 180, placement: 'above' }
] as const;

/** The pick area's size in CSS pixels; keep it in step with the stylesheet's `.pickArea`. */
const pickAreaSize = { width: 340, height: 300 };
/** Where the loupe starts: on the large stroke's upper edge, low enough for a large ring to fit above it. */
const loupeStart: Point = { x: 170, y: 224 };
/** CSS pixels per side of the magnified view, as in the canvas picker. */
const loupeSide = 11;

/** The Desktop variant's dock width (`--dock-width`). */
const desktopDockWidth = 284;
/** The Procreate variant's Colors popover width. */
const procreateColorsWidth = 340;

/** Studio's panel: 284 px wide with 16 px padding. */
const panelWidth = 284;
const panelContentWidth = panelWidth - 32;
