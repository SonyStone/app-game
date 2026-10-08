import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver, useWindowSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from 'solid-js';
import { presets, tools } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import type { Press } from '../../kit/pressHandlers';
import type { VariantProps } from '../../kit/variant';
import { BrushCard } from './BrushCard';
import { CardFace } from './CardFace';
import { CardFoot, CardHead, cardIndex, deck, signedAngle, Suit, type CardId } from './cards';
import { ColorCard } from './ColorCard';
import { pressable } from './controls';
import styles from './Deck.module.css';
import { fanBounds, fanIndexAt, fanSlot, placeFan, shiftInto, type Box, type Fan } from './fan';
import { LayersCard } from './LayersCard';
import { NavigateCard, type NavigationView } from './NavigateCard';
import { ToolsCard } from './ToolsCard';

/**
 * Deck: the cluster as a hand of five cards (Navigate, Tools, Brush, Color, Layers), after Hearthstone's hand,
 * Balatro and Stage Manager. Summoning deals the hand fanned around the pen; the card under the pointer rises and
 * straightens; playing a card flies it up full size, centered on the pen, while the rest of the hand stays tucked
 * behind its top edge for switching. The deck remembers the last played card and plays it at once on the next
 * summon.
 */
export function DeckVariant(props: VariantProps) {
  const [lastPlayed, setLastPlayed] = createSignal<CardId | undefined>(storedCard());
  /** A new opening deals a new hand; mode changes of the same opening (hold to toggle) keep it. */
  const serial = createMemo(() => props.summon?.serial);
  let holdRelease: (() => boolean) | undefined;
  props.onHoldRelease(() => holdRelease?.() ?? false);
  const memory: DeckMemory = {
    lastPlayed,
    remember(id) {
      setLastPlayed(id);
      localStorage.setItem(storageKey, id);
    },
    onHoldRelease(handler) {
      holdRelease = handler;
    }
  };

  return (
    <Show when={serial()} keyed>
      {(_opening) => <Hand {...props} memory={memory} />}
    </Show>
  );
}

/** What outlives one hand: the last played card, and the hold-release handler the gallery calls. */
type DeckMemory = {
  lastPlayed: () => CardId | undefined;
  remember: (id: CardId) => void;
  /** Sets what lifting Space does while this hand is out; `undefined` when it goes. */
  onHoldRelease: (handler: (() => boolean) | undefined) => void;
};

/**
 * One dealt hand, for one opening. Without an active card the five cards fan around the summon point; pointing at
 * one (hover, or a press sliding across the fan, or the held opening press) inspects it, and a tap or a lift on it
 * plays it. With an active card, the others form a small fan behind its top edge that works the same way, and the
 * active card swipes down back into the hand, or sideways to its neighbours.
 */
function Hand(props: VariantProps & { memory: DeckMemory }) {
  const opening = untrack(() => props.summon!);
  const at = opening.at;
  /** Hover counts only after the pointer moves, so that a stale mouse position does not inspect for a finger. */
  const restingPointer = untrack(() => props.pointer);
  const windowSize = useWindowSize();
  const [active, setActive] = createSignal<CardId | undefined>(untrack(() => props.memory.lastPlayed()));
  const [dealt, setDealt] = createSignal(false);
  const [dealing, setDealing] = createSignal(true);
  /** A press sliding across a fan, and the card it points at. */
  const [slide, setSlide] = createSignal<{ index: number | undefined }>();
  /** The card picked with ← and → while the hand is out. */
  const [keyPick, setKeyPick] = createSignal<number>();
  /** How far the active card is dragged by a swipe in progress. */
  const [swipe, setSwipe] = createSignal<Point>();
  const [navigation, setNavigation] = createSignal<NavigationView>();
  /** Measured heights of the cards' full faces, so that a card flies straight to where it will fit. */
  const [heights, setHeights] = createSignal<Partial<Record<CardId, number>>>({});
  /** The card the slide points at, kept outside the signal for handlers of the same press. */
  let sliding: number | undefined;
  let playedDuringHold = false;

  const area = (): Box => ({
    left: edge,
    top: barRoom,
    right: windowSize.width - edge,
    bottom: windowSize.height - edge
  });
  const handFan = createMemo(() =>
    placeFan(
      {
        pivot: at,
        radius: handLayout.radius,
        step: handLayout.step,
        lean: props.hand === 'left' ? handLayout.lean : -handLayout.lean,
        down: false,
        count: deck.length,
        width: cardWidth * handLayout.scale,
        height: faceHeight * handLayout.scale
      },
      area(),
      handLayout.raise,
      handLayout.grow
    )
  );
  const activeIndex = () => {
    const id = active();
    return id === undefined ? undefined : cardIndex(id);
  };
  /** Where the active card goes: centered on the summon point, inside the window, with room for the small fan. */
  const activeBox = createMemo(() => {
    const id = active();
    if (id === undefined) {
      return undefined;
    }

    const height = heights()[id] ?? estimatedHeights[id];
    const bounds = area();
    const room = miniLayout.peek + miniLayout.raise;
    const fitsAbove = height + room <= bounds.bottom - bounds.top;
    const half = cardWidth / 2;
    const x = clamp(at.x, bounds.left + half, bounds.right - half);
    const top = fitsAbove
      ? clamp(at.y - height / 2, bounds.top + room, bounds.bottom - height)
      : clamp(at.y - height / 2, bounds.top, bounds.bottom - height - room);
    return { x, y: top + height / 2, left: x - half, right: x + half, top, bottom: top + height, height, fitsAbove };
  });
  /** The rest of the hand behind the active card's top edge (or bottom, without room above). */
  const miniFan = createMemo((): Fan | undefined => {
    const box = activeBox();
    if (!box) {
      return undefined;
    }

    const height = faceHeight * miniLayout.scale;
    const away = props.hand === 'left' ? 1 : -1;
    const fan: Fan = {
      pivot: {
        x: box.x + away * miniLayout.shift,
        y: box.fitsAbove ? box.top + miniLayout.depth : box.bottom - miniLayout.depth
      },
      radius: miniLayout.depth + miniLayout.peek - height / 2,
      step: miniLayout.step,
      lean: away * miniLayout.lean,
      down: !box.fitsAbove,
      count: deck.length,
      width: cardWidth * miniLayout.scale,
      height
    };
    // Slides along the card's edge to stay inside the window when the card sits at a side.
    const bounds = fanBounds(fan, miniLayout.raise, miniLayout.grow);
    const shift = shiftInto(bounds.left, bounds.right, area().left, area().right);
    return { ...fan, pivot: { x: fan.pivot.x + shift, y: fan.pivot.y } };
  });
  /** The card of the current fan that `point` picks; pressing reaches from closer to the pivot than hovering. */
  const pickAt = (point: Point, pressing: boolean, current?: number) => {
    const box = activeBox();
    const fan = box ? miniFan()! : handFan();
    if (box && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) {
      return undefined;
    }

    const layout = box ? miniLayout : handLayout;
    const inner = pressing && !box ? 34 : fan.radius - fan.height / 2 - 6;
    const outer = fan.radius + fan.height / 2 + layout.raise + 12;
    const index = fanIndexAt(fan, point, { inner, outer }, current, layout.grow * 0.92);
    // The active card's empty slot shows the card left of it, which nothing covers there.
    const gap = activeIndex();
    if (index !== undefined && index === gap) {
      return gap > 0 ? gap - 1 : undefined;
    }

    return index;
  };
  const hovered = createMemo<number | undefined>((previous) => {
    const point = props.pointer;
    if (point === restingPointer || slide() || swipe() || navigation()) {
      return undefined;
    }

    return pickAt(point, false, previous);
  });
  /** The inspected card: the one a press slides over, else the one picked by keys, else the hovered one. */
  const inspected = () => {
    const pressed = slide();
    return pressed ? pressed.index : (keyPick() ?? hovered());
  };

  const play = (index: number) => {
    const card = deck[index]!;
    sliding = undefined;
    setSlide(undefined);
    setKeyPick(undefined);
    setSwipe(undefined);
    setActive(card.id);
    props.memory.remember(card.id);
    playedDuringHold = true;
  };
  const backToHand = () => {
    setSwipe(undefined);
    setActive(undefined);
  };
  /** Plays the next or previous card, or moves the key pick through the hand while no card is up. */
  const cycle = (by: number) => {
    const current = activeIndex();
    if (current !== undefined) {
      play((current + by + deck.length) % deck.length);
      return;
    }

    const from = keyPick() ?? hovered();
    setKeyPick(from === undefined ? (by > 0 ? 0 : deck.length - 1) : (from + by + deck.length) % deck.length);
  };
  /** Ends a swipe of the active card: down puts it back into the hand, sideways plays a neighbour. */
  const settleSwipe = (press: Press, event: PointerEvent) => {
    const dx = press.point.x - press.start.x;
    const dy = press.point.y - press.start.y;
    const quick = event.timeStamp - press.time < 280;
    if (dy > Math.abs(dx) && (dy > 90 || (quick && dy > 36))) {
      backToHand();
    } else if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > 110 || (quick && Math.abs(dx) > 50))) {
      cycle(dx < 0 ? 1 : -1);
    }

    setSwipe(undefined);
  };
  /**
   * A card's own press: on the active card's bare face it swipes; on a card in a fan it inspects that card and then
   * whichever the press slides to, playing the one under the lift.
   */
  const cardPress = (index: number) => {
    let mode: 'swipe' | 'slide' | undefined;
    const finish = () => {
      mode = undefined;
      sliding = undefined;
      setSlide(undefined);
      setSwipe(undefined);
    };
    return pressable({
      start() {
        if (activeIndex() === index) {
          mode = 'swipe';
          setSwipe({ x: 0, y: 0 });
          return;
        }

        mode = 'slide';
        sliding = index;
        setSlide({ index });
      },
      move(press) {
        if (mode === 'swipe') {
          setSwipe({ x: press.point.x - press.start.x, y: press.point.y - press.start.y });
          return;
        }

        sliding = pickAt(press.point, true, sliding);
        setSlide({ index: sliding });
      },
      tap() {
        if (mode === 'slide') {
          play(sliding ?? index);
        }

        finish();
      },
      end(press, event) {
        if (mode === 'swipe') {
          settleSwipe(press, event);
        } else if (sliding !== undefined) {
          play(sliding);
        }

        finish();
      },
      cancel: finish
    });
  };

  /** Where each card goes, from the state: dealt or not, active, in a fan, inspected, parting for an inspected one. */
  const placement = (index: number): Placement => {
    const box = activeBox();
    const isActive = activeIndex() === index;
    if (!dealt()) {
      return {
        x: box ? box.x : at.x,
        y: box ? box.y : at.y,
        angle: 0,
        scale: isActive ? 0.9 : 0.06,
        height: isActive && box ? box.height : faceHeight,
        opacity: 0,
        z: isActive ? 20 : index + 1
      };
    }

    if (box && isActive) {
      const offset = swipe() ?? { x: 0, y: 0 };
      return {
        x: box.x + offset.x,
        y: box.y + Math.max(-40, offset.y),
        angle: offset.x * 0.035,
        scale: 1,
        height: box.height,
        opacity: 1,
        z: 20
      };
    }

    const fan = box ? miniFan()! : handFan();
    const layout = box ? miniLayout : handLayout;
    const target = inspected();
    if (target === index) {
      const slot = fanSlot(fan, index, 0, layout.raise);
      return { ...slot, angle: 0, scale: layout.scale * layout.grow, height: faceHeight, opacity: 1, z: box ? 9 : 10 };
    }

    const part = target === undefined ? 0 : Math.sign(index - target) * layout.part;
    return { ...fanSlot(fan, index, part), scale: layout.scale, height: faceHeight, opacity: 1, z: index + 1 };
  };

  const frames = [0, 0];
  frames[0] = requestAnimationFrame(() => {
    frames[1] = requestAnimationFrame(() => setDealt(true));
  });
  const dealTimer = setTimeout(() => setDealing(false), 320);
  onCleanup(() => {
    frames.forEach((frame) => cancelAnimationFrame(frame));
    clearTimeout(dealTimer);
  });

  props.memory.onHoldRelease(() => {
    const target = inspected();
    if (target !== undefined) {
      play(target);
      return true;
    }

    return playedDuringHold;
  });
  onCleanup(() => props.memory.onHoldRelease(undefined));
  createEffect(
    () => props.summon?.mode,
    (mode) => {
      if (mode === 'hold') {
        playedDuringHold = false;
      }
    }
  );

  followHeldPointer(opening.heldPointer);
  createEventListener(window, 'pointermove', () => {
    if (keyPick() !== undefined) {
      setKeyPick(undefined);
    }
  });
  createEventListener(
    window,
    'keydown',
    (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (handleKey(event)) {
        event.preventDefault();
      }
    },
    { capture: true }
  );

  return (
    <div class={[styles.table, { [styles.hidden!]: props.hidden }]}>
      <For each={deck}>
        {(card) => {
          const index = cardIndex(card.id);
          const place = createMemo(() => placement(index));
          const isActive = () => active() === card.id;
          const handlers = cardPress(index);
          return (
            <div
              class={[
                styles.card,
                {
                  [styles.activeCard!]: isActive(),
                  [styles.raised!]: !isActive() && inspected() === index,
                  [styles.dragging!]: isActive() && swipe() !== undefined
                }
              ]}
              style={{
                '--accent': card.accent,
                '--deck-scale': `${place().scale}`,
                translate: `calc(${place().x}px - 50%) calc(${place().y}px - 50%)`,
                rotate: `${place().angle}deg`,
                scale: `${place().scale}`,
                height: `${place().height}px`,
                opacity: navigation() ? 0 : place().opacity,
                'z-index': place().z,
                'transition-delay': dealing() ? `${index * 18}ms` : '0ms'
              }}
              aria-label={`${card.title} (${index + 1})`}
              {...handlers}
            >
              <CardFace card={card} studio={props.studio} hidden={isActive()} />
              <Show when={isActive()}>
                <Front card={card.id} onHeight={(height) => setHeights((all) => ({ ...all, [card.id]: height }))}>
                  <CardHead card={card} studio={props.studio} />
                  <Switch>
                    <Match when={card.id === 'navigate'}>
                      <NavigateCard studio={props.studio} pivot={at} onNavigate={setNavigation} />
                    </Match>
                    <Match when={card.id === 'tools'}>
                      <ToolsCard studio={props.studio} done={props.done} />
                    </Match>
                    <Match when={card.id === 'brush'}>
                      <BrushCard studio={props.studio} done={props.done} />
                    </Match>
                    <Match when={card.id === 'color'}>
                      <ColorCard studio={props.studio} done={props.done} />
                    </Match>
                    <Match when={card.id === 'layers'}>
                      <LayersCard studio={props.studio} done={props.done} />
                    </Match>
                  </Switch>
                  <CardFoot card={card} />
                </Front>
              </Show>
            </div>
          );
        }}
      </For>

      <Show when={navigation()}>{(view) => <NavigationOverlay view={view()} studio={props.studio} />}</Show>
    </div>
  );

  /**
   * Follows the press that opened the hand (the right button, or a finger's long press) for press-slide-lift: the
   * card it points at rises, and lifting on it plays it. Lifting elsewhere leaves the hand open.
   */
  function followHeldPointer(pointer: number | undefined) {
    if (pointer === undefined) {
      return;
    }

    let following = true;
    createEventListener(window, 'pointermove', (event) => {
      if (!following || event.pointerId !== pointer) {
        return;
      }

      const point = { x: event.clientX, y: event.clientY };
      if (Math.hypot(point.x - at.x, point.y - at.y) < 12 && sliding === undefined) {
        return;
      }

      sliding = pickAt(point, true, sliding);
      setSlide({ index: sliding });
    });
    const finish = (event: PointerEvent, commit: boolean) => {
      if (!following || event.pointerId !== pointer) {
        return;
      }

      following = false;
      const target = sliding;
      sliding = undefined;
      setSlide(undefined);
      if (commit && target !== undefined) {
        play(target);
      }
    };
    createEventListener(window, 'pointerup', (event) => finish(event, true));
    createEventListener(window, 'pointercancel', (event) => finish(event, false));
  }

  /** The deck's keys while it is open; returns whether it used the key. */
  function handleKey(event: KeyboardEvent): boolean {
    const digit = /^Digit([1-5])$/.exec(event.code);
    if (digit) {
      play(Number(digit[1]) - 1);
      return true;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      cycle(event.key === 'ArrowRight' ? 1 : -1);
      return true;
    }

    if (event.key === 'Tab') {
      if (active() !== undefined) {
        backToHand();
      } else {
        const last = props.memory.lastPlayed();
        play(last === undefined ? 0 : cardIndex(last));
      }

      return true;
    }

    if (event.key === 'Enter' && active() === undefined) {
      const target = inspected();
      if (target !== undefined) {
        play(target);
        return true;
      }

      return false;
    }

    return cardKey(active(), event, props.studio, props.done, at);
  }
}

/** Where a card goes on the table: its center, turn, scale, height (of the unscaled card), opacity and stacking. */
type Placement = { x: number; y: number; angle: number; scale: number; height: number; opacity: number; z: number };

/** The active card's content box, which reports its height so that the card frames it exactly. */
function Front(props: { card: CardId; onHeight: (height: number) => void; children: JSX.Element }) {
  const [element, setElement] = createSignal<HTMLDivElement>();
  createResizeObserver(element, (_, target) => props.onHeight((target as HTMLElement).offsetHeight));

  return (
    <div ref={setElement} class={styles.front}>
      <Suit card={props.card} class={styles.frontGlyph} />
      {props.children}
    </div>
  );
}

/**
 * Each card's own keys while it is up. Navigate: F fit, H flip, S symmetry, R straighten, Z / Shift+Z undo and redo,
 * + and − zoom. Tools: the tool letters choose (and finish). Brush: ↑ ↓ step through the presets. Layers: ↑ ↓
 * select, V hides or shows, N adds a layer.
 */
function cardKey(card: CardId | undefined, event: KeyboardEvent, studio: Studio, done: () => void, pivot: Point) {
  if (card === 'navigate') {
    const actions: Record<string, () => void> = {
      KeyF: () => studio.fit(),
      KeyH: () => studio.flip(),
      KeyS: () => studio.toggleSymmetry(),
      KeyR: () => studio.rotateTo(0),
      KeyZ: () => (event.shiftKey ? studio.redo() : studio.undo()),
      Equal: () => studio.zoomBy(1.25, pivot),
      Minus: () => studio.zoomBy(0.8, pivot)
    };
    actions[event.code]?.();
    return event.code in actions;
  }

  if (card === 'tools') {
    const chosen = tools.find((tool) => `Key${tool.key}` === event.code);
    if (chosen) {
      studio.setTool(chosen.id);
      done();
    }

    return chosen !== undefined;
  }

  if (card === 'brush' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    const current = presets.findIndex((preset) => preset.id === studio.preset());
    const next = clamp(current + (event.key === 'ArrowDown' ? 1 : -1), 0, presets.length - 1);
    studio.choosePreset(presets[current < 0 ? 0 : next]!.id);
    return true;
  }

  if (card === 'layers') {
    const layers = studio.layers();
    const position = layers.findIndex((layer) => layer.id === studio.activeLayer());
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const next = layers[clamp(position + (event.key === 'ArrowDown' ? 1 : -1), 0, layers.length - 1)];
      if (next) {
        studio.selectLayer(next.id);
      }

      return true;
    }

    if (event.code === 'KeyV' && layers[position]) {
      studio.updateLayer(layers[position].id, { visible: !layers[position].visible });
      return true;
    }

    if (event.code === 'KeyN') {
      studio.addLayer();
      return true;
    }
  }

  return false;
}

/**
 * What replaces the hidden deck during a navigation drag: for Rotate, the circle the pointer sweeps around the pivot
 * and the angle; for Zoom, the pivot and the zoom; for Pan, nothing but the moving drawing.
 */
function NavigationOverlay(props: { view: NavigationView; studio: Studio }) {
  const radius = () => Math.hypot(props.view.point.x - props.view.pivot.x, props.view.point.y - props.view.pivot.y);

  return (
    <div class={styles.overlay}>
      <Show when={props.view.kind !== 'pan'}>
        <svg aria-hidden="true">
          <Show when={props.view.kind === 'rotate'}>
            <circle cx={props.view.pivot.x} cy={props.view.pivot.y} r={radius()} class={styles.overlayRing} />
            <line
              x1={props.view.pivot.x}
              y1={props.view.pivot.y}
              x2={props.view.point.x}
              y2={props.view.point.y}
              class={styles.overlayLine}
            />
          </Show>
          <circle cx={props.view.pivot.x} cy={props.view.pivot.y} r={3.5} class={styles.overlayPivot} />
        </svg>
        <span class={styles.readout} style={{ left: `${props.view.point.x}px`, top: `${props.view.point.y}px` }}>
          {props.view.kind === 'rotate'
            ? `${signedAngle(props.studio.view().angle)}°`
            : `${Math.round(props.studio.view().scale * 100)}%`}
        </span>
      </Show>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function storedCard(): CardId | undefined {
  const stored = localStorage.getItem(storageKey);
  return deck.find((card) => card.id === stored)?.id;
}

const storageKey = 'puck-gallery:deck:last';
/** The full card's width, and the height of its face as it lies in a fan; the fans scale the whole card down. */
const cardWidth = 336;
const faceHeight = 470;
/** Room kept free at the window's edges, and above, where the gallery's bar is. */
const edge = 8;
const barRoom = 50;
/**
 * The hand around the pen: card scale, distance from the pen to the cards' centers, degrees between cards, lean away
 * from the drawing hand, and an inspected card's rise (px), growth and how far its neighbours part (degrees).
 */
const handLayout = { scale: 0.32, radius: 190, step: 23, lean: 8, raise: 26, grow: 1.22, part: 4 };
/**
 * The small fan behind the active card: its pivot `depth` px inside the card's top edge and `shift` px away from the
 * drawing hand, cards peeking `peek` px out.
 */
const miniLayout = {
  scale: 0.27,
  depth: 300,
  peek: 52,
  step: 7.5,
  lean: 3,
  shift: 34,
  raise: 30,
  grow: 1.1,
  part: 1.5
};
/** First guesses at the full cards' heights, until they are measured. */
const estimatedHeights: Record<CardId, number> = { navigate: 330, tools: 360, brush: 590, color: 430, layers: 470 };
