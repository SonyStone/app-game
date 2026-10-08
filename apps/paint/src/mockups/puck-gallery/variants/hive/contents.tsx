import { Match, Show, Switch } from 'solid-js';
import { luminance } from '../../../../features/color/hsv';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { tools, type Setting } from '../../kit/catalog';
import { blendLabel, type BlendMode } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { formatValue, fractionOf } from '../../kit/values';
import { below } from './geometry';
import styles from './Hive.module.css';
import { opacitySetting, type HiveAct, type HiveCell, type LayerAction, type ValueTarget } from './layout';
import { grey, paletteColor, type PaletteState } from './palette';

/**
 * What a cell shows besides its fill, drawn around (0, 0) in the cell's own coordinates: the variant places it at
 * the cell's lensed centre and scales it with the lens. Canvases (layer thumbnails, stroke samples) live in an HTML
 * layer instead, see `HiveVariant`.
 */
export function CellContent(props: { cell: HiveCell; studio: Studio; palette: PaletteState }) {
  const act = () => props.cell.act;
  const studio = () => props.studio;

  return (
    <Switch>
      <Match when={act().kind === 'nav' && (act() as Extract<HiveAct, { kind: 'nav' }>)}>
        {(nav) => <NavContent nav={nav().nav} studio={studio()} />}
      </Match>
      <Match when={act().kind === 'undo'}>
        <Icon name="undo" size={18} dim={!studio().canUndo()} />
      </Match>
      <Match when={act().kind === 'redo'}>
        <Icon name="redo" size={18} dim={!studio().canRedo()} />
      </Match>
      <Match when={act().kind === 'size'}>
        <SizeContent studio={studio()} />
      </Match>
      <Match when={act().kind === 'tool' && (act() as Extract<HiveAct, { kind: 'tool' }>)}>
        {(tool) => (
          <>
            <Icon name={tools[tool().index]!.icon} size={19} y={-3} />
            <text class={styles.key} y={15}>
              {tool().index + 1}
            </text>
          </>
        )}
      </Match>
      <Match when={act().kind === 'view' && (act() as Extract<HiveAct, { kind: 'view' }>)}>
        {(view) => <Icon name={viewIcons[view().view]} size={14} />}
      </Match>
      <Match when={act().kind === 'paletteCenter'}>
        <Icon name="move" size={11} color={contrast(paletteColor(props.palette, 0, 0))} faint />
      </Match>
      <Match when={act().kind === 'previous'}>
        <SwapGlyph color={contrast(studio().previous())} />
      </Match>
      <Match when={act().kind === 'setting' && (act() as Extract<HiveAct, { kind: 'setting' }>)}>
        {(setting) => <SettingContent cell={props.cell} setting={setting().setting} studio={studio()} />}
      </Match>
      <Match when={act().kind === 'eye' && (act() as Extract<HiveAct, { kind: 'eye' }>)}>
        {(eye) => (
          <Icon
            name={
              studio()
                .layers()
                .find((entry) => entry.id === eye().layer)?.visible === false
                ? 'hidden'
                : 'eye'
            }
            size={14}
            dim={
              studio()
                .layers()
                .find((entry) => entry.id === eye().layer)?.visible === false
            }
          />
        )}
      </Match>
      <Match when={act().kind === 'addLayer'}>
        <Icon name="plus" size={18} />
      </Match>
      <Match when={act().kind === 'value' && (act() as Extract<HiveAct, { kind: 'value' }>)}>
        {(value) => <ValueText value={value().value} unit={targetSetting(value().target).unit} />}
      </Match>
      <Match when={act().kind === 'option' && (act() as Extract<HiveAct, { kind: 'option' }>)}>
        {(option) => <text class={styles.option}>{abbreviate(option().option)}</text>}
      </Match>
      <Match when={act().kind === 'blend' && (act() as Extract<HiveAct, { kind: 'blend' }>)}>
        {(blend) => <BlendText mode={blend().mode} />}
      </Match>
      <Match when={act().kind === 'layerAction' && (act() as Extract<HiveAct, { kind: 'layerAction' }>)}>
        {(action) => <LayerActionContent layer={action().layer} action={action().action} studio={studio()} />}
      </Match>
      <Match when={act().kind === 'back' && (act() as Extract<HiveAct, { kind: 'back' }>)}>
        {(back) => <BackContent cell={props.cell} back={back()} studio={studio()} />}
      </Match>
    </Switch>
  );
}

/**
 * A cell's fill: colour cells show their colour, everything else the neutral cell tone (lighter when hovered,
 * pressed or on), with a little extra lift for the Puck.
 */
export function cellFill(cell: HiveCell, studio: Studio, palette: PaletteState, state: CellState): string {
  const act = cell.act;
  switch (act.kind) {
    case 'palette':
      return paletteColor(palette, act.ring, act.angle);
    case 'paletteCenter':
      return paletteColor(palette, 0, 0);
    case 'grey':
      return grey(act.level);
    case 'recent':
      return recentColors(studio)[act.index] ?? '#1d1d1d';
    case 'current':
    case 'core':
      return studio.color();
    case 'previous':
      return studio.previous();
    case 'empty':
      return '#1b1b1b';
  }

  if (state.pressed) {
    return '#4a4a4a';
  }

  if (state.hovered) {
    return '#3a3a3a';
  }

  if (state.on) {
    return '#363636';
  }

  return cell.group === 'puck' ? '#303030' : cell.group === 'flyout' ? '#2e2e2e' : '#2b2b2b';
}

/** A cell's interaction state, for its fill and outline. */
export type CellState = { hovered: boolean; pressed: boolean; on: boolean };

/** Recent colours other than the current one, newest first. */
export function recentColors(studio: Studio) {
  const current = studio.color();
  return studio.recent().filter((entry) => entry !== current);
}

/** The current value of a value target. */
export function readTarget(studio: Studio, target: ValueTarget) {
  if (target.kind === 'setting') {
    return studio.number(target.setting.key);
  }

  return studio.layers().find((entry) => entry.id === target.layer)?.opacity ?? 100;
}

/** The number setting a value target edits. */
export function targetSetting(target: ValueTarget) {
  return target.kind === 'setting' ? target.setting : opacitySetting;
}

/** Black or white, whichever reads over `color`. */
export function contrast(color: string) {
  return luminance(color) > 0.35 ? '#111' : '#f4f4f4';
}

/** An option's name short enough for a cell: its first word, cut to six letters. */
export function abbreviate(option: string) {
  const known: Record<string, string> = { 'Current layer': 'Layer', 'All layers': 'All', Perspective: 'Persp.' };
  const word = known[option] ?? option.split(' ')[0]!;
  return word.length > 6 ? `${word.slice(0, 5)}.` : word;
}

/** A setting's value as a cell prints it: numbers with their unit, toggles as on/off, choices abbreviated. */
export function settingText(setting: Setting, studio: Studio) {
  const value = studio.value(setting.key);
  if (setting.kind === 'number') {
    return `${formatValue(Number(value ?? 0))}${setting.unit}`;
  }

  if (setting.kind === 'toggle') {
    return value === true ? 'on' : 'off';
  }

  return String(value ?? '');
}

function NavContent(props: { nav: 'pan' | 'zoom' | 'rotate'; studio: Studio }) {
  const angle = () => Math.round(props.studio.view().angle);
  return (
    <>
      <Icon name={props.nav} size={18} y={props.nav === 'rotate' && angle() !== 0 ? -4 : 0} />
      <Show when={props.nav === 'rotate' && angle() !== 0}>
        <text class={styles.tiny} y={13}>
          {angle()}°
        </text>
      </Show>
    </>
  );
}

/** The Size wedge: the brush size as a number under a dot that grows with it. */
function SizeContent(props: { studio: Studio }) {
  const size = () => props.studio.number('size');
  const has = () => props.studio.settings().some((entry) => entry.key === 'size');
  const dot = () => Math.min(7, 1.2 + Math.log2(1 + size()) * 0.75);
  return (
    <Show when={has()} fallback={<text class={styles.tiny}>—</text>}>
      <circle cy={-6} r={dot()} class={styles.dot} />
      <text class={styles.puckValue} y={11}>
        {formatValue(size())}
      </text>
    </Show>
  );
}

/**
 * A value cell: its short label above its value, over a gauge that fills the hexagon from the bottom to the
 * value's place in its range (geometrically for sizes), like a honeycomb cell filling up.
 */
function SettingContent(props: { cell: HiveCell; setting: Setting; studio: Studio }) {
  const value = () => props.studio.value(props.setting.key);
  const on = () => props.setting.kind === 'toggle' && value() === true;
  /** The gauge's level and outline in cell coordinates: the hexagon below the value's height. */
  const gauge = () => {
    if (props.setting.kind !== 'number') {
      return undefined;
    }

    const radius = props.cell.size / Math.sqrt(3);
    const level = radius - fractionOf(props.setting, Number(value() ?? 0)) * radius * 2;
    const local = props.cell.shape.map((point) => ({ x: point.x - props.cell.at.x, y: point.y - props.cell.at.y }));
    const kept = below(local, level);
    const edge = kept.filter((point) => Math.abs(point.y - level) < 0.01);
    return {
      points: kept.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
      line: edge.length === 2 && level > -radius + 2 ? { y: level, from: edge[0]!.x, to: edge[1]!.x } : undefined
    };
  };

  return (
    <>
      <Show when={gauge()}>
        {(shown) => (
          <>
            <polygon points={shown().points} class={styles.gauge} />
            <Show when={shown().line}>
              {(line) => <line x1={line().from} x2={line().to} y1={line().y} y2={line().y} class={styles.level} />}
            </Show>
          </>
        )}
      </Show>
      <text class={styles.label} y={-8}>
        {props.setting.short}
      </text>
      <Show
        when={props.setting.kind === 'number' && props.setting}
        fallback={
          <text class={[styles.value, { [styles.off!]: props.setting.kind === 'toggle' && !on() }]} y={8}>
            {props.setting.kind === 'choice' ? abbreviate(String(value() ?? '')) : on() ? 'on' : 'off'}
          </text>
        }
      >
        {(number) => <ValueText value={Number(value() ?? 0)} unit={number().unit} y={8} />}
      </Show>
    </>
  );
}

/** A number with its unit in smaller type; long numbers drop the unit to fit (the caption still has it). */
function ValueText(props: { value: number; unit: string; y?: number }) {
  const text = () => formatValue(props.value);
  return (
    <text class={styles.value} y={props.y ?? 3}>
      {text()}
      <Show when={text().length + props.unit.length <= 5}>
        <tspan class={styles.unit}>{props.unit}</tspan>
      </Show>
    </text>
  );
}

/** A blend mode as one or two short lines, "Color / dodge"; the three long single words are cut. */
function BlendText(props: { mode: BlendMode }) {
  const words = () => (shortBlends[props.mode] ?? blendLabel(props.mode)).split(' ');
  return (
    <Show
      when={words().length > 1}
      fallback={
        <text class={styles.option} y={3}>
          {words()[0]}
        </text>
      }
    >
      <text class={styles.option} y={-3}>
        {words()[0]}
      </text>
      <text class={styles.option} y={9}>
        {words()[1]}
      </text>
    </Show>
  );
}

function LayerActionContent(props: { layer: string; action: LayerAction; studio: Studio }) {
  const layer = () => props.studio.layers().find((entry) => entry.id === props.layer);
  return (
    <Switch>
      <Match when={props.action === 'opacity'}>
        <text class={styles.label} y={-8}>
          Op
        </text>
        <ValueText value={layer()?.opacity ?? 100} unit="%" y={8} />
      </Match>
      <Match when={props.action === 'blend'}>
        <text class={styles.label} y={-8}>
          Blend
        </text>
        <text class={styles.option} y={8}>
          {abbreviate(blendLabel(layer()?.blend ?? 'normal'))}
        </text>
      </Match>
      <Match when={props.action === 'lock'}>
        <Icon name={layer()?.locked ? 'lock' : 'unlock'} size={17} />
      </Match>
      <Match when={props.action === 'delete'}>
        <Icon name="trash" size={17} color="#e7a199" />
      </Match>
      <Match when={true}>
        <Icon name={layerActionIcons[props.action]} size={18} />
      </Match>
    </Switch>
  );
}

/** A flyout's middle cell: what unfolded, so that its value stays in sight while choosing. */
function BackContent(props: { cell: HiveCell; back: Extract<HiveAct, { kind: 'back' }>; studio: Studio }) {
  const of = () => props.back.of;
  const layer = () => {
    const flyout = of();
    return flyout.kind === 'layer' || flyout.kind === 'blend'
      ? props.studio.layers().find((entry) => entry.id === flyout.layer)
      : undefined;
  };

  return (
    <Switch>
      <Match when={of().kind === 'number' && (of() as Extract<typeof props.back.of, { kind: 'number' }>)}>
        {(number) => (
          <>
            <text class={styles.label} y={-8}>
              {targetSetting(number().target).short}
            </text>
            <ValueText
              value={readTarget(props.studio, number().target)}
              unit={targetSetting(number().target).unit}
              y={8}
            />
          </>
        )}
      </Match>
      <Match when={of().kind === 'choice' && (of() as Extract<typeof props.back.of, { kind: 'choice' }>)}>
        {(choice) => (
          <>
            <text class={styles.label} y={-8}>
              {choice().setting.short}
            </text>
            <text class={styles.value} y={8}>
              {abbreviate(String(props.studio.value(choice().setting.key) ?? ''))}
            </text>
          </>
        )}
      </Match>
      <Match when={of().kind === 'blend'}>
        <text class={styles.label} y={-8}>
          Blend
        </text>
        <text class={styles.value} y={8}>
          {abbreviate(blendLabel(layer()?.blend ?? 'normal'))}
        </text>
      </Match>
      <Match when={true}>
        <Icon name="close" size={14} y={-7} />
        <text class={styles.tiny} y={12}>
          {(layer()?.name ?? '').slice(0, 7)}
        </text>
      </Match>
    </Switch>
  );
}

/** A line icon centred on (0, 0); `faint` and `dim` tone it down. */
function Icon(props: {
  name: SketchIconName;
  size: number;
  y?: number;
  color?: string;
  dim?: boolean;
  faint?: boolean;
}) {
  return (
    <g
      transform={`translate(${-props.size / 2} ${-props.size / 2 + (props.y ?? 0)})`}
      class={[styles.icon, { [styles.dim!]: props.dim, [styles.faint!]: props.faint }]}
      style={props.color ? { color: props.color } : undefined}
    >
      <SketchIcon name={props.name} size={props.size} />
    </g>
  );
}

/** Two arrows chasing each other: tapping the previous colour swaps it with the current one. */
function SwapGlyph(props: { color: string }) {
  return (
    <path
      d="M-6 -3h10l-3-3M6 3H-4l3 3"
      fill="none"
      stroke={props.color}
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  );
}

const shortBlends: Partial<Record<BlendMode, string>> = {
  difference: 'Diff.',
  saturation: 'Satur.',
  luminosity: 'Lumin.'
};

const viewIcons: Record<'fit' | 'flip' | 'symmetry', SketchIconName> = {
  fit: 'fullscreen',
  flip: 'mirror',
  symmetry: 'symmetry'
};

const layerActionIcons: Record<LayerAction, SketchIconName> = {
  opacity: 'numbers',
  blend: 'layers',
  lock: 'lock',
  up: 'up',
  down: 'down',
  duplicate: 'copy',
  delete: 'trash'
};
