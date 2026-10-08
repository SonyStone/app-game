import { createEventListener } from '@solid-primitives/event-listener';
import { dynamic } from '@solidjs/web';
import { createSignal, Errored, For, Loading, onCleanup, Show, untrack } from 'solid-js';
import { tools } from './kit/catalog';
import type { Point } from './kit/createSketchCanvas';
import { createStudio } from './kit/createStudio';
import { galleryUi, type Summon, type VariantInfo } from './kit/variant';
import { watchTapTargets } from './kit/watchTapTargets';
import styles from './PuckGallery.module.css';
import { variants } from './variants';

/**
 * A gallery of Puck-and-cluster designs to try by hand: one shared drawing and mock editor, and several variants of
 * the Puck (navigation, undo) and the cluster (tools, color, brush, layers), each after other programs. The gallery
 * owns the stage input and summoning, the same for every variant (see `VariantProps`), so that variants differ only
 * in what they show and how it reacts.
 *
 * Stage input: the pen and the mouse paint with the current tool; one finger pans, two pan, zoom and turn; the wheel
 * pans, with Ctrl or ⌘ zooms at the pointer, with Alt turns; the middle button pans. Keys: Ctrl+Z / Ctrl+Shift+Z,
 * `[` `]` brush size, tool letters, X swaps colors, Alt+1…9 switch variants.
 */
export function PuckGallery() {
  const studio = createStudio();
  const firstVariant = initialVariant();
  const [variantId, setVariantId] = createSignal(firstVariant);
  const variant = () => variants.find((entry) => entry.id === variantId()) ?? variants[0]!;
  const Current = dynamic(() => variant().component);
  const [summon, setSummon] = createSignal<Summon>();
  const [pinned, setPinned] = createSignal(false);
  /** A press outside a held variant is drawing; the variant hides until it lifts. */
  const [drawingThrough, setDrawingThrough] = createSignal(false);
  const [pointer, setPointer] = createSignal<Point>({ x: innerWidth / 2, y: innerHeight / 2 });
  const [hand, setHand] = createSignal<'left' | 'right'>(
    localStorage.getItem(storageKeys.hand) === 'right' ? 'right' : 'left'
  );
  const [helpOpen, setHelpOpen] = createSignal(!seenVariants().includes(firstVariant));
  const [listOpen, setListOpen] = createSignal(false);
  /** A finger's long press in progress, drawn as a filling ring. */
  const [longPress, setLongPress] = createSignal<Point>();
  let serial = 0;
  let holdRelease: (() => boolean | void) | undefined;
  let lastPointerType: Summon['pointerType'] = 'mouse';

  const open = (
    at: Point,
    mode: Summon['mode'],
    source: Summon['source'],
    pointerType: Summon['pointerType'],
    heldPointer?: number
  ) => {
    serial += 1;
    setDrawingThrough(false);
    setSummon({ serial, at, mode, source, pointerType, ...(heldPointer === undefined ? {} : { heldPointer }) });
  };
  const close = () => {
    setDrawingThrough(false);
    setSummon(pinned() ? { ...summon()!, mode: 'pinned' } : undefined);
  };
  const center = () => ({ x: innerWidth / 2, y: innerHeight / 2 });
  /** Opens or closes the variant from a toggle input; a pinned variant ignores them. */
  const toggle = (at: Point, source: Summon['source'], pointerType: Summon['pointerType'], heldPointer?: number) => {
    const current = summon();
    if (current?.mode === 'pinned') {
      return;
    }

    if (current) {
      close();
    } else {
      open(at, 'toggle', source, pointerType, heldPointer);
    }
  };
  const switchTo = (id: string) => {
    holdRelease = undefined;
    setSummon(undefined);
    setListOpen(false);
    setVariantId(id);
    history.replaceState(null, '', `#${id}`);
    setHelpOpen(!seenVariants().includes(id));
    // The new variant opens in the middle, so that it shows at once.
    queueMicrotask(() => open(center(), pinned() ? 'pinned' : 'toggle', 'gallery', lastPointerType));
  };
  const step = (by: number) => {
    const index = variants.findIndex((entry) => entry.id === variant().id);
    switchTo(variants[(index + by + variants.length) % variants.length]!.id);
  };
  const dismissHelp = () => {
    setHelpOpen(false);
    localStorage.setItem(storageKeys.seen, JSON.stringify([...new Set([...seenVariants(), variant().id])]));
  };

  let stopWatching: (() => void) | undefined;
  onCleanup(() => stopWatching?.());
  setupStageInput();
  queueMicrotask(() => open(center(), 'toggle', 'gallery', 'mouse'));

  return (
    <div
      ref={(element) => {
        stopWatching = watchTapTargets(element);
      }}
      class={styles.gallery}
    >
      <div
        class={styles.sheet}
        style={{
          width: `${studio.canvas.sheet.width}px`,
          height: `${studio.canvas.sheet.height}px`,
          transform: studio.canvas.transform()
        }}
      >
        {/* Keyed by id, so that a layer keeps its canvas, and its pixels, when its settings or its place change. */}
        <For each={[...studio.layers()].reverse()} keyed={(layer) => layer.id}>
          {(layer) => (
            <div
              class={styles.layer}
              style={{
                opacity: layer().opacity / 100,
                'mix-blend-mode': layer().blend,
                visibility: layer().visible ? 'visible' : 'hidden'
              }}
            >
              <canvas ref={studio.canvas.bindLayer(untrack(() => layer().id))} />
              <Show when={studio.activeLayer() === layer().id}>
                <canvas
                  ref={studio.canvas.bindScratch}
                  style={{
                    opacity: (studio.canvas.live()?.opacity ?? 100) / 100,
                    filter: studio.canvas.live() ? `blur(${studio.canvas.softness(studio.canvas.live()!)}px)` : 'none'
                  }}
                />
              </Show>
            </div>
          )}
        </For>
      </div>

      <div class={[styles.variantLayer, { [styles.hidden!]: drawingThrough() }]}>
        <Errored
          fallback={(error) => (
            <div class={styles.crash} {...galleryUi}>
              <b>{variant().name} crashed</b>
              <span>{String(error())}</span>
            </div>
          )}
        >
          <Loading fallback={null}>
            <Current
              studio={studio}
              summon={summon()}
              pointer={pointer()}
              hand={hand()}
              hidden={drawingThrough()}
              close={close}
              done={() => {
                if (summon()?.mode === 'toggle') {
                  close();
                }
              }}
              open={(at, pointerType) => open(at, 'toggle', 'variant', pointerType)}
              onHoldRelease={(handler) => {
                holdRelease = handler;
              }}
            />
          </Loading>
        </Errored>
      </div>

      <Show when={longPress()}>
        {(at) => <span class={styles.longPress} style={{ left: `${at().x}px`, top: `${at().y}px` }} />}
      </Show>

      <header class={styles.bar} {...galleryUi}>
        <button
          class={styles.barButton}
          title="All variants"
          aria-expanded={listOpen() ? 'true' : 'false'}
          onClick={() => setListOpen((on) => !on)}
        >
          <GridIcon />
        </button>
        <button class={styles.barButton} title="Previous variant" onClick={() => step(-1)}>
          ‹
        </button>
        <button class={styles.title} onClick={() => setListOpen((on) => !on)}>
          <b>{variant().name}</b>
          <span>{variant().inspiredBy}</span>
        </button>
        <button class={styles.barButton} title="Next variant" onClick={() => step(1)}>
          ›
        </button>
        <span class={styles.separator} />
        <button
          class={[styles.barButton, { [styles.on!]: pinned() }]}
          title="Pin: keep the variant open in the middle"
          onClick={() => {
            const next = !pinned();
            setPinned(next);
            if (next) {
              open(center(), 'pinned', 'gallery', lastPointerType);
            } else {
              setSummon(undefined);
            }
          }}
        >
          Pin
        </button>
        <button
          class={styles.barButton}
          title="The hand that holds the pen"
          onClick={() => {
            const next = hand() === 'left' ? 'right' : 'left';
            setHand(next);
            localStorage.setItem(storageKeys.hand, next);
          }}
        >
          {hand() === 'left' ? 'L' : 'R'}
        </button>
        <button
          class={[styles.barButton, { [styles.on!]: helpOpen() }]}
          title="How to use this variant"
          onClick={() => (helpOpen() ? dismissHelp() : setHelpOpen(true))}
        >
          ?
        </button>
      </header>

      <Show when={listOpen()}>
        <nav class={styles.list} {...galleryUi}>
          <For each={variants}>
            {(entry, index) => (
              <button
                class={[styles.listItem, { [styles.on!]: entry.id === variant().id }]}
                onClick={() => switchTo(entry.id)}
              >
                <small>{index() + 1}</small>
                <b>{entry.name}</b>
                <span>{entry.inspiredBy}</span>
              </button>
            )}
          </For>
          <button
            class={styles.listAction}
            onClick={() => {
              studio.canvas.clear();
              setListOpen(false);
            }}
          >
            Clear my strokes
          </button>
        </nav>
      </Show>

      <Show when={helpOpen()}>
        <Help variant={variant()} onClose={dismissHelp} />
      </Show>

      <Show when={studio.notice()} keyed>
        {(notice) => <div class={styles.notice}>{notice.text}</div>}
      </Show>
    </div>
  );

  /**
   * The stage's input, on the window in the capture phase so that it sees every press first: summoning (Space, the
   * pen's side button, the right button, a finger's long press), painting, finger and wheel navigation, and keys.
   * Presses on the variant's UI (`galleryUi`) are left to it.
   */
  function setupStageInput() {
    const fingers = new Map<number, Point>();
    const hoverButtons = new Map<number, number>();
    const pressed = new Set<number>();
    let painting: number | undefined;
    let middlePan: { id: number; last: Point } | undefined;
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let pressStart: { id: number; at: Point } | undefined;
    const capture = { capture: true };
    const onUi = (event: Event) => event.target instanceof Element && !!event.target.closest('[data-gallery-ui]');
    const cancelLongPress = () => {
      clearTimeout(pressTimer);
      pressStart = undefined;
      setLongPress(undefined);
    };
    onCleanup(cancelLongPress);

    createEventListener(window, 'contextmenu', (event) => event.preventDefault());
    // An edited address (`#dial`) switches the variant, as the bar does.
    createEventListener(window, 'hashchange', () => {
      const id = location.hash.slice(1);
      if (id !== variantId() && variants.some((entry) => entry.id === id)) {
        switchTo(id);
      }
    });
    createEventListener(
      window,
      'pointerdown',
      (event) => {
        const at = { x: event.clientX, y: event.clientY };
        lastPointerType = event.pointerType as Summon['pointerType'];
        pressed.add(event.pointerId);
        hoverButtons.set(event.pointerId, event.buttons);
        if (event.pointerType !== 'touch') {
          setPointer(at);
        }

        if (event.button === 2) {
          event.preventDefault();
          toggle(at, event.pointerType === 'pen' ? 'pen-button' : 'right-click', lastPointerType, event.pointerId);
          return;
        }

        if (listOpen() && !onUi(event)) {
          setListOpen(false);
        }

        if (onUi(event)) {
          return;
        }

        if (event.button === 1) {
          event.preventDefault();
          middlePan = { id: event.pointerId, last: at };
          return;
        }

        const current = summon();
        if (event.pointerType === 'touch') {
          // A finger closes a toggled variant and navigates at once; on the bare drawing it may long-press to open.
          if (current?.mode === 'toggle') {
            close();
          } else if (!current && fingers.size === 0) {
            pressStart = { id: event.pointerId, at };
            pressTimer = setTimeout(() => {
              const started = pressStart;
              cancelLongPress();
              if (started) {
                fingers.delete(started.id);
                open(started.at, 'toggle', 'long-press', 'touch', started.id);
              }
            }, longPressTime);
            setTimeout(() => pressStart?.id === event.pointerId && setLongPress(at), 120);
          }

          if (fingers.size > 0) {
            cancelLongPress();
          }

          fingers.set(event.pointerId, at);
          return;
        }

        if (current?.mode === 'toggle') {
          close();
          return;
        }

        if (current?.mode === 'hold') {
          setDrawingThrough(true);
        }

        if (studio.press(event)) {
          painting = event.pointerId;
        }
      },
      capture
    );
    createEventListener(
      window,
      'pointermove',
      (event) => {
        const at = { x: event.clientX, y: event.clientY };
        if (event.pointerType !== 'touch') {
          setPointer(at);
        }

        // Android Chrome reports a hovering pen's side button only as a move with zero pressure and nonzero buttons.
        if (event.pointerType === 'pen' && !pressed.has(event.pointerId) && event.pressure === 0) {
          const before = hoverButtons.get(event.pointerId) ?? 0;
          hoverButtons.set(event.pointerId, event.buttons);
          if (before === 0 && event.buttons !== 0) {
            lastPointerType = 'pen';
            toggle(at, 'pen-button', 'pen');
          }

          return;
        }

        if (pressStart?.id === event.pointerId && Math.hypot(at.x - pressStart.at.x, at.y - pressStart.at.y) > 10) {
          cancelLongPress();
        }

        if (fingers.has(event.pointerId)) {
          moveFinger(event.pointerId, at);
          return;
        }

        if (middlePan?.id === event.pointerId) {
          studio.pan(at.x - middlePan.last.x, at.y - middlePan.last.y);
          middlePan.last = at;
          return;
        }

        if (painting === event.pointerId) {
          studio.drag(event);
        }
      },
      capture
    );
    const release = (event: PointerEvent) => {
      pressed.delete(event.pointerId);
      hoverButtons.set(event.pointerId, event.buttons);
      fingers.delete(event.pointerId);
      if (pressStart?.id === event.pointerId) {
        cancelLongPress();
      }

      if (middlePan?.id === event.pointerId) {
        middlePan = undefined;
      }

      if (painting === event.pointerId) {
        painting = undefined;
        studio.lift(event);
        setDrawingThrough(false);
      }
    };
    createEventListener(window, 'pointerup', release, capture);
    createEventListener(window, 'pointercancel', release, capture);
    createEventListener(
      window,
      'wheel',
      (event) => {
        if (onUi(event)) {
          return;
        }

        event.preventDefault();
        const at = { x: event.clientX, y: event.clientY };
        if (event.ctrlKey || event.metaKey) {
          studio.zoomBy(Math.exp(-event.deltaY * 0.01), at);
        } else if (event.altKey) {
          studio.rotateBy(Math.sign(event.deltaY || event.deltaX) * 5, at);
        } else {
          studio.pan(-event.deltaX, -event.deltaY);
        }
      },
      { passive: false }
    );
    createEventListener(window, 'keydown', (event) => {
      if (event.defaultPrevented || isTyping(event)) {
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (event.code === 'Space') {
        // Also keeps a focused button from being clicked by Space.
        event.preventDefault();
        const current = summon();
        if (event.repeat || current?.mode === 'pinned') {
          return;
        }

        if (current) {
          setSummon({ ...current, mode: 'hold', source: 'space' });
        } else {
          open(pointer(), 'hold', 'space', 'keyboard');
        }
      } else if (event.key === 'Escape') {
        if (listOpen()) {
          setListOpen(false);
        } else if (summon()?.mode === 'toggle') {
          close();
        }
      } else if (mod && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) {
          studio.redo();
        } else {
          studio.undo();
        }
      } else if (mod && event.code === 'KeyY') {
        event.preventDefault();
        studio.redo();
      } else if (event.altKey && /^Digit[1-9]$/.test(event.code)) {
        event.preventDefault();
        const target = variants[Number(event.code.slice(5)) - 1];
        if (target) {
          switchTo(target.id);
        }
      } else if (!mod && !event.altKey && (event.key === '[' || event.key === ']')) {
        const size = studio.number('size');
        if (size > 0) {
          studio.setValue(
            'size',
            Math.round(Math.min(1000, Math.max(0.7, size * (event.key === ']' ? 1.25 : 0.8))) * 10) / 10
          );
          studio.notify(`Size ${Math.round(studio.number('size'))} px`);
        }
      } else if (!mod && !event.altKey && event.code === 'KeyX') {
        studio.swapColors();
      } else if (!mod && !event.altKey) {
        const chosen = tools.find((entry) => `Key${entry.key}` === event.code);
        if (chosen) {
          studio.setTool(chosen.id);
          studio.notify(chosen.label);
        }
      }
    });
    createEventListener(window, 'keyup', (event) => {
      // Releasing the Space that opened a held variant counts even when a field in it took the focus meanwhile.
      const current = summon();
      if (event.code !== 'Space' || current?.mode !== 'hold') {
        return;
      }

      event.preventDefault();

      if (holdRelease?.() === true) {
        setSummon({ ...current, mode: 'toggle' });
      } else {
        close();
      }
    });
    createEventListener(window, 'blur', () => {
      if (summon()?.mode === 'hold') {
        close();
      }
    });

    /**
     * Moves one finger: alone it pans; with another, the pair's midpoint pans and their distance and direction zoom
     * and turn the view around the midpoint.
     */
    function moveFinger(id: number, to: Point) {
      const from = fingers.get(id)!;
      const other = [...fingers.entries()].find(([key]) => key !== id)?.[1];
      fingers.set(id, to);
      if (!other) {
        studio.pan(to.x - from.x, to.y - from.y);
        return;
      }

      const before = { x: (from.x + other.x) / 2, y: (from.y + other.y) / 2 };
      const after = { x: (to.x + other.x) / 2, y: (to.y + other.y) / 2 };
      const spanBefore = Math.hypot(from.x - other.x, from.y - other.y);
      const spanAfter = Math.hypot(to.x - other.x, to.y - other.y);
      const turn =
        ((Math.atan2(to.y - other.y, to.x - other.x) - Math.atan2(from.y - other.y, from.x - other.x)) * 180) / Math.PI;
      studio.gesture(
        before,
        spanBefore > 1 ? spanAfter / spanBefore : 1,
        ((turn + 540) % 360) - 180,
        after.x - before.x,
        after.y - before.y
      );
    }
  }
}

/** The variant's card: what it borrows, the idea, and how each input uses it, with the shared ways to open it. */
function Help(props: { variant: VariantInfo; onClose: () => void }) {
  return (
    <aside class={styles.help} {...galleryUi}>
      <button class={styles.helpClose} title="Hide" onClick={() => props.onClose()}>
        ×
      </button>
      <h2>{props.variant.name}</h2>
      <p class={styles.inspired}>after {props.variant.inspiredBy}</p>
      <p>{props.variant.idea}</p>
      <dl>
        <dt>Pen</dt>
        <dd>{props.variant.howTo.pen}</dd>
        <dt>Touch</dt>
        <dd>{props.variant.howTo.touch}</dd>
        <dt>Mouse</dt>
        <dd>{props.variant.howTo.mouse}</dd>
        <dt>Keys</dt>
        <dd>{props.variant.howTo.keys}</dd>
      </dl>
      <p class={styles.common}>
        Open: hold Space · pen side button · right click · long-press with a finger. Esc or a press outside closes.
      </p>
    </aside>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" fill="currentColor" />
    </svg>
  );
}

const storageKeys = { hand: 'puck-gallery:hand', seen: 'puck-gallery:seen' };
/** How long a finger must stay still on the drawing to open the variant. */
const longPressTime = 450;

function initialVariant() {
  const id = location.hash.slice(1);
  return variants.some((entry) => entry.id === id) ? id : variants[0]!.id;
}

function seenVariants(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKeys.seen) ?? '[]');
    return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function isTyping(event: KeyboardEvent) {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      (target instanceof HTMLInputElement && target.type !== 'range') ||
      target instanceof HTMLTextAreaElement)
  );
}
