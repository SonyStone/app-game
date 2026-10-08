import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, Show, untrack } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { palette, presets, tools, type Setting } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import { navigationDrag, type NavigationKind } from '../../kit/navigationDrag';
import { pressHandlers } from '../../kit/pressHandlers';
import { formatValue, nearestPreset, type NumberSetting } from '../../kit/values';
import { galleryUi, type VariantProps } from '../../kit/variant';
import { LayersPanel } from './LayersPanel';
import { extrasGap, Pie, type PieDefinition, type PieItem } from './Pie';
import styles from './pie.module.css';
import { arrowDirection, directionAt, keypadDirections, mirrored, type Direction } from './pieGeometry';
import { ChoiceField, ColorWheel, ToggleField, ValueField } from './widgets';

/**
 * Pie menus all the way down, after Blender's pie menus and Maya's marking menus: everything is chosen by direction,
 * so a target is a whole 45° wedge of the screen and an expert can flick without looking.
 *
 * - The main pie holds the Puck: Undo and Redo up, Zoom and Rotate down, the middle drags to pan. Tools, Color, Brush
 *   and Layers open submenus under the pointer: a pie of tools, a pie of recent colors around a color wheel, a pie of
 *   presets with the tool's settings under it (tapping a value opens a pie of preset values), and Blender's layer list
 *   as a popover.
 * - Choosing: hover a direction and click or tap anywhere in it, or press anywhere, slide into a direction and lift
 *   (a mark), or release Space or the opening press (right button, long press) in it. Number keys choose as on a
 *   keypad (8 up, 4 left), arrows point, Enter runs, Esc and Backspace go back.
 * - Zoom and Rotate follow a press while it lasts; chosen by a key or a release they follow the hovering pointer until
 *   the next click, as Blender's modal operators do.
 */
export function PieVariant(props: VariantProps) {
  const studio = props.studio;
  const navigation = navigationDrag(studio);
  const pies = buildPies();
  const touch = () => props.summon?.pointerType === 'touch';
  /** Each opening starts again from the main pie; a mode change of the same opening (hold to toggle) keeps the state. */
  const opening = createMemo(() => props.summon?.serial);
  const [open, setOpen] = createSignal<Open | undefined>(() =>
    opening() === undefined
      ? undefined
      : pieAt(
          pies.main,
          untrack(() => props.summon!.at)
        )
  );
  const [stack, setStack] = createSignal<readonly Open[]>(() => (opening(), []));
  const [highlight, setHighlight] = createSignal<Direction | undefined>(() => (opening(), undefined));
  const [operation, setOperation] = createSignal<Operation | undefined>(() => (opening(), undefined));
  const [flash, setFlash] = createSignal<{ id: string; count: number }>();
  /** The catcher's press in progress: in the middle (a pan or a tap) or a mark toward a direction. */
  let press: { id: number; kind: 'center' | 'mark'; start: Point } | undefined;
  const heldArrows = new Set<string>();

  const items = (definition: PieDefinition) =>
    props.hand === 'right' && definition === pies.main ? mirrorItems(definition.items) : definition.items;
  const itemAt = (direction: Direction | undefined) => {
    const current = open();
    return direction === undefined || current?.kind !== 'pie' ? undefined : items(current.definition)[direction];
  };

  props.onHoldRelease(() => {
    if (operation()) {
      endOperation();
      return false;
    }

    const item = itemAt(highlight());
    return item ? activate(item, props.pointer, 'release') : false;
  });
  setupInput();

  return (
    <Show when={props.summon && open()}>
      {(current) => (
        <div class={[styles.root, { [styles.hidden!]: props.hidden }]}>
          <div
            class={[styles.catcher, { [styles.dragging!]: !!operation() }]}
            {...galleryUi}
            onPointerDown={pressCatcher}
            onPointerMove={moveCatcher}
            onPointerUp={liftCatcher}
            onPointerCancel={() => {
              press = undefined;
              endOperation();
            }}
          />
          <Show when={!operation()}>
            <Show when={current().kind === 'pie' && (current() as PieOpen)}>
              {(pie) => (
                <Pie
                  definition={{ ...pie().definition, items: items(pie().definition) }}
                  center={pie().center}
                  highlight={highlight()}
                  flash={flash()}
                  pointer={touch() ? undefined : props.pointer}
                  touch={touch()}
                />
              )}
            </Show>
            <Show when={current().kind === 'layers' && (current() as LayersOpen)}>
              {(layers) => <LayersPanel studio={studio} at={layers().at} touch={touch()} />}
            </Show>
          </Show>
          <Show when={operation()}>
            {(running) => (
              <div class={styles.hud} style={{ left: `${props.pointer.x + 18}px`, top: `${props.pointer.y + 18}px` }}>
                <b>
                  {running().kind === 'pan'
                    ? 'Pan'
                    : running().kind === 'zoom'
                      ? `Zoom ${Math.round(studio.view().scale * 100)}%`
                      : `Rotate ${Math.round(studio.view().angle)}°`}
                </b>
                <span>{running().modal ? 'click to confirm' : 'lift to confirm'}</span>
              </div>
            )}
          </Show>
        </div>
      )}
    </Show>
  );

  /**
   * Runs a pie item. Submenus open under `at`; actions run, and all but Undo and Redo finish the opening; Zoom and
   * Rotate start following the hovering pointer. Returns whether the variant should stay open after a Space release.
   */
  function activate(item: PieItem, at: Point, via: 'press' | 'release' | 'key'): boolean {
    if (item.disabled) {
      return false;
    }

    if (item.kind === 'menu') {
      const current = open();
      item.open(via === 'key' && current?.kind === 'pie' ? current.center : at);
      return true;
    }

    if (item.kind === 'action') {
      item.run();
      setFlash((last) => ({ id: item.id, count: (last?.count ?? 0) + 1 }));
      if (!item.repeat) {
        finish();
        return false;
      }

      return via !== 'release';
    }

    if (touch()) {
      // A finger cannot hover, so a navigation chosen without a press waits for a drag on its item.
      studio.notify(`Drag on ${item.label} to ${item.label.toLowerCase()}`);
      return true;
    }

    startOperation(item.navigation, at, true);
    return true;
  }

  /**
   * A finished choice: a toggled opening closes; a held or pinned one goes back to the main pie. The mode is read
   * before `done`, whose write would read stale in this same event.
   */
  function finish() {
    const mode = props.summon?.mode;
    const first = stack()[0] ?? open();
    props.done();
    if (mode !== 'toggle' && first?.kind === 'pie') {
      setStack([]);
      setHighlight(undefined);
      setOpen(pieAt(pies.main, first.center));
    }
  }

  function push(next: Open) {
    const current = open();
    if (current) {
      setStack((list) => [...list, current]);
    }

    setHighlight(undefined);
    setOpen(next);
  }

  /** Goes back to the pie this one was opened from; returns whether there was one. */
  function back() {
    const list = stack();
    const previous = list.at(-1);
    if (!previous) {
      return false;
    }

    setStack(list.slice(0, -1));
    setHighlight(undefined);
    setOpen(previous);
    return true;
  }

  /** Starts a navigation at `at`; zoom and rotation pivot on the pie's middle, where the pie was opened. */
  function startOperation(kind: NavigationKind, at: Point, modal: boolean) {
    const current = open();
    const pivot = current?.kind === 'pie' && kind !== 'pan' ? current.center : undefined;
    navigation.start(kind, at, pivot);
    setOperation({ kind, modal });
  }

  /** Ends the navigation in progress; a finished navigation is an action like any other. */
  function endOperation() {
    if (!operation()) {
      return;
    }

    navigation.end();
    setOperation(undefined);
    finish();
  }

  /** A press on the catcher, which covers the window behind the pie: it confirms, pans, marks or closes. */
  function pressCatcher(event: PointerEvent) {
    if ((event.pointerType === 'mouse' && event.button !== 0) || press) {
      return;
    }

    event.preventDefault();
    const at = { x: event.clientX, y: event.clientY };
    if (operation()?.modal) {
      endOperation();
      return;
    }

    const current = open();
    if (current?.kind !== 'pie') {
      props.close();
      return;
    }

    const distance = Math.hypot(at.x - current.center.x, at.y - current.center.y);
    if (distance > current.definition.radius + reachBeyond) {
      props.close();
      return;
    }

    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    if (distance < current.definition.dead) {
      press = { id: event.pointerId, kind: 'center', start: at };
      return;
    }

    const direction = directionAt(at.x - current.center.x, at.y - current.center.y);
    const item = itemAt(direction);
    setHighlight(direction);
    press = { id: event.pointerId, kind: 'mark', start: at };
    if (item?.kind === 'drag') {
      startOperation(item.navigation, at, false);
    }
  }

  function moveCatcher(event: PointerEvent) {
    if (press?.id !== event.pointerId) {
      return;
    }

    const at = { x: event.clientX, y: event.clientY };
    if (operation()) {
      navigation.move(at, event.shiftKey);
      return;
    }

    if (press.kind === 'center') {
      if (Math.hypot(at.x - press.start.x, at.y - press.start.y) > 6) {
        startOperation('pan', press.start, false);
        navigation.move(at);
      }

      return;
    }

    markToward(at);
  }

  function liftCatcher(event: PointerEvent) {
    if (press?.id !== event.pointerId) {
      return;
    }

    const ended = press;
    press = undefined;
    if (operation()) {
      endOperation();
      return;
    }

    if (ended.kind === 'center') {
      // A tap in the middle goes back, or closes the main pie.
      if (!back()) {
        props.close();
      }

      return;
    }

    const item = itemAt(highlight());
    if (item) {
      activate(item, { x: event.clientX, y: event.clientY }, 'press');
    }
  }

  /**
   * A press or the opening press moves: the direction it points at lights up, and sliding far into Zoom or Rotate
   * starts them, as entering a marking menu's item does.
   */
  function markToward(at: Point) {
    const current = open();
    if (current?.kind !== 'pie') {
      return;
    }

    const dx = at.x - current.center.x;
    const dy = at.y - current.center.y;
    const distance = Math.hypot(dx, dy);
    const direction = distance < current.definition.dead ? undefined : directionAt(dx, dy);
    setHighlight(direction);
    const item = itemAt(direction);
    if (item?.kind === 'drag' && distance > current.definition.radius * 0.8) {
      startOperation(item.navigation, at, false);
    }
  }

  /**
   * Hover, the opening press and keys, on the window: hovering lights the direction the pointer points at (not over a
   * widget); a modal navigation follows the pointer; the opening press (right button, long press) marks and chooses
   * on release; keys choose, point and go back.
   */
  function setupInput() {
    let heldMoved = false;
    /** The opening whose press has lifted: the mouse and the pen reuse its pointer id for later presses. */
    let liftedFor: number | undefined;
    const holding = (event: PointerEvent) =>
      props.summon?.heldPointer === event.pointerId && liftedFor !== props.summon.serial;

    createEventListener(window, 'pointermove', (event) => {
      const at = { x: event.clientX, y: event.clientY };
      if (operation()?.modal) {
        navigation.move(at, event.shiftKey);
        return;
      }

      if (holding(event)) {
        const current = open();
        if (
          current?.kind === 'pie' &&
          Math.hypot(at.x - current.center.x, at.y - current.center.y) > current.definition.dead
        ) {
          heldMoved = true;
        }

        if (operation()) {
          navigation.move(at, event.shiftKey);
        } else if (heldMoved) {
          markToward(at);
        }

        return;
      }

      const current = open();
      if (press || event.pointerType === 'touch' || operation() || current?.kind !== 'pie') {
        return;
      }

      if (event.target instanceof Element && event.target.closest('[data-pie-widget]')) {
        setHighlight(undefined);
        return;
      }

      const dx = at.x - current.center.x;
      const dy = at.y - current.center.y;
      setHighlight(Math.hypot(dx, dy) < current.definition.dead ? undefined : directionAt(dx, dy));
    });
    createEventListener(window, 'pointerup', (event) => {
      if (!holding(event)) {
        return;
      }

      liftedFor = props.summon!.serial;
      const moved = heldMoved;
      heldMoved = false;
      if (operation() && !operation()!.modal) {
        endOperation();
        return;
      }

      // Lifting the opening press in a direction chooses it; lifting it where it began leaves the pie open.
      const item = moved ? itemAt(highlight()) : undefined;
      if (item) {
        activate(item, { x: event.clientX, y: event.clientY }, 'release');
      }
    });
    createEventListener(
      window,
      'keydown',
      (event) => {
        const current = open();
        if (!props.summon || !current || event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        const consume = () => {
          event.preventDefault();
          event.stopPropagation();
        };
        if (event.key === 'Escape') {
          if (operation()) {
            consume();
            endOperation();
          } else if (back()) {
            consume();
          }

          return;
        }

        if (event.key === 'Backspace') {
          consume();
          back();
          return;
        }

        if (current.kind !== 'pie' || event.repeat) {
          return;
        }

        const digit = event.code.replace(/^(Digit|Numpad)/, '');
        const direction = /^\d$/.test(digit) ? keypadDirections[digit] : undefined;
        if (direction !== undefined) {
          const item = itemAt(direction);
          if (item) {
            consume();
            setHighlight(direction);
            activate(item, props.pointer, 'key');
          }

          return;
        }

        if (event.key.startsWith('Arrow')) {
          consume();
          heldArrows.add(event.key);
          setHighlight(arrowDirection(heldArrows));
          return;
        }

        if (event.key === 'Enter') {
          const item = itemAt(highlight());
          if (item) {
            consume();
            activate(item, current.center, 'key');
          }

          return;
        }

        const letter = current.definition.letters?.[event.code];
        if (letter) {
          consume();
          activate(letter(), props.pointer, 'key');
        }
      },
      { capture: true }
    );
    createEventListener(window, 'keyup', (event) => {
      heldArrows.delete(event.key);
    });
  }

  /** A pie's opening at `at`, moved so that the whole pie fits in the window. */
  function pieAt(definition: PieDefinition, at: Point): PieOpen {
    const side = definition.radius + (definition.wide ? 190 : 150);
    const above = definition.radius + 60;
    const below = definition.radius + extrasGap(definition, touch()) + (definition.extrasHeight ?? 0) + 12;
    const clamp = (value: number, low: number, high: number) =>
      low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
    return {
      kind: 'pie',
      definition,
      center: { x: clamp(at.x, side + 8, innerWidth - side - 8), y: clamp(at.y, above + 52, innerHeight - below - 8) }
    };
  }

  /**
   * The pies, built once with getters, so that values change in place and a widget being dragged in a pie keeps its
   * element. The value pie is built when a value is tapped.
   */
  function buildPies() {
    const toolPie: PieDefinition = {
      title: 'Tools',
      radius: 96,
      dead: 22,
      items: Object.fromEntries(
        toolOrder.map((id, index) => {
          const tool = tools.find((entry) => entry.id === id)!;
          const item: PieItem = {
            id: `tool-${id}`,
            label: tool.label,
            icon: tool.icon,
            kind: 'action',
            run: () => studio.setTool(id),
            get active() {
              return studio.tool() === id;
            }
          };
          return [toolDirections[index]!, item];
        })
      ),
      letters: Object.fromEntries(
        tools.map((tool) => {
          const item: PieItem = {
            id: `tool-${tool.id}`,
            label: tool.label,
            kind: 'action',
            run: () => studio.setTool(tool.id)
          };
          return [`Key${tool.key}`, () => item];
        })
      )
    };

    const swap: PieItem = { id: 'swap', label: 'Swap', kind: 'action', repeat: true, run: studio.swapColors };
    const colorPie: PieDefinition = {
      title: 'Color',
      radius: 118,
      dead: 80,
      extrasHeight: 92,
      items: Object.fromEntries(
        recentDirections.map((direction, index) => {
          const item: PieItem = {
            id: `recent-${index}`,
            kind: 'action',
            get label() {
              return (studio.recent()[index] ?? '').replace('#', '').toUpperCase();
            },
            get swatch() {
              return studio.recent()[index];
            },
            get disabled() {
              return !studio.recent()[index];
            },
            run: () => studio.chooseColor(studio.recent()[index]!)
          };
          return [direction, item];
        })
      ),
      center: () => (
        <ColorWheel color={studio.color()} size={132} onChange={studio.setColor} onCommit={studio.commitColor} />
      ),
      extras: () => (
        <div class={styles.colorExtras} data-pie-widget>
          <div class={styles.swapRow}>
            <span class={styles.bigSwatch} style={{ background: studio.color() }} title="Current color" />
            <button class={styles.textButton} {...tapHandlers(studio.swapColors)}>
              ⇄ Swap <kbd>X</kbd>
            </button>
            <span class={styles.bigSwatch} style={{ background: studio.previous() }} title="Previous color" />
          </div>
          <div class={styles.palette}>
            <For each={palette}>
              {(color) => (
                <button
                  class={styles.paletteSwatch}
                  style={{ background: color }}
                  title={color}
                  {...tapHandlers(() => {
                    studio.chooseColor(color);
                    finish();
                  })}
                />
              )}
            </For>
          </div>
        </div>
      ),
      letters: { KeyX: () => swap }
    };

    const brushPie: PieDefinition = {
      title: 'Brush',
      radius: 128,
      dead: 22,
      wide: true,
      get extrasHeight() {
        return Math.ceil(studio.settings().length / 2) * 30;
      },
      items: Object.fromEntries(
        brushPresetOrder.map((id, index) => {
          const preset = presets.find((entry) => entry.id === id)!;
          const item: PieItem = {
            id: `preset-${id}`,
            label: preset.name,
            preset,
            kind: 'action',
            run: () => studio.choosePreset(id),
            get active() {
              return studio.preset() === id;
            }
          };
          return [presetDirections[index]!, item];
        })
      ),
      extras: () => (
        <div class={styles.settingsGrid} data-pie-widget>
          <For each={studio.settings()} keyed={(setting) => setting.key}>
            {(setting) => <SettingField setting={setting()} />}
          </For>
        </div>
      )
    };

    const main: PieDefinition = {
      title: 'Puck',
      radius: 106,
      dead: 24,
      extrasHeight: 34,
      items: {
        6: {
          id: 'color',
          label: 'Color',
          kind: 'menu',
          get swatch() {
            return studio.color();
          },
          open: (at) => push(pieAt(colorPie, at))
        },
        2: {
          id: 'brush',
          label: 'Brush',
          icon: 'brush',
          kind: 'menu',
          get detail() {
            return (
              presets.find((preset) => preset.id === studio.preset())?.name ??
              `${formatValue(studio.number('size'))} px`
            );
          },
          open: (at) => push(pieAt(brushPie, at))
        },
        4: {
          id: 'tools',
          label: 'Tools',
          kind: 'menu',
          get icon() {
            return studio.toolInfo().icon;
          },
          get detail() {
            return studio.toolInfo().label;
          },
          open: (at) => push(pieAt(toolPie, at))
        },
        0: {
          id: 'layers',
          label: 'Layers',
          icon: 'layers',
          kind: 'menu',
          get detail() {
            return studio.layers().find((layer) => layer.id === studio.activeLayer())?.name;
          },
          open: (at) => push({ kind: 'layers', at })
        },
        5: {
          id: 'undo',
          label: 'Undo',
          icon: 'undo',
          kind: 'action',
          repeat: true,
          run: studio.undo,
          get detail() {
            return `${studio.history().done}`;
          },
          get disabled() {
            return !studio.canUndo();
          }
        },
        7: {
          id: 'redo',
          label: 'Redo',
          icon: 'redo',
          kind: 'action',
          repeat: true,
          run: studio.redo,
          get detail() {
            return `${studio.history().undone}`;
          },
          get disabled() {
            return !studio.canRedo();
          }
        },
        3: {
          id: 'zoom',
          label: 'Zoom',
          icon: 'zoom',
          kind: 'drag',
          navigation: 'zoom',
          get detail() {
            return `${Math.round(studio.view().scale * 100)}%`;
          }
        },
        1: {
          id: 'rotate',
          label: 'Rotate',
          icon: 'rotate',
          kind: 'drag',
          navigation: 'rotate',
          get detail() {
            return `${Math.round(studio.view().angle)}°`;
          }
        }
      },
      center: () => (
        <span class={styles.panHint} title="Drag the middle to pan">
          <SketchIcon name="pan" size={18} />
        </span>
      ),
      extras: () => (
        <div class={styles.viewRow} data-pie-widget>
          <ViewButton icon="fullscreen" label="Fit" onTap={studio.fit} />
          <ViewButton icon="mirror" label="Flip" active={studio.view().flipped} onTap={studio.flip} />
          <ViewButton icon="symmetry" label="Symmetry" active={studio.symmetry()} onTap={studio.toggleSymmetry} />
          <ViewButton icon="reset" label="Straighten" onTap={() => studio.rotateTo(0)} />
        </div>
      ),
      letters: {
        KeyT: () => main.items[4]!,
        KeyC: () => main.items[6]!,
        KeyB: () => main.items[2]!,
        KeyL: () => main.items[0]!
      }
    };

    return { main };

    /** A setting of the current tool in the brush pie's extras: Blender's slider, dropdown or checkbox. */
    function SettingField(fieldProps: { setting: Setting }) {
      const setting = () => fieldProps.setting;
      return (
        <>
          <Show when={setting().kind === 'number' && (setting() as NumberSetting)}>
            {(number) => (
              <ValueField
                setting={number()}
                value={studio.number(number().key)}
                onChange={(value) => studio.setValue(number().key, value)}
                onTap={(at) => push(pieAt(valuePie(number()), at))}
              />
            )}
          </Show>
          <Show when={setting().kind === 'choice' && (setting() as Extract<Setting, { kind: 'choice' }>)}>
            {(choice) => (
              <ChoiceField
                label={choice().label}
                options={choice().options}
                value={String(studio.value(choice().key))}
                onChange={(value) => studio.setValue(choice().key, value)}
              />
            )}
          </Show>
          <Show when={setting().kind === 'toggle' && setting()}>
            {(toggle) => (
              <ToggleField
                label={toggle().label}
                value={studio.value(toggle().key) === true}
                onChange={(value) => studio.setValue(toggle().key, value)}
              />
            )}
          </Show>
        </>
      );
    }
  }

  /**
   * A pie of eight preset values around the current one, ascending clockwise from the left, opened by a tap on a
   * value; choosing one sets it and goes back to the brush pie.
   */
  function valuePie(setting: NumberSetting): PieDefinition {
    const nearest = nearestPreset(setting, studio.number(setting.key));
    const first = Math.max(0, Math.min(setting.presets.length - 8, nearest - 3));
    const values = setting.presets.slice(first, first + 8);
    return {
      title: setting.label,
      radius: 88,
      dead: 30,
      items: Object.fromEntries(
        values.map((value, index) => {
          const item: PieItem = {
            id: `value-${value}`,
            label: `${formatValue(value)} ${setting.unit}`,
            kind: 'action',
            repeat: true,
            run: () => {
              studio.setValue(setting.key, value);
              back();
            },
            get active() {
              return studio.number(setting.key) === value;
            },
            ...(setting.key === 'size' ? { dot: Math.max(2, Math.min(22, value * studio.view().scale)) } : {})
          };
          return [valueDirections[index]!, item];
        })
      ),
      center: () => (
        <span class={styles.valueCenter}>
          {formatValue(studio.number(setting.key))}
          <small>{setting.unit}</small>
        </span>
      )
    };
  }

  function ViewButton(buttonProps: { icon: SketchIconName; label: string; active?: boolean; onTap: () => void }) {
    return (
      <button
        class={[styles.viewButton, { [styles.active!]: !!buttonProps.active }]}
        title={buttonProps.label}
        {...tapHandlers(buttonProps.onTap)}
      >
        <SketchIcon name={buttonProps.icon} size={16} />
        <span>{buttonProps.label}</span>
      </button>
    );
  }
}

/** What is open: a pie at its center, or the layers popover. */
type PieOpen = { kind: 'pie'; definition: PieDefinition; center: Point };
type LayersOpen = { kind: 'layers'; at: Point };
type Open = PieOpen | LayersOpen;

/** A navigation in progress: following a press (`modal: false`) or the hovering pointer until the next click. */
type Operation = { kind: NavigationKind; modal: boolean };

/** Press handlers for a small button: it runs on a tap, or on a lift that slid but is still over the button. */
function tapHandlers(run: () => void) {
  return pressHandlers({
    tap: run,
    end: (press) => {
      if (press.target.contains(document.elementFromPoint(press.point.x, press.point.y))) {
        run();
      }
    }
  });
}

/** Swaps the left and right items, so that tools sit on the right for a right hand. */
function mirrorItems(items: PieDefinition['items']) {
  return Object.fromEntries(
    Object.entries(items).map(([direction, item]) => [mirrored(Number(direction) as Direction), item])
  ) as PieDefinition['items'];
}

/** CSS pixels beyond the item circle within which a press still chooses a direction; farther presses close. */
const reachBeyond = 230;

const toolOrder = ['brush', 'eraser', 'picker', 'gradient', 'fill', 'transform', 'lasso', 'mixer'] as const;
/** The brush up, eraser and picker to its right, selection and transform to the left, the mixer up-left. */
const toolDirections: readonly Direction[] = [6, 7, 0, 1, 2, 3, 4, 5];

const brushPresetOrder = ['g-pen', 'fineliner', 'pencil', 'marker', 'gouache', 'flat', 'airbrush', 'blender'] as const;
const presetDirections: readonly Direction[] = [5, 6, 7, 0, 1, 2, 3, 4];

/** Recent colors, newest at the left, going clockwise. */
const recentDirections: readonly Direction[] = [4, 5, 6, 7, 0, 1, 2, 3];

/** Ascending clockwise from the left. */
const valueDirections: readonly Direction[] = [4, 5, 6, 7, 0, 1, 2, 3];
