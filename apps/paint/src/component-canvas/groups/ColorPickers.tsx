import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import type { JSX } from '@solidjs/web';
import { createSignal, For, untrack } from 'solid-js';
import { ColorPanel } from '../../features/color';
import {
  ColorWheel,
  gamutMasks,
  harmonies,
  type ColorWheelSettings,
  type GamutMask,
  type Harmony
} from '../../features/color-wheel';
import { CoolorusWheel, defaultCoolorusSettings, type CoolorusSettings } from '../../features/coolorus-wheel';
import { HueTriangle } from '../../features/hue-triangle';
import { ColorPanel as DesktopColorPanel } from '../../variants/desktop/ColorPanel';
import { ColorsPopover, type ColorMode } from '../../variants/procreate/ColorsPopover';
import { ColorCard } from '../../variants/puck/ColorCard';
import { ColorDisc } from '../../variants/zen/ColorDisc';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, PuckFrame, puckBoxes, ZenFrame } from '../frames';
import { ProcreateFrame } from '../ProcreateFrame';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';
import { TestStrip } from '../TestStrip';

/**
 * Color pickers: each picker alone and inside Studio's Color panel, both with test strips, then the OKLCH wheel's
 * gamut masks and harmonies, where strips would add nothing: those rows compare guides, not colors. Every specimen
 * keeps its own color and wheel settings, starting from the same ones, and nothing reaches Paint's own settings.
 */
export function ColorPickers() {
  return (
    <CanvasGroup
      id="color-pickers"
      title="Color pickers"
      omitted={
        <>
          Not here: the square alone (it is part of the Color panel); the panel's background color, hex field and
          recents (the same for every picker; the panel keeps its recents with Paint's on this address); a custom
          gamut mask (draw one on any wheel of the mask row). The Procreate disc lives inside its Colors popover, so
          it comes with it.
        </>
      }
    >
      <CanvasRow title="Picker alone" note="in the Color panel's width">
        <PickerSpecimen id="color-pickers/alone/triangle" label="Triangle">
          {(color, setColor) => <HueTriangle color={color()} onChange={setColor} onSettle={() => {}} />}
        </PickerSpecimen>
        <PickerSpecimen id="color-pickers/alone/oklch-wheel" label="OKLCH wheel">
          {(color, setColor) => <Wheel color={color()} onChange={setColor} />}
        </PickerSpecimen>
        <PickerSpecimen id="color-pickers/alone/coolorus" label="Coolorus (RYB, lightness lock)">
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
        <PickerSpecimen id="color-pickers/variants/zen-disc" label="Zen disc">
          {(color, setColor) => (
            <ZenFrame>
              <ColorDisc color={color()} onInput={setColor} onCommit={() => {}} />
            </ZenFrame>
          )}
        </PickerSpecimen>
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
  children: (color: () => string, setColor: (color: string) => void) => JSX.Element;
}) {
  const [color, setColor] = createSignal(startColor);

  return (
    <Specimen
      id={props.id}
      label={props.label}
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
    <Specimen id={props.id} label={props.label} below={<TestStrip brush={brush()} width={panelWidth} />}>
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

/** The Color panel's content width, which pickers fill in Studio. */
function PickerBox(props: { children: JSX.Element }) {
  return <div class={styles.pickerBox}>{props.children}</div>;
}

/** Paint's default brush at a test strip's size. */
function stripBrush(patch: Partial<Brush>): Brush {
  return { ...defaultBrush(), size: 12, ...patch, color: patch.color ?? startColor };
}

const startColor = '#c8553d';

const panelPickers = [
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'wheel', label: 'Wheel' },
  { id: 'coolorus', label: 'Coolorus' }
] as const;

/** The Desktop variant's dock width (`--dock-width`). */
const desktopDockWidth = 284;
/** The Procreate variant's Colors popover width. */
const procreateColorsWidth = 340;

/** Studio's panel: 284 px wide with 16 px padding. */
const panelWidth = 284;
const panelContentWidth = panelWidth - 32;
