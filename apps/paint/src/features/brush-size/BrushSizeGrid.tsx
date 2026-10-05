import { Portal } from '@solidjs/web';
import { For, Show, createSignal, onSettled } from 'solid-js';
import styles from './BrushSizeGrid.module.css';
import {
  BRUSH_SIZE_PRESETS,
  GRID_CELL_HEIGHT,
  GRID_CELL_WIDTH,
  GRID_COLUMNS,
  GRID_HEADER,
  GRID_PADDING,
  insideSizeGrid,
  placeSizeGrid,
  sizeAt,
  type SizeGrid,
  type SizePick
} from './sizeGrid';

/**
 * Brush size for the pen: a button showing the size that opens a grid of CLIP STUDIO PAINT's sizes beside it, to
 * its left; between two dots of a row the size runs through the sizes between them.
 *
 * - Hover: a pen above the screen (or a mouse, after a short pause) opens the grid over the button; pointing at a
 *   size shows it on the brush, and touching a size picks it — or touch, slide along a row and lift. Leaving the
 *   button, the grid and the way between them, or lifting the pen out of hover range, closes it.
 * - Slide: press the button, slide onto a size and lift the pen there.
 * - Tap: a tap keeps the grid open to point at and tap a size, as with a finger; tapping the button again or
 *   anywhere else closes it.
 *
 * Lifting off the grid, Escape and closing without a pick all keep the size from before. While the grid is open,
 * presses elsewhere only close it and never reach the canvas.
 */
export function BrushSizeGrid(props: {
  /** Current brush size, in document pixels. */
  size: number;
  /** Largest size the brush allows; larger presets are left out. */
  max: number;
  disabled?: boolean;
  /**
   * Receives each size pointed at while choosing, to show it on the brush, and the size from before when choosing
   * ends without a pick.
   */
  onPreview: (size: number) => void;
  /** Receives the chosen size. */
  onPick: (size: number) => void;
}) {
  const [grid, setGrid] = createSignal<SizeGrid>();
  const [hover, setHover] = createSignal<SizePick>();

  let button!: HTMLButtonElement;
  // Choosing state lives in plain variables, which every handler must read fresh within one event.
  let mode: 'hover' | 'press' | 'tap' | undefined;
  let open: SizeGrid | undefined;
  let buttonBox: DOMRect | undefined;
  let pointerId = 0;
  let pressType = 'mouse';
  let pressFrom: 'closed' | 'hover' | 'tap' = 'closed';
  let startX = 0;
  let startY = 0;
  let entered = false;
  let original = 0;
  let previewed = 0;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  const preview = (size: number) => {
    if (size !== previewed) {
      previewed = size;
      props.onPreview(size);
    }
  };

  const point = (x: number, y: number) => {
    const pick = open && sizeAt(open, x, y);
    entered ||= pick !== undefined;
    setHover(pick);
    preview(pick?.size ?? original);
    return pick;
  };

  const openGrid = (y: number, next: 'hover' | 'press') => {
    buttonBox = button.getBoundingClientRect();
    mode = next;
    entered = false;
    original = previewed = props.size;
    open = placeSizeGrid({
      presets: BRUSH_SIZE_PRESETS,
      min: 1,
      max: props.max,
      current: props.size,
      right: buttonBox.left - GRID_GAP,
      y,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    });
    setGrid(open);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerout', onOut);
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', preventDefault);
  };

  const close = (picked: number | undefined) => {
    mode = undefined;
    open = undefined;
    setGrid(undefined);
    setHover(undefined);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerout', onOut);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('contextmenu', preventDefault);

    if (picked === undefined) {
      preview(original);
    } else {
      props.onPick(picked);
    }
  };

  /** Starts a press that ends when the pointer lifts: on the button, or on the open grid. */
  const startPress = (event: PointerEvent) => {
    pressFrom = mode === 'hover' || mode === 'tap' ? mode : 'closed';
    mode = 'press';
    pointerId = event.pointerId;
    pressType = event.pointerType;
    startX = event.clientX;
    startY = event.clientY;
    button.setPointerCapture(event.pointerId);
    point(event.clientX, event.clientY);
  };

  const onButtonDown = (event: PointerEvent) => {
    if (props.disabled || mode || event.button !== 0) {
      return;
    }

    event.preventDefault();
    clearTimeout(hoverTimer);
    openGrid(event.clientY, 'press');
    startPress(event);
  };

  const onButtonEnter = (event: PointerEvent) => {
    if (props.disabled || mode || event.pointerType === 'touch' || event.buttons !== 0) {
      return;
    }

    // A pen hovers on purpose; a mouse merely crossing the button should not flash the grid.
    const y = event.clientY;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(
      () => {
        if (!mode && !props.disabled) {
          openGrid(y, 'hover');
        }
      },
      event.pointerType === 'mouse' ? MOUSE_HOVER_DELAY : 0
    );
  };

  const onButtonLeave = () => {
    if (!mode) {
      clearTimeout(hoverTimer);
    }
  };

  const onMove = (event: PointerEvent) => {
    if (mode === 'press') {
      if (event.pointerId === pointerId) {
        point(event.clientX, event.clientY);
      }

      return;
    }

    // Hovering pointers only: a mouse, or a pen above the screen.
    if (event.buttons !== 0) {
      return;
    }

    point(event.clientX, event.clientY);

    if (mode === 'hover' && !withinReach(event.clientX, event.clientY)) {
      close(undefined);
    }
  };

  /** While hovering, the grid stays open over the button, the grid and the way between them. */
  const withinReach = (x: number, y: number) => {
    if (!open || !buttonBox) {
      return false;
    }

    const between =
      x >= open.left + open.width - HOVER_SLACK &&
      x <= buttonBox.left + HOVER_SLACK &&
      y >= Math.min(open.top, buttonBox.top) - HOVER_SLACK &&
      y <= Math.max(open.top + open.height, buttonBox.bottom) + HOVER_SLACK;
    return (
      between ||
      within(open.left, open.top, open.width, open.height, x, y) ||
      within(buttonBox.left, buttonBox.top, buttonBox.width, buttonBox.height, x, y)
    );
  };

  /** A press while the grid is open: on the button or the grid it starts a press there, elsewhere it closes. */
  const onDown = (event: PointerEvent) => {
    if (mode === 'press' || !open) {
      return;
    }

    // Neither the canvas nor the button's own handler gets presses while the grid is open.
    event.preventDefault();
    event.stopPropagation();
    const onButton =
      buttonBox &&
      within(buttonBox.left, buttonBox.top, buttonBox.width, buttonBox.height, event.clientX, event.clientY, 0);

    if (event.button !== 0 || (!onButton && !insideSizeGrid(open, event.clientX, event.clientY))) {
      close(undefined);
      return;
    }

    startPress(event);
  };

  const onUp = (event: PointerEvent) => {
    if (mode !== 'press' || event.pointerId !== pointerId) {
      return;
    }

    const pick = point(event.clientX, event.clientY);
    const tap =
      !entered &&
      Math.hypot(event.clientX - startX, event.clientY - startY) <
        (pressType === 'mouse' ? TAP_DISTANCE_MOUSE : TAP_DISTANCE);

    if (pick) {
      close(pick.size);
    } else if (tap && pressFrom !== 'tap') {
      // A tap keeps the grid open for pointing and tapping a size; another tap on the button closes it.
      mode = 'tap';
    } else {
      close(undefined);
    }
  };

  const onCancel = (event: PointerEvent) => {
    if (mode === 'press' && event.pointerId === pointerId) {
      close(undefined);
    }
  };

  /** A hovering pen lifted out of range, or a mouse leaving the window. */
  const onOut = (event: PointerEvent) => {
    if (mode === 'hover' && event.relatedTarget === null) {
      close(undefined);
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(undefined);
    }
  };

  onSettled(() => () => {
    clearTimeout(hoverTimer);

    if (mode) {
      close(undefined);
    }
  });

  return (
    <>
      <button
        ref={(element) => (button = element)}
        class={styles.trigger}
        aria-label="Brush size"
        title="Brush size · hover or press and slide to a size, or tap"
        aria-haspopup="dialog"
        aria-expanded={grid() ? 'true' : 'false'}
        disabled={props.disabled}
        onPointerDown={onButtonDown}
        onPointerEnter={onButtonEnter}
        onPointerLeave={onButtonLeave}
      >
        <span
          class={styles.triggerDot}
          style={{ width: `${triggerDot(props.size)}px`, height: `${triggerDot(props.size)}px` }}
        />
        <small>{formatSize(props.size)}</small>
      </button>
      <Show when={grid()}>
        {(open) => (
          <Portal>
            <SizeGridPanel grid={open()} hover={hover()} size={props.size} />
          </Portal>
        )}
      </Show>
    </>
  );
}

/** Whether `(x, y)` lies in the rectangle, grown by `slack` on every side. */
function within(left: number, top: number, width: number, height: number, x: number, y: number, slack = HOVER_SLACK) {
  return x >= left - slack && x <= left + width + slack && y >= top - slack && y <= top + height + slack;
}

/** CSS pixels a hovering pointer may stray past the button, the grid and the way between before the grid closes. */
const HOVER_SLACK = 16;

/** Milliseconds a mouse must rest on the button before the grid opens. */
const MOUSE_HOVER_DELAY = 250;

/** Space between the grid and the button, in CSS pixels. */
const GRID_GAP = 10;

/** CSS pixels a pen or finger may move during a tap, whose taps wander further than a mouse's. */
const TAP_DISTANCE = 8;
const TAP_DISTANCE_MOUSE = 3;

/**
 * The grid: a header with the size, then rows of presets, each a dot sized after the preset above its number. Rows
 * are strung on a line with ticks between the dots, so they read as sliders; the thumb with a bubble shows the
 * size pointed at, gliding between dots and jumping onto a dot while its preset holds. The pointer passes through:
 * the button's gesture handlers do the hit testing.
 */
function SizeGridPanel(props: { grid: SizeGrid; hover: SizePick | undefined; size: number }) {
  const rows = () => Math.ceil(props.grid.presets.length / GRID_COLUMNS);
  const rowLength = (row: number) => Math.min(GRID_COLUMNS, props.grid.presets.length - row * GRID_COLUMNS);
  const label = () => `${formatSize(props.hover?.size ?? props.size)} px`;

  return (
    <div
      class={styles.panel}
      role="dialog"
      aria-label="Brush sizes"
      style={{ left: `${props.grid.left}px`, top: `${props.grid.top}px`, padding: `${GRID_PADDING}px` }}
    >
      <div class={styles.header} style={{ height: `${GRID_HEADER}px` }}>
        {label()}
      </div>
      <div
        class={styles.cells}
        style={{
          'grid-template-columns': `repeat(${GRID_COLUMNS}, ${GRID_CELL_WIDTH}px)`,
          'grid-auto-rows': `${GRID_CELL_HEIGHT}px`
        }}
      >
        <svg
          class={styles.strings}
          width={GRID_COLUMNS * GRID_CELL_WIDTH}
          height={rows() * GRID_CELL_HEIGHT}
          aria-hidden="true"
        >
          <For each={Array.from({ length: rows() }, (_, row) => row)}>
            {(row) => {
              const y = row * GRID_CELL_HEIGHT + DOT_AREA / 2;
              const from = GRID_CELL_WIDTH / 2;

              return (
                <>
                  <line x1={from} x2={(rowLength(row) - 0.5) * GRID_CELL_WIDTH} y1={y} y2={y} />
                  <For each={Array.from({ length: rowLength(row) - 1 }, (_, gap) => gap)}>
                    {(gap) => (
                      <For each={GAP_TICKS}>
                        {(tick) => {
                          const x = from + (gap + tick) * GRID_CELL_WIDTH;
                          const half = tick === 0.5 ? 4 : 2.5;
                          return <line x1={x} x2={x} y1={y - half} y2={y + half} />;
                        }}
                      </For>
                    )}
                  </For>
                </>
              );
            }}
          </For>
        </svg>
        <For each={props.grid.presets}>
          {(preset) => (
            <div
              class={styles.cell}
              data-exact={preset === props.hover?.preset && props.hover.exact ? 'true' : undefined}
              data-current={preset === props.size ? 'true' : undefined}
            >
              <div class={styles.dotArea} style={{ height: `${DOT_AREA}px` }}>
                <span class={styles.dot} style={{ width: `${cellDot(preset)}px`, height: `${cellDot(preset)}px` }} />
              </div>
              <span class={styles.cellLabel}>{formatSize(preset)}</span>
            </div>
          )}
        </For>
        <Show when={props.hover}>
          {(hover) => (
            <div class={styles.thumb} style={{ left: `${hover().x}px`, top: `${hover().row * GRID_CELL_HEIGHT}px` }}>
              <Show when={!hover().exact}>
                <span class={styles.thumbLine} />
              </Show>
              <span class={styles.bubble}>{label()}</span>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

/** Height of a cell's dot area, above its number; rows are strung through its middle. */
const DOT_AREA = 32;

/**
 * Ticks between two dots of a row, as shares of a cell width from the left dot: evenly over the stretches that give
 * sizes between presets, with the taller halfway tick on the cell boundary.
 */
const GAP_TICKS = [0.3, 0.4, 0.5, 0.6, 0.7];

/** Diameter of a preset's dot in its cell: its size, kept visible when tiny and leaving room for the ticks. */
function cellDot(size: number) {
  return Math.max(1.5, Math.min(20, size));
}

/** Diameter of the button's dot: grows with the size, logarithmically, up to the button's room. */
function triggerDot(size: number) {
  return Math.max(3, Math.min(22, 3 + 3 * Math.log2(Math.max(1, size))));
}

/** A size as Paint shows it: whole pixels, with one decimal below 10 px for presets such as 1.5. */
function formatSize(size: number) {
  return size < 10 ? `${Math.round(size * 10) / 10}` : `${Math.round(size)}`;
}

function preventDefault(event: Event) {
  event.preventDefault();
}
