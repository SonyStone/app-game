import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, Match, onCleanup, onSettled, Show, Switch, untrack } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { blendLabel, type Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { navigationDrag, type NavigationKind } from '../../kit/navigationDrag';
import { pressHandlers } from '../../kit/pressHandlers';
import { StrokePreview } from '../../kit/StrokePreview';
import { formatValue } from '../../kit/values';
import { galleryUi, type Summon, type VariantProps } from '../../kit/variant';
import {
  buildList,
  colorEntry,
  groups,
  modKey,
  type GroupId,
  type ListItem,
  type Preview,
  type RecentEntry,
  type Row
} from './commandRows';
import styles from './CommandVariant.module.css';

/**
 * The Command variant: a command palette that opens under the pointer, after Raycast, Figma's quick actions and
 * Nuke's Tab menu. A search field on top (focused only for the keyboard and the mouse, so that a pen or a finger
 * does not raise the on-screen keyboard), the Puck as a row of big chips, and one grouped list of everything else
 * that a query filters fuzzily and that understands typed commands with arguments ("size 40", "#ff8800",
 * "blend multiply"). Numeric rows are scrubbers: a sideways drag on the row changes the value.
 *
 * Opens anew (empty query, top of the list) for every summon; Recent survives openings.
 */
export function CommandVariant(props: VariantProps) {
  const recent = createRecent();
  const opening = createMemo(() => props.summon?.serial);
  // Space opens the palette held; the user may go on typing, so lifting Space keeps it open as a toggle.
  untrack(() => props.onHoldRelease)(() => true);

  return (
    <Show when={opening()} keyed>
      {(serial) => <Palette variant={props} recent={recent} serial={serial} />}
    </Show>
  );
}

/** The last five rows the palette ran, newest first, in memory for the variant's lifetime. */
function createRecent() {
  const [entries, setEntries] = createSignal<readonly RecentEntry[]>([]);
  return {
    entries,
    /** Moves `entry` to the front, dropping an older copy of it. */
    remember(entry: RecentEntry) {
      setEntries((list) => [entry, ...list.filter((other) => other.id !== entry.id)].slice(0, 5));
    }
  };
}

type Recent = ReturnType<typeof createRecent>;

/**
 * One opening of the palette: placed at the summon point (beside it on the pen hand's side, centered for gallery
 * openings), with its own query and selection.
 */
function Palette(props: {
  variant: VariantProps;
  recent: Recent;
  /** The opening this palette shows; a new one remounts it. */
  serial: number;
}) {
  const variant = props.variant;
  const studio = untrack(() => variant.studio);
  const opened = untrack(() => variant.summon!);
  const hand = untrack(() => variant.hand);
  const directInput = opened.pointerType === 'pen' || opened.pointerType === 'touch';
  const navigation = navigationDrag(studio);

  const [query, setQuery] = createSignal('');
  /** The query came from a chip (a layer's blend chip), so running a result goes back to the full list. */
  const [drilled, setDrilled] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<string>();
  const [pressedId, setPressedId] = createSignal<string>();
  const [scrubbingId, setScrubbingId] = createSignal<string>();
  /** Each swatch row's keyboard cursor. */
  const [cursors, setCursors] = createSignal<Readonly<Record<string, number>>>({});
  const [keyboardUsed, setKeyboardUsed] = createSignal(false);
  const [navigating, setNavigating] = createSignal<{ kind: NavigationKind; at: Point; moved: boolean }>();
  const [viewport, setViewport] = createSignal({ width: innerWidth, height: innerHeight });

  const ui = {
    openQuery(text: string, selectId?: string) {
      setQuery(text);
      setSelectedId(selectId);
      setDrilled(true);
      list.scrollTop = 0;
      if (selectId) {
        // Once the new list is in place.
        requestAnimationFrame(() => select(selectId, 'down'));
      }
    }
  };
  const items = createMemo(() => buildList(studio, query(), props.recent.entries(), ui));
  const rows = createMemo(() => items().filter((item) => item.row));
  const selected = createMemo(() => rows().find((item) => item.id === selectedId()) ?? rows()[0]);
  const place = createMemo(() => placePanel(opened, viewport(), hand));

  let input!: HTMLInputElement;
  let list!: HTMLDivElement;
  let lastHover: Point = { x: -1, y: -1 };
  let wheelRow: string | undefined;
  let wheelSum = 0;

  createEventListener(window, 'resize', () => setViewport({ width: innerWidth, height: innerHeight }));
  createEventListener(window, 'keydown', onKeyDown, { capture: true });
  onSettled(() => {
    if (directInput) {
      return;
    }

    // After the opening press's own focus handling, which would blur the field again.
    const timer = setTimeout(() => input.focus({ preventScroll: true }), 0);
    return () => clearTimeout(timer);
  });

  const settle = createSettle();
  const fling = createFling(() => list);
  const repeat = createRepeat();
  const listPress = createListPress();
  // Handlers are created once: a spread re-evaluates with the element's reactive class, and fresh handlers would
  // forget the press in progress (a drag would stop, a held Undo would never stop repeating).
  const chipPress = {
    pan: navigationPress('pan'),
    zoom: navigationPress('zoom'),
    rotate: navigationPress('rotate'),
    undo: repeat.press(() => studio.undo()),
    redo: repeat.press(() => studio.redo()),
    fit: pressHandlers({ tap: () => finishWith(() => studio.fit()) }),
    flip: pressHandlers({ tap: () => finishWith(() => studio.flip()) }),
    clear: pressHandlers({ tap: () => resetQuery() })
  };

  return (
    <>
      <div
        {...galleryUi}
        class={[styles.panel, { [styles.fading!]: navigating()?.moved === true }]}
        style={{
          left: `${place().left}px`,
          top: `${place().top}px`,
          width: `${place().width}px`,
          'max-height': `${place().height}px`,
          visibility: variant.hidden ? 'hidden' : undefined
        }}
      >
        <div class={styles.search}>
          <SearchGlyph />
          <input
            {...galleryUi}
            ref={input}
            class={styles.input}
            value={query()}
            placeholder="Search, or type size 40 · #e0703a · blend…"
            spellcheck={false}
            autocomplete="off"
            enterkeyhint="go"
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedId(undefined);
              setDrilled(false);
              list.scrollTop = 0;
            }}
          />
          <Show
            when={query()}
            fallback={
              <Show when={!directInput}>
                <kbd class={styles.kbd}>esc</kbd>
              </Show>
            }
          >
            <div {...galleryUi} class={styles.clear} title="Clear" {...chipPress.clear}>
              <SketchIcon name="close" size={14} />
            </div>
          </Show>
        </div>

        <div class={styles.puck}>
          <For each={navigationChips}>
            {(chip) => (
              <div
                {...galleryUi}
                class={[styles.chip, { [styles.pressed!]: navigating()?.kind === chip.kind }]}
                title={`${chip.label}: press and drag`}
                {...chipPress[chip.kind]}
              >
                <SketchIcon name={chip.icon} size={18} />
                <span>{chip.label}</span>
              </div>
            )}
          </For>
          <span class={styles.divider} />
          <div
            {...galleryUi}
            class={[styles.chip, { [styles.disabled!]: !studio.canUndo() }]}
            title={`Undo (${modKey}Z); hold to repeat`}
            {...chipPress.undo}
          >
            <SketchIcon name="undo" size={18} />
            <span>Undo</span>
            <small class={styles.count}>{studio.history().done || ''}</small>
          </div>
          <div
            {...galleryUi}
            class={[styles.chip, { [styles.disabled!]: !studio.canRedo() }]}
            title={`Redo (⇧${modKey}Z); hold to repeat`}
            {...chipPress.redo}
          >
            <SketchIcon name="redo" size={18} />
            <span>Redo</span>
            <small class={styles.count}>{studio.history().undone || ''}</small>
          </div>
          <span class={styles.divider} />
          <div {...galleryUi} class={styles.chip} title="Fit to screen" {...chipPress.fit}>
            <SketchIcon name="fullscreen" size={18} />
            <span>Fit</span>
          </div>
          <div
            {...galleryUi}
            class={[styles.chip, { [styles.on!]: studio.view().flipped }]}
            title="Flip the view"
            {...chipPress.flip}
          >
            <SketchIcon name="mirror" size={18} />
            <span>Flip</span>
          </div>
        </div>

        <div class={styles.scopes}>
          <For each={scopes}>
            {(scope) => {
              const press = pressHandlers({ tap: () => jumpTo(scope.id) });
              return (
                <div
                  {...galleryUi}
                  class={[
                    styles.scope,
                    {
                      [styles.on!]: selected()?.group === scope.id,
                      [styles.disabled!]: !rows().some((item) => item.group === scope.id)
                    }
                  ]}
                  {...press}
                >
                  {scope.label}
                </div>
              );
            }}
          </For>
        </div>

        <div
          {...galleryUi}
          ref={list}
          class={styles.list}
          {...listPress}
          onPointerMove={(event) => {
            listPress.onPointerMove(event);
            hover(event);
          }}
          onWheel={wheel}
        >
          <For each={items()} keyed={(item) => item.id}>
            {(item) => (
              <Show
                when={item().row}
                fallback={
                  <div class={styles.header} data-header="">
                    {item().header?.label}
                    <Show when={item().header?.detail}>{(detail) => <small>{detail()}</small>}</Show>
                  </div>
                }
              >
                <RowView
                  item={item()}
                  studio={studio}
                  selected={selected()?.id === item().id}
                  pressed={pressedId() === item().id}
                  scrubbing={scrubbingId() === item().id}
                  cursor={keyboardUsed() && selected()?.id === item().id ? cursorOf(item()) : undefined}
                />
              </Show>
            )}
          </For>
          <Show when={rows().length === 0}>
            <div class={styles.empty}>No matches for “{query().trim()}”</div>
          </Show>
        </div>

        <div class={styles.footer}>
          <span class={styles.status}>
            <span class={styles.dot} style={{ background: studio.color() }} />
            {studio.toolInfo().label}
            <Show when={studio.number('size') > 0}>
              <span class={styles.muted}>{formatValue(studio.number('size'))} px</span>
            </Show>
          </span>
          <span class={styles.hint}>
            {selected()?.row?.hint}
            <Show when={!directInput && selected()?.row}>
              <kbd class={styles.kbd}>{selected()?.row?.run ? '↵' : '← →'}</kbd>
            </Show>
          </span>
        </div>
      </div>

      <Show when={navigating()?.moved && navigating()}>
        {(active) => (
          <div class={styles.hud} style={{ left: `${active().at.x}px`, top: `${active().at.y}px` }}>
            {active().kind === 'pan'
              ? 'Pan'
              : active().kind === 'zoom'
                ? `${Math.round(studio.view().scale * 100)}%`
                : `${Math.round(studio.view().angle)}°`}
          </div>
        )}
      </Show>
    </>
  );

  /**
   * Keys while open, ahead of the gallery: arrows move and adjust, Tab jumps groups, Enter runs, Esc clears the
   * query and then closes, Ctrl+Z undoes even from the field, and any other character starts typing into the field.
   */
  function onKeyDown(event: KeyboardEvent) {
    // Android keyboards compose whole words: their Enter still runs the row, with the word already in the query.
    if (variant.hidden || (event.isComposing && event.key !== 'Enter')) {
      return;
    }

    const typing = document.activeElement === input;
    const mod = event.ctrlKey || event.metaKey;
    if (event.code === 'Space') {
      // The held Space's repeats would type spaces into the field.
      if (variant.summon?.mode === 'hold' && (event.repeat || typing)) {
        event.preventDefault();
      }

      return;
    }

    if (mod && (event.code === 'KeyZ' || event.code === 'KeyY')) {
      event.preventDefault();
      if (event.code === 'KeyY' || event.shiftKey) {
        studio.redo();
      } else {
        studio.undo();
      }

      return;
    }

    if (mod || event.altKey) {
      return;
    }

    const step = keySteps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      setKeyboardUsed(true);
      move(step);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      setKeyboardUsed(true);
      jump(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      activate(selected(), 'key');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (query()) {
        resetQuery();
      } else {
        variant.close();
      }

      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const item = selected();
      if (item?.row && (item.row.adjust || item.row.look.kind === 'swatches')) {
        event.preventDefault();
        setKeyboardUsed(true);
        adjust(item, event.key === 'ArrowLeft' ? -1 : 1);
      }

      return;
    }

    if (!typing && event.key.length === 1) {
      // Type to search: the character goes into the field rather than to the gallery's shortcuts.
      event.preventDefault();
      input.focus({ preventScroll: true });
      const next = query() + event.key;
      input.value = next;
      setQuery(next);
      setSelectedId(undefined);
      setDrilled(false);
      list.scrollTop = 0;
    }
  }

  /** Clears the query and leaves a chip's sub-list. */
  function resetQuery() {
    setQuery('');
    setSelectedId(undefined);
    setDrilled(false);
    list.scrollTop = 0;
  }

  /** Runs a finished action from the Puck row and reports it. */
  function finishWith(action: () => void) {
    action();
    resetQuery();
    variant.done();
  }

  /**
   * Runs a row: its action, then Recent remembers it and the palette reports a finished action, unless the row
   * repeats. Rows without an action only take the selection on a tap; Enter on them accepts and closes.
   */
  function activate(item: ListItem | undefined, via: 'key' | 'tap') {
    const row = item?.row;
    if (!item || !row || row.disabled) {
      return;
    }

    if (row.look.kind === 'swatches') {
      if (via === 'key') {
        pickSwatch(row, cursorOf(item));
      } else {
        select(item.id);
      }

      return;
    }

    if (!row.run) {
      if (via === 'key') {
        resetQuery();
        variant.done();
      } else {
        select(item.id);
      }

      return;
    }

    row.run();
    props.recent.remember({ id: row.id.replace(/^recent:/, ''), ...(row.recall ? { recall: row.recall } : {}) });
    if (row.repeats) {
      select(item.id);
      return;
    }

    if (drilled() && row.group === 'command') {
      resetQuery();
      return;
    }

    resetQuery();
    variant.done();
  }

  function pickSwatch(row: Row, index: number) {
    if (row.look.kind !== 'swatches') {
      return;
    }

    const color = row.look.colors[index];
    if (!color) {
      return;
    }

    row.look.choose(color);
    props.recent.remember(colorEntry(color));
    resetQuery();
    variant.done();
  }

  /** A swatch row's keyboard cursor: where ←/→ left it, else on the current color. */
  function cursorOf(item: ListItem) {
    const look = item.row?.look;
    if (look?.kind !== 'swatches') {
      return 0;
    }

    return cursors()[item.id] ?? Math.max(0, look.colors.indexOf(look.current));
  }

  /** ←/→, the wheel or a ‹ › button: steps the row's value, or a swatch row's cursor. */
  function adjust(item: ListItem, direction: 1 | -1) {
    const row = item.row;
    if (!row || row.disabled) {
      return;
    }

    if (row.look.kind === 'swatches') {
      const last = row.look.colors.length - 1;
      const next = Math.min(last, Math.max(0, cursorOf(item) + direction));
      setCursors((all) => ({ ...all, [item.id]: next }));
      return;
    }

    row.adjust?.(direction);
    if (row.scrub?.end) {
      settle.later(row.scrub.end);
    }
  }

  function move(by: number) {
    const list = rows();
    if (list.length === 0) {
      return;
    }

    const index = list.findIndex((item) => item.id === selected()?.id);
    const next = list[Math.min(list.length - 1, Math.max(0, index + by))]!;
    select(next.id, by < 0 ? 'up' : 'down');
  }

  /** Tab: the first row of the next (or previous) group, scrolled to the top with its header. */
  function jump(direction: 1 | -1) {
    const order = [...new Set(rows().map((item) => item.group))];
    if (order.length === 0) {
      return;
    }

    const at = Math.max(0, order.indexOf(selected()?.group ?? order[0]!));
    jumpTo(order[(at + direction + order.length) % order.length]!);
  }

  function jumpTo(group: GroupId) {
    const first = rows().find((item) => item.group === group);
    if (first) {
      select(first.id, 'top');
    }
  }

  /** Selects a row and, if asked, scrolls the list to show it: just enough, or with its header at the top. */
  function select(id: string, reveal?: 'up' | 'down' | 'top') {
    setSelectedId(id);
    if (!reveal) {
      return;
    }

    const element = list.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
    if (!element) {
      return;
    }

    const header = element.previousElementSibling?.matches('[data-header]')
      ? (element.previousElementSibling as HTMLElement)
      : undefined;
    const top = (reveal !== 'down' && header ? header : element).offsetTop - 4;
    const bottom = element.offsetTop + element.offsetHeight + 4;
    fling.stop();
    if (reveal === 'top' || top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }

  /** A hovering pen or mouse selects the row under it, but only when it really moves, not when rows scroll. */
  function hover(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.buttons !== 0) {
      return;
    }

    if (event.clientX === lastHover.x && event.clientY === lastHover.y) {
      return;
    }

    lastHover = { x: event.clientX, y: event.clientY };
    const id = (event.target as Element).closest<HTMLElement>('[data-row]')?.dataset.row;
    if (id && id !== selected()?.id) {
      setSelectedId(id);
      setKeyboardUsed(false);
    }
  }

  /**
   * The wheel on a row's value, or a sideways wheel anywhere on an adjustable row, steps it; other wheels scroll the
   * list. Trackpads' small deltas add up to a step.
   */
  function wheel(event: WheelEvent) {
    const target = event.target as Element;
    const id = target.closest<HTMLElement>('[data-row]')?.dataset.row;
    const item = id ? rows().find((entry) => entry.id === id) : undefined;
    if (!item?.row || !(item.row.adjust || item.row.look.kind === 'swatches')) {
      return;
    }

    const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!sideways && !target.closest('[data-part="value"]')) {
      return;
    }

    event.preventDefault();
    if (wheelRow !== item.id) {
      wheelRow = item.id;
      wheelSum = 0;
    }

    wheelSum += sideways ? event.deltaX : -event.deltaY;
    if (Math.abs(wheelSum) >= 40 || event.deltaMode !== 0) {
      adjust(item, wheelSum > 0 ? 1 : -1);
      wheelSum = 0;
    }
  }

  /**
   * Pan, Zoom and Rotate: press and drag. The palette fades out once the drag moves and reports a finished action
   * when it lifts; a tap only says how to use the chip.
   */
  function navigationPress(kind: NavigationKind) {
    const stop = () => {
      navigation.end();
      setNavigating(undefined);
    };
    return pressHandlers({
      start(press) {
        navigation.start(kind, press.point, kind === 'zoom' ? opened.at : undefined);
        setNavigating({ kind, at: press.point, moved: false });
      },
      move(press) {
        navigation.move(press.point, press.shift);
        setNavigating({ kind, at: press.point, moved: press.moved });
      },
      end() {
        stop();
        resetQuery();
        variant.done();
      },
      tap() {
        stop();
        studio.notify(`${navigationChips.find((chip) => chip.kind === kind)!.label}: press the chip and drag`);
      },
      cancel: stop
    });
  }

  /**
   * The list's presses, one handler for every row so that a drag survives rows being rebuilt: a drag that starts
   * sideways on a row with a value scrubs it, any other drag scrolls the list (with a fling), and a tap runs the
   * row or the part of it under the press (eye, blend chip, option, swatch, ‹ ›).
   */
  function createListPress() {
    let gesture:
      | {
          item?: ListItem;
          row?: HTMLElement;
          part?: string;
          index: number;
          mode?: 'scroll' | 'scrub';
          scrollTop: number;
          fraction: number;
          width: number;
          velocity: number;
          time: number;
        }
      | undefined;
    const clear = () => {
      gesture = undefined;
      setPressedId(undefined);
      setScrubbingId(undefined);
    };

    return pressHandlers({
      start(press, event) {
        fling.stop();
        const target = event.target as Element;
        const row = target.closest<HTMLElement>('[data-row]') ?? undefined;
        const part = target.closest<HTMLElement>('[data-part]');
        const item = row ? rows().find((entry) => entry.id === row.dataset.row) : undefined;
        gesture = {
          ...(item ? { item } : {}),
          ...(row ? { row } : {}),
          ...(part?.dataset.part ? { part: part.dataset.part } : {}),
          index: Number(part?.dataset.index ?? -1),
          scrollTop: list.scrollTop,
          fraction: 0,
          width: 1,
          velocity: 0,
          time: press.time
        };
        setPressedId(item?.id);
      },
      move(press, event) {
        if (!gesture) {
          return;
        }

        const dx = press.point.x - press.start.x;
        const dy = press.point.y - press.start.y;
        if (!gesture.mode) {
          if (!press.moved) {
            return;
          }

          const scrub = gesture.item?.row?.scrub;
          if (scrub && !gesture.item?.row?.disabled && Math.abs(dx) > Math.abs(dy)) {
            gesture.mode = 'scrub';
            gesture.width = Math.max(120, (gesture.row?.clientWidth ?? 300) - 24);
            // The move below adds this event's delta, so the whole way from the press counts.
            gesture.fraction = scrub.fraction + (dx - press.delta.x) / gesture.width;
            setScrubbingId(gesture.item!.id);
            setSelectedId(gesture.item!.id);
            setKeyboardUsed(false);
          } else {
            gesture.mode = 'scroll';
            setPressedId(undefined);
          }
        }

        if (gesture.mode === 'scrub') {
          const scrub = gesture.item!.row!.scrub!;
          gesture.fraction = Math.min(
            1,
            Math.max(0, gesture.fraction + (press.delta.x / gesture.width) * (press.shift ? 0.2 : 1))
          );
          scrub.setFraction(gesture.fraction);
          return;
        }

        list.scrollTop = gesture.scrollTop - dy;
        const elapsed = Math.max(1, event.timeStamp - gesture.time);
        gesture.velocity = gesture.velocity * 0.3 + (press.delta.y / elapsed) * 0.7;
        gesture.time = event.timeStamp;
      },
      end(_press, event) {
        if (gesture?.mode === 'scrub') {
          gesture.item?.row?.scrub?.end?.();
        } else if (gesture?.mode === 'scroll' && event.timeStamp - gesture.time < 80) {
          fling.start(gesture.velocity);
        }

        clear();
      },
      tap() {
        const ended = gesture;
        clear();
        if (ended?.item) {
          tapPart(ended.item, ended.part, ended.index);
        }
      },
      cancel() {
        if (gesture?.mode === 'scrub') {
          gesture.item?.row?.scrub?.end?.();
        }

        clear();
      }
    });
  }

  /** A tap on a row: on one of its parts, that part's own action; elsewhere, the row's. */
  function tapPart(item: ListItem, part: string | undefined, index: number) {
    const row = item.row;
    if (!row) {
      return;
    }

    setKeyboardUsed(false);
    const look = row.look;
    if (part === 'eye' && look.kind === 'layer') {
      look.toggleVisible();
      select(item.id);
    } else if (part === 'blend' && look.kind === 'layer') {
      look.openBlend();
    } else if (part === 'option' && look.kind === 'choice') {
      look.choose(look.options[index]!);
      select(item.id);
    } else if (part === 'swatch' && look.kind === 'swatches') {
      pickSwatch(row, index);
    } else if (part === 'dec' || part === 'inc') {
      adjust(item, part === 'dec' ? -1 : 1);
      select(item.id);
    } else {
      activate(item, 'tap');
    }
  }
}

/**
 * Where the palette goes and how big it may be; `height` is the most it may take, the list shrinks below it. The
 * search field opens at the point (beside it, away from the pen hand), or the whole panel above it when there is no
 * room below; gallery openings are centered.
 */
function placePanel(summon: Summon, viewport: { width: number; height: number }, hand: 'left' | 'right') {
  const width = Math.min(panelWidth, viewport.width - edge * 2);
  const height = Math.min(panelHeight, viewport.height - barClearance - noticeClearance);
  const { x, y } = summon.at;
  let left: number;
  let top = y - 24;
  if (summon.source === 'gallery') {
    left = x - width / 2;
    top = y - height / 2;
  } else if (hand === 'right' && (summon.pointerType === 'pen' || summon.pointerType === 'touch')) {
    // The pen hand covers the side it is on: open away from it.
    left = x - width + 34;
  } else {
    left = x - 34;
  }

  if (
    summon.source !== 'gallery' &&
    top + height > viewport.height - noticeClearance &&
    y - height - 16 >= barClearance
  ) {
    // No room below: open above the point, rather than clamped over it.
    top = y - height - 16;
  }

  return {
    left: Math.min(viewport.width - width - edge, Math.max(edge, left)),
    top: Math.min(viewport.height - height - noticeClearance, Math.max(barClearance, top)),
    width,
    height
  };
}

const panelWidth = 404;
const panelHeight = 560;
const edge = 8;
/** Room for the gallery's bar at the top of the window. */
const barClearance = 52;
/** Room for the gallery's notices at the bottom, which confirm typed commands. */
const noticeClearance = 52;

/** Arrow and page keys as selection steps. */
const keySteps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };

const navigationChips: readonly { kind: NavigationKind; label: string; icon: SketchIconName }[] = [
  { kind: 'pan', label: 'Pan', icon: 'pan' },
  { kind: 'zoom', label: 'Zoom', icon: 'zoom' },
  { kind: 'rotate', label: 'Rotate', icon: 'rotate' }
];

/** The groups the scope strip jumps to. */
const scopes = groups.filter((group) => group.id !== 'command' && group.id !== 'recent');

/**
 * A debounced end of an edit: stepping a color channel with keys or the wheel commits the color once the steps
 * pause, so that one adjustment adds one recent color. A pending end runs on disposal.
 */
function createSettle() {
  let pending: { timer: ReturnType<typeof setTimeout>; end: () => void } | undefined;
  onCleanup(() => {
    if (pending) {
      clearTimeout(pending.timer);
      pending.end();
    }
  });

  return {
    later(end: () => void) {
      if (pending) {
        clearTimeout(pending.timer);
      }

      pending = {
        end,
        timer: setTimeout(() => {
          pending = undefined;
          end();
        }, 600)
      };
    }
  };
}

/** The list's inertial scroll after a drag-scroll lifts while moving; any new press stops it. */
function createFling(element: () => HTMLElement) {
  let frame = 0;
  onCleanup(() => cancelAnimationFrame(frame));

  return {
    /** Starts gliding at `velocity` CSS pixels per millisecond of the pointer, slowing down to a stop. */
    start(velocity: number) {
      cancelAnimationFrame(frame);
      let speed = velocity;
      let last = performance.now();
      const glide = (now: number) => {
        const elapsed = Math.min(32, now - last);
        last = now;
        element().scrollTop -= speed * elapsed;
        speed *= 0.995 ** elapsed;
        if (Math.abs(speed) > 0.02) {
          frame = requestAnimationFrame(glide);
        }
      };
      frame = requestAnimationFrame(glide);
    },
    stop: () => cancelAnimationFrame(frame)
  };
}

/** Press-and-hold repetition for Undo and Redo: once on the press, then repeating after a pause until the lift. */
function createRepeat() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => clearTimeout(timer);
  onCleanup(stop);

  return {
    /** Press handlers that run `action` on the press and keep repeating it while held. */
    press(action: () => void) {
      return pressHandlers({
        start() {
          action();
          stop();
          timer = setTimeout(function again() {
            action();
            timer = setTimeout(again, 90);
          }, 420);
        },
        end: stop,
        tap: stop,
        cancel: stop
      });
    }
  };
}

/**
 * One row: icon, label with the query's matches, the look's accessory (stroke preview, switch, segments, swatches,
 * a layer's eye, thumbnail and blend chip, a command's preview), the value of a scrubber over its fill bar, a
 * check for the current item and the shortcut's keycaps. Parts that take their own taps carry `data-part`.
 */
function RowView(props: {
  item: ListItem;
  studio: Studio;
  selected: boolean;
  pressed: boolean;
  scrubbing: boolean;
  /** The swatch the keyboard points at, for swatch rows. */
  cursor: number | undefined;
}) {
  const row = () => props.item.row!;

  return (
    <div
      {...galleryUi}
      class={[
        styles.row,
        {
          [styles.selected!]: props.selected,
          [styles.pressed!]: props.pressed,
          [styles.scrubbing!]: props.scrubbing,
          [styles.disabled!]: row().disabled === true,
          [styles.swatchRow!]: row().look.kind === 'swatches'
        }
      ]}
      data-row={props.item.id}
    >
      <Show when={row().scrub}>
        {(scrub) => (
          <span
            class={[styles.fill, { [styles.tracked!]: !!scrub().track }]}
            style={{ '--fraction': `${scrub().fraction}`, '--track': scrub().track }}
          >
            <Show when={row().look.kind === 'value'}>
              <span class={[styles.bar, { [styles.track!]: !!scrub().track }]}>
                <i class={styles.marker} />
              </span>
            </Show>
          </span>
        )}
      </Show>

      <Switch fallback={<RowLine item={props.item} studio={props.studio} selected={props.selected} />}>
        <Match when={pick(row().look, 'swatches')}>
          {(swatches) => (
            <span class={styles.swatches} title={row().label}>
              <For each={swatches().colors} keyed={false}>
                {(color, index) => (
                  <span
                    data-part="swatch"
                    data-index={index}
                    class={[
                      styles.swatch,
                      {
                        [styles.current!]: color() === swatches().current,
                        [styles.cursor!]: props.cursor === index
                      }
                    ]}
                    style={{ background: color() }}
                    title={color()}
                  />
                )}
              </For>
            </span>
          )}
        </Match>
        <Match when={pick(row().look, 'layer')}>
          {(layer) => (
            <>
              <span
                data-part="eye"
                class={[styles.eye, { [styles.off!]: !layer().layer.visible }]}
                title={layer().layer.visible ? 'Hide' : 'Show'}
              >
                <SketchIcon name={layer().layer.visible ? 'eye' : 'hidden'} size={16} />
              </span>
              <span class={[styles.thumb, { [styles.active!]: layer().active }]}>
                <LayerThumb studio={props.studio} layer={layer().layer.id} width={34} height={24} />
              </span>
              <span class={[styles.label, { [styles.dim!]: !layer().layer.visible }]}>
                <Highlighted text={row().label} hits={props.item.hits} />
                <Show when={layer().layer.locked}>
                  <span class={styles.lock}>
                    <SketchIcon name="lock" size={12} />
                  </span>
                </Show>
              </span>
              <span data-part="blend" class={styles.blend} title="Blend mode">
                {blendLabel(layer().layer.blend)}
              </span>
              <span class={styles.value} data-part="value">
                {row().scrub?.text}
              </span>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}

/** The usual row content: icon, label, accessory, steps, value, check and keys. */
function RowLine(props: { item: ListItem; studio: Studio; selected: boolean }) {
  const row = () => props.item.row!;

  return (
    <>
      <span class={styles.icon}>
        <Show when={row().icon}>{(icon) => <SketchIcon name={icon()} size={16} />}</Show>
      </span>
      <span class={styles.label}>
        <Highlighted text={row().label} hits={props.item.hits} />
        <Show when={row().detail}>{(detail) => <span class={styles.detail}>{detail()}</span>}</Show>
      </span>

      <Switch>
        <Match when={pick(row().look, 'plain')}>
          {(plain) => <Show when={plain().accessory}>{(text) => <span class={styles.accessory}>{text()}</span>}</Show>}
        </Match>
        <Match when={pick(row().look, 'preset')}>
          {(preset) => (
            <span class={styles.preview}>
              <StrokePreview preset={preset().preset} color={preset().color} height={26} />
            </span>
          )}
        </Match>
        <Match when={pick(row().look, 'toggle')}>
          {(toggle) => <span class={[styles.switch, { [styles.on!]: toggle().on }]} />}
        </Match>
        <Match when={pick(row().look, 'choice')}>
          {(choice) => (
            <span class={styles.segments}>
              <For each={choice().options}>
                {(option, index) => (
                  <span
                    data-part="option"
                    data-index={index()}
                    class={[styles.segment, { [styles.on!]: option === choice().value }]}
                  >
                    {option}
                  </span>
                )}
              </For>
            </span>
          )}
        </Match>
        <Match when={pick(row().look, 'swap')}>
          {(swap) => (
            <span class={styles.pair}>
              <span class={styles.chipSwatch} style={{ background: swap().current }} title="Current" />
              <SwapGlyph />
              <span class={styles.chipSwatch} style={{ background: swap().previous }} title="Previous" />
            </span>
          )}
        </Match>
        <Match when={pick(row().look, 'command')}>
          {(command) => <Show when={command().preview}>{(preview) => <PreviewView preview={preview()} />}</Show>}
        </Match>
      </Switch>

      <Show when={props.selected && row().adjust && row().look.kind === 'value'}>
        <span class={styles.steps}>
          <span data-part="dec" class={styles.step} title="Previous preset">
            <SketchIcon name="left" size={14} />
          </span>
          <span data-part="inc" class={styles.step} title="Next preset">
            <SketchIcon name="right" size={14} />
          </span>
        </span>
      </Show>
      <Show when={row().scrub}>
        {(scrub) => (
          <span class={styles.value} data-part="value">
            {scrub().text}
          </span>
        )}
      </Show>
      <Show when={row().current}>
        <span class={styles.check}>
          <SketchIcon name="check" size={14} />
        </span>
      </Show>
      <Show when={row().keys}>
        {(keys) => (
          <span class={styles.keys}>
            <For each={keys()}>{(key) => <kbd class={styles.kbd}>{key}</kbd>}</For>
          </span>
        )}
      </Show>
    </>
  );
}

/** A typed command's preview: a meter from the current value to the new one, or the two colors. */
function PreviewView(props: { preview: Preview }) {
  return (
    <Switch>
      <Match when={pick(props.preview, 'value')}>
        {(value) => (
          <>
            <span class={styles.meter}>
              <span class={styles.meterTo} style={{ width: `${value().to * 100}%` }} />
              <span class={styles.meterFrom} style={{ left: `${value().from * 100}%` }} />
            </span>
            <span class={styles.accessory}>{value().text}</span>
          </>
        )}
      </Match>
      <Match when={pick(props.preview, 'color')}>
        {(color) => (
          <span class={styles.pair}>
            <span class={styles.chipSwatch} style={{ background: color().from }} />
            <SketchIcon name="right" size={12} />
            <span class={styles.chipSwatch} style={{ background: color().to }} />
          </span>
        )}
      </Match>
      <Match when={pick(props.preview, 'text')}>{(text) => <span class={styles.accessory}>{text().text}</span>}</Match>
    </Switch>
  );
}

/** A label with the characters the query matched in bright type. */
function Highlighted(props: { text: string; hits: readonly number[] }) {
  const parts = createMemo(() => splitHits(props.text, props.hits));
  return (
    <For each={parts()} keyed={false}>
      {(part) => <span class={part().hit ? styles.hit : undefined}>{part().text}</span>}
    </For>
  );
}

/** Splits `text` into runs of matched and unmatched characters. */
function splitHits(text: string, hits: readonly number[]) {
  const marked = new Set(hits);
  const parts: { text: string; hit: boolean }[] = [];
  for (let index = 0; index < text.length; index++) {
    const hit = marked.has(index);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) {
      last.text += text[index];
    } else {
      parts.push({ text: text[index]!, hit });
    }
  }

  return parts;
}

/** Narrows a tagged union by `kind`, for `Match`. */
function pick<T extends { kind: string }, K extends T['kind']>(value: T, kind: K) {
  return value.kind === kind ? (value as Extract<T, { kind: K }>) : undefined;
}

function SearchGlyph() {
  return (
    <svg class={styles.searchGlyph} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

function SwapGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M2 4.5h9m-2.5-2.5 2.5 2.5L8.5 7M12 9.5H3m2.5-2.5L3 9.5 5.5 12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
