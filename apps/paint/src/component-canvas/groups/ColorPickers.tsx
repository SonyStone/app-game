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
import { HueTriangle } from '../../features/hue-triangle';
import styles from '../ComponentCanvas.module.css';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';
import { TestStrip } from '../TestStrip';

/**
 * Color pickers (spec 7.1): each picker alone and inside Studio's Color panel, both with test strips, then the OKLCH
 * wheel's gamut masks and harmonies. Every specimen keeps its own color and wheel settings, starting from the same
 * ones, and nothing reaches Paint's own settings.
 */
export function ColorPickers() {
  return (
    <CanvasGroup
      id="color-pickers"
      title="Color pickers"
      omitted={
        <>
          Not here: the square alone (it is part of the Color panel); the panel's background color, hex field and
          recents (the same for every picker); a custom gamut mask (draw one on any wheel of the mask row). The
          Procreate disc arrives with the UI variants; the Coolorus-style wheel waits for a decision in the spec.
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
      </CanvasRow>

      <CanvasRow title="In the Color panel" note="as Studio shows it; only the picker differs">
        <For each={panelPickers}>
          {(picker) => (
            <PanelSpecimen id={`color-pickers/panel/${picker.id}`} label={picker.label} picker={picker.id} />
          )}
        </For>
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
function PanelSpecimen(props: { id: string; label: string; picker: 'square' | 'triangle' | 'wheel' }) {
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
  { id: 'wheel', label: 'Wheel' }
] as const;

/** Studio's panel: 284 px wide with 16 px padding. */
const panelWidth = 284;
const panelContentWidth = panelWidth - 32;
