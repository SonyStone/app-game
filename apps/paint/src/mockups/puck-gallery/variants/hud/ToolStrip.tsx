import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import { tools, type Setting } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import { formatValue, fractionOf, stepPreset, valueAt, type NumberSetting } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import { clamp, openSide, shiftRect, unionRect, windowEdges, type Rect } from './geometry';
import styles from './Hud.module.css';
import { createTrembleGuard, placeStrip, stripPress, type StripContext } from './strip';
import { createWheelSteps, rectStyle } from './ValueStrip';

/**
 * Opens the strip of the eight tools just above the pen, with the current tool's cell over `context.home`. The
 * catalog runs outward toward the hand's side, where Tools opens, so the brush is nearest the ring. Sliding along it
 * previews the tool under the pen; a commit switches to it. In tap and key mode a second tier, the current tool's
 * settings, opens above the row (below it when there is no room).
 */
export function createToolStrip(context: StripContext) {
  const { studio, home } = context;
  const reversed = openSide(context.hand) > 0;
  /** A tool's place in the row, from the left; the inverse of itself. */
  const slot = (index: number) => (reversed ? tools.length - 1 - index : index);
  const start = tools.findIndex((tool) => tool.id === studio.tool());
  const row0: Rect = {
    left: home.x - rowInset - slot(start) * cellPitch - cellSize / 2,
    top: home.y - rowGap - cellSize - rowInset,
    width: tools.length * cellPitch - (cellPitch - cellSize) + rowInset * 2,
    height: cellSize + rowInset * 2
  };
  const name0: Rect = { left: row0.left, top: row0.top + row0.height + 4, width: row0.width, height: 18 };
  const parts = [row0, name0];
  let settings0: Rect | undefined;
  if (context.via !== 'drag') {
    const height = Math.ceil(studio.settings().length / 2) * settingPitch + 12;
    const above = row0.top - 8 - height >= windowEdges.top;
    settings0 = {
      left: row0.left,
      top: above ? row0.top - 8 - height : name0.top + name0.height + 6,
      width: row0.width,
      height
    };
    parts.push(settings0);
  }

  const delta = placeStrip(context, unionRect(...parts));
  const row = shiftRect(row0, delta);
  const settings = settings0 && shiftRect(settings0, delta);
  const indexAt = (point: Point) => {
    const outside =
      point.y < row.top - 30 ||
      point.y > row.top + row.height + 60 ||
      point.x < row.left - 40 ||
      point.x > row.left + row.width + 40;
    return outside
      ? undefined
      : slot(clamp(Math.floor((point.x - row.left - rowInset + 1) / cellPitch), 0, tools.length - 1));
  };

  const guard = createTrembleGuard(context);
  const [hovered, setHovered] = createSignal<number>();
  let latest: number | undefined;
  const current = () => tools.findIndex((tool) => tool.id === studio.tool());
  const show = (index: number | undefined) => {
    latest = index;
    setHovered(index);
  };

  return {
    kind: 'tools' as const,
    fn: 'tools' as const,
    row,
    settings,
    slot,
    hovered,
    /** The tool a lift would choose: the one under the pen, else the current one. */
    selected: () => hovered() ?? current(),
    finishes: true,
    move(point: Point) {
      if (guard(point)) {
        show(indexAt(point));
      }
    },
    tap(point: Point) {
      show(indexAt(point));
    },
    step(dx: number, dy: number) {
      show(clamp((latest ?? current()) + (reversed ? -1 : 1) * (dx || -dy), 0, tools.length - 1));
    },
    commit() {
      const chosen = latest === undefined ? undefined : tools[latest];
      show(undefined);
      if (!chosen || chosen.id === studio.tool()) {
        return false;
      }

      studio.setTool(chosen.id);
      return true;
    },
    cancel() {
      show(undefined);
    }
  };
}

/** An open tool strip. */
export type ToolStrip = ReturnType<typeof createToolStrip>;

/**
 * The tool strip: a capsule of tool icons with the current tool underlined, the name and key of the tool under the
 * pen, and in tap and key mode the current tool's settings.
 */
export function ToolStripView(props: {
  strip: ToolStrip;
  studio: Studio;
  interactive: boolean;
  /** Hears whether a press on the row switched the tool. */
  committed: (changed: boolean) => void;
}) {
  const strip = props.strip;
  const press = stripPress(strip, (changed) => props.committed(changed));
  const wheel = createWheelSteps((by) => {
    strip.step(-by, 0);
    strip.commit();
  });
  const named = () => tools[strip.selected()]!;

  return (
    <>
      <div
        {...galleryUi}
        {...(props.interactive ? press : {})}
        class={[styles.strip, { [styles.passive!]: !props.interactive }]}
        style={rectStyle(strip.row)}
        onWheel={(event) => props.interactive && wheel(event)}
      >
        <For each={tools}>
          {(tool, index) => (
            <span
              class={[
                styles.toolCell,
                {
                  [styles.hot!]: strip.hovered() === index(),
                  [styles.current!]: props.studio.tool() === tool.id
                }
              ]}
              style={{ left: `${rowInset + strip.slot(index()) * cellPitch}px`, top: `${rowInset}px` }}
            >
              <SketchIcon name={tool.icon} size={20} />
            </span>
          )}
        </For>
      </div>
      <div
        class={styles.readout}
        style={{
          left: `${strip.row.left + rowInset + strip.slot(strip.selected()) * cellPitch + cellSize / 2}px`,
          top: `${strip.row.top + strip.row.height + 5}px`,
          translate: '-50% 0'
        }}
      >
        <b>{named().label}</b>
        <kbd>{named().key}</kbd>
      </div>
      <Show when={props.interactive && strip.settings}>
        {(rect) => <ToolSettings studio={props.studio} rect={rect()} />}
      </Show>
    </>
  );
}

/**
 * The current tool's settings in two dense columns: numbers as press-and-slide bars (geometric for sizes and
 * spacing; the wheel steps through the presets), choices as buttons that cycle, toggles as switches. Tweaks are not
 * finished actions, so the HUD stays open.
 */
export function ToolSettings(props: { studio: Studio; rect: Rect }) {
  return (
    <div class={styles.settings} style={rectStyle(props.rect)} {...galleryUi}>
      <For each={props.studio.settings()} keyed={(setting) => setting.key}>
        {(setting) => (
          <div class={styles.settingRow}>
            <Show when={setting().kind !== 'toggle'}>
              <span class={styles.settingLabel} title={setting().label}>
                {setting().label}
              </span>
            </Show>
            <Switch>
              <Match when={numberOf(setting())}>
                {(number) => <NumberBar studio={props.studio} setting={number()} />}
              </Match>
              <Match when={setting().kind === 'toggle'}>
                <ToggleButton studio={props.studio} setting={setting()} />
              </Match>
              <Match when={setting().kind === 'choice'}>
                <ChoiceButton studio={props.studio} setting={setting()} />
              </Match>
            </Switch>
          </div>
        )}
      </For>
    </div>
  );
}

/** A number setting as a bar to press and slide along: the value under the pointer, the wheel steps presets. */
function NumberBar(props: { studio: Studio; setting: NumberSetting }) {
  let bar!: HTMLButtonElement;
  const value = () => props.studio.number(props.setting.key);
  const setAt = (point: Point) => {
    const box = bar.getBoundingClientRect();
    props.studio.setValue(props.setting.key, valueAt(props.setting, (point.x - box.left) / box.width));
  };
  const wheel = createWheelSteps((by) =>
    props.studio.setValue(props.setting.key, stepPreset(props.setting, value(), by))
  );
  const press = pressHandlers({ start: (started) => setAt(started.point), move: (moved) => setAt(moved.point) });

  return (
    <button
      ref={bar}
      {...galleryUi}
      {...press}
      class={[styles.control, styles.bar]}
      style={{ '--fill': `${fractionOf(props.setting, value()) * 100}%` }}
      onWheel={wheel}
    >
      <span>
        {formatValue(value())}
        <small>{props.setting.unit}</small>
      </span>
    </button>
  );
}

/** A choice setting as a button that cycles through its options; the wheel steps both ways. */
function ChoiceButton(props: { studio: Studio; setting: Setting }) {
  const options = () => (props.setting.kind === 'choice' ? props.setting.options : []);
  const shift = (by: number) => {
    const list = options();
    const index = list.indexOf(String(props.studio.value(props.setting.key)));
    props.studio.setValue(props.setting.key, list[(index + by + list.length) % list.length]!);
  };
  const wheel = createWheelSteps((by) => shift(-by));
  const press = pressHandlers({ tap: () => shift(1) });

  return (
    <button {...galleryUi} {...press} class={styles.control} onWheel={wheel}>
      {String(props.studio.value(props.setting.key))}
    </button>
  );
}

/** A toggle setting as a switch with its label, lit when on. */
function ToggleButton(props: { studio: Studio; setting: Setting }) {
  const on = () => props.studio.value(props.setting.key) === true;
  const press = pressHandlers({ tap: () => props.studio.setValue(props.setting.key, !on()) });

  return (
    <button {...galleryUi} {...press} class={[styles.control, styles.toggle, { [styles.on!]: on() }]}>
      <i />
      {props.setting.label}
    </button>
  );
}

/** The setting as a number setting, if it is one. */
function numberOf(setting: Setting) {
  return setting.kind === 'number' ? setting : undefined;
}

const cellSize = 36;
const cellPitch = 38;
/** Padding of the row's capsule around the cells. */
const rowInset = 3;
/** Gap between the pen and the bottom of the row. */
const rowGap = 14;
const settingPitch = 30;
