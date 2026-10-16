import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { Match, Show, Switch } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { gradientKinds, gradientPresets, gradientRepeats, type GradientSettings } from '../../features/gradient';
import { maximumDelay, minimumDelay } from '../../features/quickshape';
import type { PaintSession } from '../../features/session';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { Choice, Divider, Group, IconButton, ScrubField, Segmented, TextButton, Toggle } from './controls';
import type { DesktopTools } from './createDesktopTools';
import styles from './OptionsBar.module.css';
import { angleDegrees } from './viewDrag';

/**
 * Photoshop's options bar: the settings of the tool in use, in one dense row under the menu bar. A row too long for
 * the window scrolls sideways. Numbers are scrub fields: drag sideways, or tap to type.
 */
export function OptionsBar(props: {
  session: PaintSession;
  tools: DesktopTools;
  /** Opens the brush preset picker under `anchor`. */
  onPresets: (anchor: HTMLElement) => void;
  onFeather: () => void;
}) {
  const active = () => props.tools.active();

  return (
    <div class={styles.bar} role="toolbar" aria-label="Tool options">
      <span class={styles.tool}>{toolNames[active()]}</span>
      <Divider />
      <Switch>
        <Match when={active() === 'brush' || active() === 'eraser'}>
          <BrushOptions session={props.session} onPresets={props.onPresets} />
        </Match>
        <Match when={active() === 'select'}>
          <SelectionOptions session={props.session} onFeather={props.onFeather} />
        </Match>
        <Match when={active() === 'fill'}>
          <FillOptions session={props.session} />
        </Match>
        <Match when={active() === 'gradient'}>
          <GradientOptions session={props.session} />
        </Match>
        <Match when={active() === 'transform'}>
          <TransformOptions session={props.session} />
        </Match>
        <Match when={active() === 'local-undo'}>
          <LocalUndoOptions session={props.session} />
        </Match>
        <Match when={active() === 'eyedropper'}>
          <PickerOptions session={props.session} />
        </Match>
        <Match when={active() === 'view'}>
          <ViewOptions session={props.session} tools={props.tools} />
        </Match>
      </Switch>
    </div>
  );
}

const toolNames = {
  brush: 'Brush',
  eraser: 'Eraser',
  select: 'Selection',
  fill: 'Fill',
  gradient: 'Gradient',
  'local-undo': 'Local undo',
  transform: 'Transform',
  eyedropper: 'Eyedropper',
  view: 'View'
} satisfies Record<ReturnType<DesktopTools['active']>, string>;

/**
 * The brush and the eraser: the preset (opens the picker), size, opacity, flow, the round tip's hardness and pressure
 * switches, stroke smoothing, QuickShape and its hold time (for every brush), the eraser's mode and the Mixer Brush's
 * commands.
 */
function BrushOptions(props: { session: PaintSession; onPresets: (anchor: HTMLElement) => void }) {
  const { session } = props;
  const { brush, tools, library, mixer, engine, quickShape } = session;
  const update = tools.updateBrush;
  const round = () => brush().engine === undefined;
  const pressureShown = () => brush().engine?.id !== 'abr';
  const disabled = () => !session.ready();
  const presetName = () => library.find(tools.preset())?.name ?? 'Brush';
  const stroke = () => brush().stroke;
  const smoothing = (patch: Partial<StrokeSettings>) =>
    update({ stroke: normalizeStrokeSettings({ ...stroke(), ...patch }) });

  return (
    <>
      <button
        class={styles.preset}
        title="Brush preset: choose another"
        aria-haspopup="dialog"
        data-popup-anchor
        onClick={(event) => {
          void library.loadAll();
          props.onPresets(event.currentTarget);
        }}
      >
        <span
          class={styles.presetDot}
          style={{ background: session.tool() === 'eraser' ? 'var(--ink)' : brush().color }}
        />
        <span class={styles.presetName}>{presetName()}</span>
        <SketchIcon name="down" size={12} />
      </button>
      <ScrubField
        caption="Size"
        label="Brush size"
        value={brush().size}
        min={1}
        max={maxBrushSize(brush())}
        step={brush().size < 10 ? 0.5 : 1}
        scale="log"
        unit="px"
        disabled={disabled() || session.blockCursor()}
        onInput={(size) => update({ size })}
        onChange={(size) => update({ size })}
      />
      <ScrubField
        caption="Opacity"
        label="Brush opacity"
        value={Math.round(brush().opacity * 100)}
        min={1}
        max={100}
        unit="%"
        width={58}
        disabled={disabled()}
        onInput={(opacity) => update({ opacity: opacity / 100 })}
        onChange={(opacity) => update({ opacity: opacity / 100 })}
      />
      <ScrubField
        caption="Flow"
        label="Brush flow"
        value={Math.round(brush().flow * 100)}
        min={1}
        max={100}
        unit="%"
        width={58}
        disabled={disabled()}
        onInput={(flow) => update({ flow: flow / 100 })}
        onChange={(flow) => update({ flow: flow / 100 })}
      />
      <Show when={round()}>
        <ScrubField
          caption="Hardness"
          label="Brush hardness"
          value={Math.round(brush().hardness * 100)}
          min={0}
          max={100}
          unit="%"
          width={58}
          disabled={disabled()}
          onInput={(hardness) => update({ hardness: hardness / 100 })}
          onChange={(hardness) => update({ hardness: hardness / 100 })}
        />
      </Show>
      <Show when={pressureShown()}>
        <Group label="Pressure" caption="Pressure">
          <Toggle
            label="Size"
            title="Pressure changes the size"
            on={brush().pressureSize}
            disabled={disabled()}
            onToggle={() => update({ pressureSize: !brush().pressureSize })}
          />
          <Toggle
            label="Flow"
            title="Pressure changes the flow"
            on={brush().pressureFlow}
            disabled={disabled()}
            onToggle={() => update({ pressureFlow: !brush().pressureFlow })}
          />
        </Group>
      </Show>
      <Divider />
      <Group label="Smoothing" caption="Smoothing">
        <Choice
          label="Stroke smoothing"
          value={stroke().mode}
          options={smoothingModes}
          disabled={disabled()}
          onChange={(mode) => smoothing({ mode })}
        />
        <Switch>
          <Match when={stroke().mode === 'normal' || stroke().mode === 'smooth'}>
            <ScrubField
              caption=""
              label="Smoothing strength"
              value={stroke().mode === 'smooth' ? stroke().smooth : stroke().normal}
              min={0}
              max={49}
              width={50}
              disabled={disabled()}
              onChange={(value) => smoothing(stroke().mode === 'smooth' ? { smooth: value } : { normal: value })}
            />
          </Match>
          <Match when={stroke().mode === 'stabilizer'}>
            <ScrubField
              caption=""
              label="Stabilizer level: 0–15, then S-1 to S-7 above"
              value={stroke().stabilizer}
              min={0}
              max={22}
              width={50}
              disabled={disabled()}
              onChange={(stabilizer) => smoothing({ stabilizer })}
            />
          </Match>
        </Switch>
      </Group>
      <Divider />
      <Toggle
        label="QuickShape"
        title="Hold the pen still at the end of a stroke to make it a line, arc, ellipse or polygon; for every brush"
        on={quickShape.settings().enabled}
        onToggle={() => quickShape.update({ enabled: !quickShape.settings().enabled })}
      />
      <ScrubField
        caption="Hold"
        label="QuickShape hold time"
        value={quickShape.settings().delay}
        min={minimumDelay}
        max={maximumDelay}
        step={50}
        unit="ms"
        width={64}
        disabled={!quickShape.settings().enabled}
        onChange={(delay) => quickShape.update({ delay })}
      />
      <Show when={session.tool() === 'eraser'}>
        <Divider />
        <Toggle
          label="Erase with brush"
          title="The eraser erases with the brush's tip instead of its own preset"
          on={tools.eraserMode() === 'clear' && tools.canClear()}
          disabled={!tools.canClear()}
          onToggle={() => tools.setEraserMode(tools.eraserMode() === 'clear' ? 'preset' : 'clear')}
        />
      </Show>
      <Show when={session.tool() === 'brush' && mixer.available()}>
        <Divider />
        <Group label="Mixer Brush" caption="Mixer">
          <TextButton
            label="Load"
            title="Load the brush with the foreground color"
            disabled={disabled() || engine.commandBusy()}
            onClick={() => void mixer.command('load')}
          />
          <TextButton
            label="Clean"
            title="Clean the brush"
            disabled={disabled() || engine.commandBusy()}
            onClick={() => void mixer.command('clean')}
          />
        </Group>
      </Show>
    </>
  );
}

const smoothingModes: readonly { value: StrokeSettings['mode']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'studio', label: 'Studio' },
  { value: 'normal', label: 'Leonardo normal' },
  { value: 'smooth', label: 'Leonardo smooth' },
  { value: 'stabilizer', label: 'Stabilizer (SAI)' }
];

/** The selection: its tool and how it combines, the wand's settings, and the selection commands. */
function SelectionOptions(props: { session: PaintSession; onFeather: () => void }) {
  const { selection } = props.session;
  const idle = () => props.session.ready() && !selection.busy() && !selection.drawing();
  const selected = () => selection.selected() && idle();

  return (
    <>
      <Segmented
        label="Selection tool"
        value={selection.tool()}
        options={[
          { value: 'lasso', label: 'Lasso (L)', icon: 'lasso' },
          { value: 'polygon', label: 'Polygon lasso', icon: 'selectPolygon' },
          { value: 'rectangle', label: 'Rectangle', icon: 'selectRect' },
          { value: 'ellipse', label: 'Ellipse', icon: 'selectEllipse' },
          { value: 'wand', label: 'Magic wand (W)', icon: 'magicWand' }
        ]}
        disabled={selection.drawing()}
        onChange={selection.setTool}
      />
      <Segmented
        label="Combine"
        value={selection.mode()}
        options={[
          { value: 'replace', label: 'New selection', icon: 'selectNew' },
          { value: 'add', label: 'Add to the selection (Shift)', icon: 'selectAdd' },
          { value: 'subtract', label: 'Subtract from the selection (Alt)', icon: 'selectSubtract' },
          { value: 'intersect', label: 'Intersect with the selection (Shift+Alt)', icon: 'selectIntersect' }
        ]}
        onChange={selection.setMode}
      />
      <Show when={selection.tool() === 'wand'}>
        <Divider />
        <ScrubField
          caption="Tolerance"
          label="Wand tolerance"
          value={selection.wand().tolerance}
          min={0}
          max={255}
          width={54}
          onChange={(tolerance) => selection.updateWand({ tolerance })}
        />
        <Toggle
          label="Contiguous"
          title="Select only connected pixels"
          on={selection.wand().contiguous}
          onToggle={() => selection.updateWand({ contiguous: !selection.wand().contiguous })}
        />
        <Toggle
          label="Anti-alias"
          title="Smooth the selection's edges"
          on={selection.wand().antialias}
          onToggle={() => selection.updateWand({ antialias: !selection.wand().antialias })}
        />
        <Choice
          label="Sample"
          value={selection.wand().source}
          options={[
            { value: 'layer', label: 'Current layer' },
            { value: 'all', label: 'All layers' }
          ]}
          onChange={(source) => selection.updateWand({ source })}
        />
      </Show>
      <Divider />
      <TextButton label="Select all" disabled={!idle()} onClick={selection.selectAll} />
      <TextButton label="Inverse" disabled={!selected()} onClick={selection.invert} />
      <span data-feather-anchor>
        <TextButton label="Feather…" disabled={!selected()} onClick={props.onFeather} />
      </span>
      <TextButton label="Deselect" disabled={!selected()} onClick={selection.clear} />
      <TextButton
        label="Fill"
        title="Fill the selection with the foreground color"
        disabled={!selected()}
        onClick={props.session.gradient.fillSelection}
      />
    </>
  );
}

/** The fill: tolerance, growth, gap closing, opacity, what it samples and anti-aliasing. */
function FillOptions(props: { session: PaintSession }) {
  const { fill } = props.session;
  const settings = () => fill.settings();

  return (
    <>
      <ScrubField
        caption="Tolerance"
        label="Fill tolerance"
        value={settings().tolerance}
        min={0}
        max={255}
        width={54}
        onChange={(tolerance) => fill.update({ tolerance })}
      />
      <ScrubField
        caption="Expand"
        label="Grow the filled area"
        value={settings().expand}
        min={0}
        max={32}
        unit="px"
        width={56}
        onChange={(expand) => fill.update({ expand })}
      />
      <ScrubField
        caption="Close gaps"
        label="Close gaps in line art up to this size"
        value={settings().gap}
        min={0}
        max={16}
        unit="px"
        width={56}
        onChange={(gap) => fill.update({ gap })}
      />
      <ScrubField
        caption="Opacity"
        label="Fill opacity"
        value={Math.round(settings().opacity * 100)}
        min={1}
        max={100}
        unit="%"
        width={58}
        onChange={(opacity) => fill.update({ opacity: opacity / 100 })}
      />
      <Toggle
        label="Anti-alias"
        title="Smooth the fill's edges"
        on={settings().antialias}
        onToggle={() => fill.update({ antialias: !settings().antialias })}
      />
      <Choice
        label="Sample"
        value={settings().source}
        options={[
          { value: 'layer', label: 'Current layer' },
          { value: 'all', label: 'All layers' }
        ]}
        onChange={(source) => fill.update({ source })}
      />
      <span class={styles.note}>Fills inside the selection</span>
    </>
  );
}

/** The gradient: its colors, shape, repeat and opacity. */
function GradientOptions(props: { session: PaintSession }) {
  const { gradient } = props.session;
  const settings = () => gradient.settings();
  const colors = () => presetOf(settings());

  return (
    <>
      <Choice
        label="Gradient colors"
        value={colors()}
        options={[
          { value: 'background', label: 'Foreground to background' },
          { value: 'transparent', label: 'Foreground to transparent' },
          ...(colors() === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : [])
        ]}
        onChange={(preset) => {
          if (preset !== 'custom') {
            gradient.update({ stops: [...gradientPresets[preset]] });
          }
        }}
      />
      <Segmented
        label="Shape"
        value={settings().kind}
        options={gradientKinds.map((kind) => ({ value: kind, label: kindLabels[kind] }))}
        onChange={(kind) => gradient.update({ kind })}
      />
      <Choice
        label="Past the end"
        value={settings().repeat}
        options={gradientRepeats.map((repeat) => ({ value: repeat, label: repeatLabels[repeat] }))}
        onChange={(repeat) => gradient.update({ repeat })}
      />
      <ScrubField
        caption="Opacity"
        label="Gradient opacity"
        value={Math.round(settings().opacity * 100)}
        min={1}
        max={100}
        unit="%"
        width={58}
        onChange={(opacity) => gradient.update({ opacity: opacity / 100 })}
      />
      <span class={styles.note}>Drag inside the selection</span>
    </>
  );
}

const kindLabels: Record<GradientSettings['kind'], string> = {
  linear: 'Linear',
  radial: 'Radial',
  angle: 'Angle',
  diamond: 'Diamond'
};

const repeatLabels: Record<GradientSettings['repeat'], string> = {
  none: 'Extend',
  repeat: 'Repeat',
  reflect: 'Reflect'
};

/** Which preset the gradient's stops are, or `custom`. */
function presetOf(settings: GradientSettings): keyof typeof gradientPresets | 'custom' {
  const same = (stops: readonly GradientSettings['stops'][number][]) =>
    stops.length === settings.stops.length &&
    stops.every(
      (stop, index) =>
        stop.color === settings.stops[index]!.color &&
        stop.position === settings.stops[index]!.position &&
        stop.alpha === settings.stops[index]!.alpha
    );
  if (same(gradientPresets.background)) {
    return 'background';
  }

  return same(gradientPresets.transparent) ? 'transparent' : 'custom';
}

/** The transform in progress: apply or cancel it, its settings, flips, quarter turns, distort and warp. */
function TransformOptions(props: { session: PaintSession }) {
  const { transform } = props.session;
  const settings = () => transform.settings();
  const box = () => transform.box();

  return (
    <>
      <Toggle
        label="Proportional"
        title="Corner handles keep the proportions; Shift does the opposite"
        on={settings().proportional}
        onToggle={() => transform.setSettings({ proportional: !settings().proportional })}
      />
      <Choice
        label="Interpolation"
        value={settings().interpolation}
        options={[
          { value: 'smooth', label: 'Smooth' },
          { value: 'pixels', label: 'Pixels (nearest)' }
        ]}
        onChange={(interpolation) => transform.setSettings({ interpolation })}
      />
      <Divider />
      <IconButton icon="mirror" label="Flip horizontally" onClick={() => transform.flip('x')} />
      <IconButton icon="flipVertical" label="Flip vertically" onClick={() => transform.flip('y')} />
      <IconButton icon="rotate" label="Rotate 90° clockwise" onClick={() => transform.rotate()} />
      <Toggle
        label="Distort"
        title="Move the corners freely"
        on={box().corners !== undefined && box().warp === undefined}
        onToggle={() => transform.distort(box().corners === undefined)}
      />
      <Toggle
        label="Warp"
        title="Bend the pixels with a grid"
        on={box().warp !== undefined}
        onToggle={() => transform.warp(box().warp === undefined)}
      />
      <TextButton label="Reset" title="Back to the original placement" onClick={() => transform.reset()} />
      <Divider />
      <TextButton label="Cancel" title="Cancel the transform (Esc)" onClick={() => void transform.cancel()} />
      <TextButton label="Apply" title="Apply the transform (Enter)" onClick={() => void transform.end()} />
    </>
  );
}

/** The local undo: its settings window, which holds the mode, steps back and mask brush, and Cancel and Apply. */
function LocalUndoOptions(props: { session: PaintSession }) {
  const { localUndo, windows } = props.session;

  return (
    <>
      <TextButton
        label="Settings…"
        title="How to mark the area, how far back and the mask brush"
        onClick={() => windows.open('local-undo')}
      />
      <Divider />
      <TextButton
        label="Cancel"
        title="Cancel the local undo (Esc)"
        disabled={!localUndo.open()}
        onClick={() => void localUndo.cancel()}
      />
      <TextButton
        label="Apply"
        title="Apply the local undo (Enter)"
        disabled={!localUndo.open()}
        onClick={() => void localUndo.apply()}
      />
    </>
  );
}

/** The eyedropper: what it samples and how many pixels it averages. */
function PickerOptions(props: { session: PaintSession }) {
  const { colorPicker } = props.session;
  const settings = colorPicker.settings;

  return (
    <>
      <Choice
        label="Sample"
        value={settings.source()}
        options={[
          { value: 'view', label: 'All layers' },
          { value: 'layer', label: 'Current layer' }
        ]}
        onChange={(source) => settings.update({ source })}
      />
      <Segmented
        label="Sample size"
        value={`${settings.size()}` as '1' | '3' | '5'}
        options={[
          { value: '1', label: 'Point sample', text: 'Point' },
          { value: '3', label: '3 by 3 average', text: '3×3' },
          { value: '5', label: '5 by 5 average', text: '5×5' }
        ]}
        onChange={(size) => settings.update({ size: Number(size) as 1 | 3 | 5 })}
      />
      <span class={styles.note}>Picks once, then returns to the tool · Alt picks while painting</span>
    </>
  );
}

/** The view tools: hand, zoom and rotate, the zoom and angle, and the view commands. */
function ViewOptions(props: { session: PaintSession; tools: DesktopTools }) {
  const { camera } = props.session;

  return (
    <>
      <Segmented
        label="View tool"
        value={props.tools.viewMode() ?? 'hand'}
        options={[
          { value: 'hand', label: 'Hand: drag to pan (H)', icon: 'pan' },
          { value: 'zoom', label: 'Zoom: click to zoom in, Alt-click out, drag sideways (Z)', icon: 'zoom' },
          { value: 'rotate', label: 'Rotate view: drag around the center, Shift snaps (R)', icon: 'rotate' }
        ]}
        onChange={props.tools.chooseView}
      />
      <Divider />
      <ScrubField
        caption="Zoom"
        label="Zoom"
        value={Math.round(camera.camera().zoom * 100)}
        min={5}
        max={3200}
        scale="log"
        unit="%"
        width={70}
        onInput={(percent) => camera.navigate(zoomed(camera.current(), percent))}
        onChange={(percent) => camera.navigate(zoomed(camera.current(), percent))}
      />
      <ScrubField
        caption="Angle"
        label="View angle"
        value={angleDegrees(camera.camera().angle)}
        min={-180}
        max={180}
        wrap
        unit="°"
        width={62}
        onInput={(degrees) => camera.navigate(turned(camera.current(), degrees))}
        onChange={(degrees) => camera.navigate(turned(camera.current(), degrees))}
      />
      <TextButton label="100%" title="Actual pixels" onClick={camera.resetZoom} />
      <TextButton label="Reset rotation" onClick={camera.resetRotation} />
      <TextButton label="Reset view" onClick={camera.reset} />
      <Toggle label="Mirror" title="Mirror the view (M)" on={camera.camera().mirrored} onToggle={camera.toggleMirror} />
    </>
  );

  function zoomed(current: ReturnType<typeof camera.current>, percent: number) {
    return { ...current, zoom: percent / 100 };
  }

  function turned(current: ReturnType<typeof camera.current>, degrees: number) {
    return { ...current, angle: (degrees * Math.PI) / 180 };
  }
}
