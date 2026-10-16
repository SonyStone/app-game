import type { Brush } from '@app-game/paint-core/brush';
import type { SelectionAction } from '@app-game/paint-core/protocol';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { maxBrushSize, type PaintTool } from '../../features/brush';
import type { BrushPreset } from '../../features/brush-library';
import { gradientKinds, gradientRepeats } from '../../features/gradient';
import { maximumDelay, minimumDelay } from '../../features/quickshape';
import type { PaintSession } from '../../features/session';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './BrushCards.module.css';
import css from './cluster.module.css';
import { PillScrubber, scrollingList, Segmented, SwitchRow, TapButton } from './controls';
import { placed, type Box } from './layout';
import { PresetStroke } from './PresetStroke';
import { percentSetting, sizeSetting, type NumberSetting } from './values';

/**
 * Procreate's Brush Library on the session's presets: sets on the left (recently used, the brushes, imported ABR
 * brushes and erasers), the chosen set's presets as wide stroke cards on the right, the one in use lighter. Choosing
 * a preset paints with it (the eraser keeps erasing with it) and finishes; choosing a set only browses. The header's
 * pen opens the session's Pen window (palm rejection, pen hover, pressure calibration) and finishes; its book opens
 * the ABR viewer to import brushes.
 */
export function BrushLibrary(props: { session: PaintSession; box: Box; done: () => void; onOpenAbr: () => void }) {
  const { library, tools, recentPresets } = props.session;
  const [chosen, setChosen] = createSignal<SetId>('recent');
  const sets = () => {
    const presets = library.presets();
    const current = library.find(tools.preset());
    const recent = [...(current ? [current] : []), ...recentPresets.recent(11).flatMap((id) => library.find(id) ?? [])];
    return setOrder
      .map((id) => ({
        id,
        label: setLabels[id],
        presets: id === 'recent' ? recent : presets.filter((preset) => setOf(preset) === id)
      }))
      .filter((set) => set.presets.length > 0);
  };
  const shown = () => sets().find((set) => set.id === chosen()) ?? sets()[0];
  const disabled = () => !props.session.canChangeBrush() || props.session.uploads.busy();
  // The list scrolls by dragging and picks a preset on a tap.
  const brushPress = scrollingList({
    selector: '[data-preset]',
    tap(item) {
      if (!disabled() && item.dataset.preset) {
        props.session.usePreset(item.dataset.preset);
        props.done();
      }
    }
  });

  return (
    <section class={[css.card, styles.library]} style={placed(props.box)}>
      <header class={css.cardHeader}>
        <h3>Brush Library</h3>
        <TapButton
          class={css.headerButton}
          title="Pen: pressure and palm rejection"
          onTap={() => {
            props.session.windows.open('pen');
            props.done();
          }}
        >
          <SketchIcon name="draw" size={18} />
        </TapButton>
        <TapButton class={css.headerButton} title="ABR brushes: import and edit" onTap={() => props.onOpenAbr()}>
          <SketchIcon name="book" size={18} />
        </TapButton>
      </header>
      <div class={styles.columns}>
        <nav class={styles.sets}>
          <For each={sets()} keyed={(set) => set.id}>
            {(set) => (
              <TapButton
                class={[styles.set, { [styles.on!]: shown()?.id === set().id }]}
                onTap={() => setChosen(set().id)}
              >
                <span>{set().label}</span>
                <Show when={set().id !== 'recent' && set().presets.some((preset) => preset.id === tools.preset())}>
                  <i class={styles.dot} />
                </Show>
              </TapButton>
            )}
          </For>
        </nav>
        <div class={styles.brushes} {...brushPress}>
          <For each={shown()?.presets ?? []} keyed={(preset) => preset.id}>
            {(preset) => (
              <div
                class={[styles.brush, { [styles.on!]: tools.preset() === preset().id, [css.unavailable!]: disabled() }]}
                role="button"
                title={preset().name}
                data-preset={preset().id}
              >
                <span class={styles.brushName}>{preset().name}</span>
                <PresetStroke
                  preset={preset()}
                  resources={library.resources}
                  color={tools.preset() === preset().id ? '#ffffff' : '#d8d8de'}
                  height={24}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

/** The library's sets. */
type SetId = 'recent' | 'brushes' | 'imported' | 'erasers';

const setOrder: readonly SetId[] = ['recent', 'brushes', 'imported', 'erasers'];
const setLabels: Record<SetId, string> = {
  recent: 'Recent',
  brushes: 'Brushes',
  imported: 'Imported',
  erasers: 'Erasers'
};

/** The set a preset belongs to, besides Recent: erasers, imported ABR brushes, or the other brushes. */
function setOf(preset: BrushPreset): SetId {
  const settings = preset.settings.engine?.settings as { values?: { tool?: { type?: unknown } } } | undefined;
  if (preset.settings.tool === 'eraser' || settings?.values?.tool?.type === 'ErTl') {
    return 'erasers';
  }

  return preset.source?.startsWith('abr:') || preset.settings.engine?.id === 'abr' ? 'imported' : 'brushes';
}

/**
 * The active tool's settings, a simplified Brush Studio for the brush and the eraser: numbers as pill scrubbers,
 * toggles as switches, choices as segmented controls. The lasso shows its shape, mode and commands, the fill and the
 * gradient their settings, and a transform in progress Apply and Cancel. Settings apply at once and keep the card
 * open; commands finish. `onPreview` reports drags of size and opacity, so that the cluster can show the brush.
 */
export function ToolCard(props: {
  session: PaintSession;
  box: Box;
  done: () => void;
  onPreview: (kind: 'size' | 'opacity' | undefined) => void;
}) {
  const { session } = props;
  const { tools, fill, gradient, selection, transform } = session;
  const kind = () => (transform.active() ? 'transform' : session.tool());
  const heading = () => headings[kind()];
  const presetName = () => session.library.find(tools.preset())?.name;

  return (
    <section class={[css.card, styles.studio]} style={placed(props.box)}>
      <header class={css.cardHeader}>
        <span class={styles.toolIcon}>
          <SketchIcon name={heading().icon} size={18} />
        </span>
        <h3>{heading().title}</h3>
        <Show when={session.paintsWithBrush() && !transform.active()}>
          <small>{presetName()}</small>
        </Show>
      </header>
      <div class={styles.settings}>
        <Switch>
          <Match when={kind() === 'transform'}>
            <div class={styles.commands}>
              <TapButton
                class={styles.command}
                onTap={() => {
                  void transform.end();
                  props.done();
                }}
              >
                Apply
              </TapButton>
              <TapButton
                class={styles.command}
                onTap={() => {
                  void transform.cancel();
                  props.done();
                }}
              >
                Cancel
              </TapButton>
            </div>
          </Match>
          <Match when={kind() === 'brush' || kind() === 'eraser'}>
            <BrushSettings session={session} onPreview={props.onPreview} />
          </Match>
          <Match when={kind() === 'lasso'}>
            <SelectionSettings session={session} done={props.done} />
          </Match>
          <Match when={kind() === 'fill'}>
            <PillScrubber
              setting={toleranceSetting}
              value={fill.settings().tolerance}
              onChange={(tolerance) => fill.update({ tolerance: Math.round(tolerance) })}
            />
            <PillScrubber
              setting={expandSetting}
              value={fill.settings().expand}
              onChange={(expand) => fill.update({ expand: Math.round(expand) })}
            />
            <PillScrubber
              setting={gapSetting}
              value={fill.settings().gap}
              onChange={(gap) => fill.update({ gap: Math.round(gap) })}
            />
            <PillScrubber
              setting={percentSetting('Opacity', 1)}
              value={Math.round(fill.settings().opacity * 100)}
              onChange={(opacity) => fill.update({ opacity: opacity / 100 })}
            />
            <SwitchRow
              label="Anti-alias"
              on={fill.settings().antialias}
              onToggle={() => fill.update({ antialias: !fill.settings().antialias })}
            />
            <Segmented
              label="Sample"
              options={sampleOptions}
              value={fill.settings().source}
              onChange={(source) => fill.update({ source })}
            />
          </Match>
          <Match when={kind() === 'gradient'}>
            <Segmented
              label="Shape"
              options={gradientKinds.map((value) => ({ value, label: gradientKindLabels[value] }))}
              value={gradient.settings().kind}
              onChange={(value) => gradient.update({ kind: value })}
            />
            <Segmented
              label="Beyond the ends"
              options={gradientRepeats.map((value) => ({ value, label: gradientRepeatLabels[value] }))}
              value={gradient.settings().repeat}
              onChange={(value) => gradient.update({ repeat: value })}
            />
            <PillScrubber
              setting={percentSetting('Opacity', 1)}
              value={Math.round(gradient.settings().opacity * 100)}
              onChange={(opacity) => gradient.update({ opacity: opacity / 100 })}
            />
            <SwitchRow
              label="Smooth color"
              on={gradient.settings().mixing === 'linear'}
              onToggle={() =>
                gradient.update({ mixing: gradient.settings().mixing === 'linear' ? 'classic' : 'linear' })
              }
            />
            <Show when={selection.selected()}>
              <SelectionCommands session={session} done={props.done} />
            </Show>
          </Match>
        </Switch>
      </div>
    </section>
  );
}

/**
 * The brush's or the eraser's settings: size, opacity, flow, the round tip's hardness and pressure, smoothing, and
 * QuickShape with its hold time, which apply to every brush.
 */
function BrushSettings(props: { session: PaintSession; onPreview: (kind: 'size' | 'opacity' | undefined) => void }) {
  const { tools, brush, quickShape } = props.session;
  const round = () => brush().engine === undefined;
  const update = (patch: Partial<Brush>) => tools.updateBrush(patch);
  const updateStroke = (patch: Partial<StrokeSettings>) =>
    update({ stroke: normalizeStrokeSettings({ ...brush().stroke, ...patch }) });

  return (
    <>
      <Show when={props.session.tool() === 'eraser'}>
        <Segmented
          label="Erase with"
          options={[
            { value: 'clear', label: 'The brush', title: 'Erase with the brush’s own tip (Clear mode)' },
            { value: 'preset', label: 'Its own preset', title: 'Erase with the eraser’s own preset' }
          ]}
          value={tools.eraserMode()}
          onChange={tools.setEraserMode}
        />
      </Show>
      <PillScrubber
        setting={sizeSetting(maxBrushSize(brush()))}
        value={brush().size}
        disabled={props.session.blockCursor()}
        onChange={(size) => update({ size })}
        onActive={(active) => props.onPreview(active ? 'size' : undefined)}
      />
      <PillScrubber
        setting={percentSetting('Opacity', 1)}
        value={Math.round(brush().opacity * 100)}
        onChange={(opacity) => update({ opacity: opacity / 100 })}
        onActive={(active) => props.onPreview(active ? 'opacity' : undefined)}
      />
      <PillScrubber
        setting={percentSetting('Flow', 1)}
        value={Math.round(brush().flow * 100)}
        onChange={(flow) => update({ flow: flow / 100 })}
      />
      <Show when={round()}>
        <PillScrubber
          setting={percentSetting('Hardness')}
          value={Math.round(brush().hardness * 100)}
          onChange={(hardness) => update({ hardness: hardness / 100 })}
        />
        <SwitchRow
          label="Pressure → size"
          on={brush().pressureSize}
          onToggle={() => update({ pressureSize: !brush().pressureSize })}
        />
        <SwitchRow
          label="Pressure → flow"
          on={brush().pressureFlow}
          onToggle={() => update({ pressureFlow: !brush().pressureFlow })}
        />
      </Show>
      <Show when={brush().engine?.id === 'textured'}>
        <PillScrubber
          setting={spacingSetting}
          value={Math.round(brush().spacing * 100)}
          onChange={(spacing) => update({ spacing: spacing / 100 })}
        />
      </Show>
      <Segmented
        label="Smoothing"
        options={smoothingOptions}
        value={brush().stroke.mode}
        onChange={(mode) => updateStroke({ mode })}
      />
      <SwitchRow
        label="QuickShape"
        on={quickShape.settings().enabled}
        onToggle={() => quickShape.update({ enabled: !quickShape.settings().enabled })}
      />
      <PillScrubber
        setting={holdSetting}
        value={quickShape.settings().delay}
        disabled={!quickShape.settings().enabled}
        onChange={(delay) => quickShape.update({ delay })}
      />
    </>
  );
}

/** The lasso's shape and mode, the magic wand's settings, and the selection's commands. */
function SelectionSettings(props: { session: PaintSession; done: () => void }) {
  const { selection } = props.session;

  return (
    <>
      <Segmented
        label="Shape"
        options={shapeOptions}
        value={selection.tool()}
        onChange={(tool) => selection.setTool(tool)}
      />
      <Segmented
        label="Combine"
        options={modeOptions}
        value={selection.mode()}
        onChange={(mode) => selection.setMode(mode)}
      />
      <Show when={selection.tool() === 'wand'}>
        <PillScrubber
          setting={toleranceSetting}
          value={selection.wand().tolerance}
          onChange={(tolerance) => selection.updateWand({ tolerance: Math.round(tolerance) })}
        />
        <SwitchRow
          label="Contiguous"
          on={selection.wand().contiguous}
          onToggle={() => selection.updateWand({ contiguous: !selection.wand().contiguous })}
        />
      </Show>
      <SelectionCommands session={props.session} done={props.done} />
    </>
  );
}

/** The selection's commands as a grid; each one finishes. */
function SelectionCommands(props: { session: PaintSession; done: () => void }) {
  const { selection, gradient } = props.session;
  const unavailable = () => !props.session.ready() || selection.busy() || selection.drawing();
  const commands = (): {
    label: string;
    icon: SketchIconName;
    run: () => void;
    disabled: boolean;
  }[] => {
    const selected = selection.selected();
    const action = (name: SelectionAction) => () => selection.action(name);
    return [
      { label: 'Select all', icon: 'fullscreen', run: selection.selectAll, disabled: false },
      { label: 'Deselect', icon: 'close', run: selection.clear, disabled: !selected },
      { label: 'Invert', icon: 'reset', run: selection.invert, disabled: !selected },
      { label: 'Transform', icon: 'move', run: props.session.toggleTransform, disabled: false },
      { label: 'Copy', icon: 'copy', run: action('copy'), disabled: !selected },
      { label: 'Cut', icon: 'cut', run: action('cut'), disabled: !selected },
      { label: 'Paste', icon: 'paste', run: action('paste'), disabled: !selection.hasClipboard() },
      { label: 'Delete', icon: 'trash', run: action('delete'), disabled: !selected },
      { label: 'New layer', icon: 'layers', run: action('new-layer'), disabled: !selected },
      { label: 'Fill', icon: 'fill', run: gradient.fillSelection, disabled: !selected }
    ];
  };

  return (
    <div class={css.actions}>
      <For each={commands()} keyed={false}>
        {(command) => (
          <TapButton
            class={css.action}
            title={command().label}
            disabled={unavailable() || command().disabled}
            onTap={() => {
              command().run();
              props.done();
            }}
          >
            <SketchIcon name={command().icon} size={17} />
            <span>{command().label}</span>
          </TapButton>
        )}
      </For>
    </div>
  );
}

/** The card's title and icon for each tool, and while transforming. */
const headings: Record<PaintTool | 'transform', { title: string; icon: SketchIconName }> = {
  brush: { title: 'Brush Studio', icon: 'brush' },
  eraser: { title: 'Eraser', icon: 'erase' },
  lasso: { title: 'Selection', icon: 'lasso' },
  fill: { title: 'Fill', icon: 'fill' },
  gradient: { title: 'Gradient', icon: 'gradient' },
  transform: { title: 'Transform', icon: 'move' }
};

const toleranceSetting: NumberSetting = {
  label: 'Tolerance',
  min: 0,
  max: 255,
  unit: '',
  presets: [0, 4, 8, 16, 24, 32, 48, 64, 96, 128, 160, 192, 224, 255]
};
const expandSetting: NumberSetting = {
  label: 'Expand',
  min: 0,
  max: 32,
  unit: 'px',
  presets: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32]
};
const gapSetting: NumberSetting = {
  label: 'Close gaps',
  min: 0,
  max: 16,
  unit: 'px',
  presets: [0, 1, 2, 3, 4, 6, 8, 12, 16]
};
const spacingSetting: NumberSetting = {
  label: 'Spacing',
  min: 1,
  max: 1000,
  unit: '%',
  scale: 'log',
  presets: [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000]
};

/** How long the pen rests before QuickShape makes a shape of the stroke. */
const holdSetting: NumberSetting = {
  label: 'Hold',
  min: minimumDelay,
  max: maximumDelay,
  unit: 'ms',
  presets: [250, 300, 400, 500, 600, 750, 1000, 1250, 1500]
};

const sampleOptions = [
  { value: 'layer', label: 'This layer' },
  { value: 'all', label: 'All layers' }
] as const;

const smoothingOptions: readonly { value: StrokeSettings['mode']; label: string; title: string }[] = [
  { value: 'none', label: 'Off', title: 'No smoothing: raw input' },
  { value: 'studio', label: 'Studio', title: 'Studio smoothing' },
  { value: 'normal', label: 'Normal', title: 'Leonardo normal' },
  { value: 'smooth', label: 'Smooth', title: 'Leonardo smooth' },
  { value: 'stabilizer', label: 'SAI', title: 'Stabilizer, after Paint Tool SAI' }
];

const shapeOptions = [
  { value: 'lasso', label: 'Free', title: 'Lasso (L)' },
  { value: 'polygon', label: 'Polygon', title: 'Polygon lasso' },
  { value: 'rectangle', label: 'Rect', title: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse', title: 'Ellipse' },
  { value: 'wand', label: 'Wand', title: 'Magic wand (W)' }
] as const;

const modeOptions = [
  { value: 'replace', label: 'New', title: 'New selection' },
  { value: 'add', label: 'Add', title: 'Add to the selection (Shift)' },
  { value: 'subtract', label: 'Subtract', title: 'Subtract from the selection (Alt)' },
  { value: 'intersect', label: 'Intersect', title: 'Intersect with the selection (Shift Alt)' }
] as const;

const gradientKindLabels: Record<(typeof gradientKinds)[number], string> = {
  linear: 'Linear',
  radial: 'Radial',
  angle: 'Angle',
  diamond: 'Diamond'
};

const gradientRepeatLabels: Record<(typeof gradientRepeats)[number], string> = {
  none: 'Hold',
  repeat: 'Repeat',
  reflect: 'Reflect'
};
