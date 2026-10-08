import { createSignal, For, Show, type Accessor } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { DebugOptions } from './debugOptions';
import styles from './mockup.module.css';

/**
 * The state of the shortcut button, which sits at an offset from the pointer. It takes presses only above
 * {@link clickOpacity}, and after the puck closes it shows fully right under the pointer, staying there until the
 * pointer leaves it. How it lets the pointer reach it depends on `launcherPlacement`:
 *
 * - `zone`, NavigationPuckAddon's Shortcut Button (`shortcut_placement.py`, `shortcut_layout.py`): it stays put while
 *   the pointer is within its follow zone and jumps back to the offset once the pointer leaves it; inside the zone it
 *   fades in as the pointer approaches, from the fade start circle to its edge.
 * - `intent`: every move that heads within the button (inside the triangle from the pointer to the button's sides)
 *   builds intent up, and others wear it down by how far they head outside, so a slight miss only dims the button
 *   a little. The opacity follows the
 *   intent linearly, and the button moves back to the offset only once it is fully faded, so it never jumps while
 *   visible.
 * - `aim`, a safe triangle ("aim guard"): a move that lands inside the triangle from the previous pointer position to
 *   the button's far corners is aiming at it, so the button stops and fades in with the progress toward it; a move
 *   out of the triangle cancels the aim, and the button follows the pointer at the offset again.
 *
 * Outside those it shows at the idle opacity. Must be created within a Solid owner.
 */
export function createShortcutButton(options: Accessor<DebugOptions>) {
  const [center, setCenter] = createSignal({ x: 42, y: 42 });
  const [opacity, setOpacity] = createSignal(0);
  /** The safe triangle: its apex, the two base corners, and whether the pointer is aiming within it. */
  const [aim, setAim] = createSignal<{ apex: Point; base: [Point, Point]; active: boolean }>();
  /** The button was revealed under the pointer and stays until the pointer leaves it. */
  let revealed = false;
  let previous: Point | undefined;
  /** Intent mode: how sure it is that the pointer heads for the button, 0–1. */
  const [intent, setIntent] = createSignal(0);
  const [pointerAt, setPointerAt] = createSignal<Point>();

  const geometry = () => shortcutGeometry(options());
  const clamp = (point: { x: number; y: number }) => {
    const low = margin + options().launcherSize / 2;
    return {
      x: Math.min(Math.max(point.x, low), Math.max(low, innerWidth - low)),
      y: Math.min(Math.max(point.y, low), Math.max(low, innerHeight - low))
    };
  };

  return {
    center,
    opacity,
    clickable: () => opacity() >= clickOpacity,
    /** Follows a mouse or pen move: keeps, re-places and fades the button as the placement mode decides. */
    track(pointer: { x: number; y: number }) {
      const from = previous;
      previous = pointer;
      setPointerAt(pointer);
      const { offset, followZone, edge } = geometry();
      const idle = options().launcherIdleOpacity;
      if (options().launcherPlacement === 'intent') {
        trackIntent(pointer, from, offset, idle);
        return;
      }

      if (revealed) {
        if (distance(pointer, center()) <= edge + revealSlack) {
          setOpacity(1);
          return;
        }

        revealed = false;
      }

      if (options().launcherPlacement === 'aim') {
        const follow = () => {
          setCenter(clamp({ x: pointer.x + offset.x, y: pointer.y + offset.y }));
          setAim({ apex: pointer, base: farCorners(center(), pointer), active: false });
          setOpacity(idle);
        };
        const current = aim();
        if (current?.active) {
          const inside = onButton(pointer) || inTriangle(pointer, current.apex, ...current.base);
          if (inside) {
            setOpacity(Math.max(idle, progress(current.apex, pointer)));
          } else {
            follow();
          }

          return;
        }

        // A move too short to show a direction decides nothing.
        if (from && distance(from, pointer) < minAimMove) {
          return;
        }

        const base = from && farCorners(center(), from, options().launcherAimTolerance);
        if (from && base && inTriangle(pointer, from, ...base)) {
          setAim({ apex: from, base, active: true });
          setOpacity(Math.max(idle, progress(from, pointer)));
        } else {
          follow();
        }

        return;
      }

      if (distance(pointer, center()) > followZone) {
        setCenter(clamp({ x: pointer.x + offset.x, y: pointer.y + offset.y }));
      }

      setOpacity(Math.max(options().launcherIdleOpacity, proximity(distance(pointer, center()), geometry())));
    },
    /** Shows the button fully right under the pointer, as the addon does after the puck closes. */
    revealAt(pointer: { x: number; y: number }) {
      setCenter(clamp(pointer));
      setOpacity(1);
      setAim(undefined);
      revealed = true;
      previous = pointer;
      setIntent(1);
    },
    /** Intent mode's state, for showing it: the pointer, the intent and the triangle's base, the button's sides. */
    intent: () => {
      const pointer = pointerAt();
      return { pointer, intent: intent(), base: pointer && farCorners(center(), pointer) };
    },
    /** The safe triangle, for showing it. */
    aim,
    hide() {
      setOpacity(0);
    },
    geometry
  };

  /**
   * Intent mode: a move heading within the button's angular span, as seen from where it started, builds intent up
   * by its length (full intent after `launcherRise` px); a move heading outside wears it down by its length times
   * how far outside it heads, a right angle or more counting fully (full wear after `launcherFall` px). Close to the button the intent is full. The button moves to the
   * offset only while fully faded.
   */
  function trackIntent(pointer: Point, from: Point | undefined, offset: Point, idle: number) {
    const settings = options();
    const near = distance(pointer, center()) <= settings.launcherSize / 2 + nearSlack;
    let next = intent();
    if (near) {
      next = 1;
    } else if (from) {
      const length = distance(from, pointer);
      if (length > 0.5 && distance(from, center()) > 1e-3) {
        const heading = Math.atan2(center().y - from.y, center().x - from.x);
        const relative = (point: Point) => wrapAngle(Math.atan2(point.y - from.y, point.x - from.x) - heading);
        const [a, b] = farCorners(center(), from).map(relative) as [number, number];
        const move = relative(pointer);
        const outside =
          move < Math.min(a, b) ? Math.min(a, b) - move : move > Math.max(a, b) ? move - Math.max(a, b) : 0;
        next +=
          outside === 0
            ? length / settings.launcherRise
            : -(length * Math.min(1, outside / (Math.PI / 2))) / settings.launcherFall;
      }
    }

    next = Math.min(1, Math.max(0, next));
    setIntent(next);
    const shown = Math.max(idle, next);
    if (shown < 0.02) {
      // Invisible: back to the offset, unseen.
      setCenter(clamp({ x: pointer.x + offset.x, y: pointer.y + offset.y }));
      revealed = false;
    }

    setOpacity(shown);
  }

  function onButton(pointer: Point) {
    const half = options().launcherSize / 2;
    return Math.abs(pointer.x - center().x) <= half && Math.abs(pointer.y - center().y) <= half;
  }

  /** How far the pointer has come from the apex to the button's edge, 0–1, eased so that it shows early. */
  function progress(apex: Point, pointer: Point) {
    if (onButton(pointer)) {
      return 1;
    }

    const start = distance(apex, center());
    const edge = options().launcherSize / 2;
    const done = (start - distance(pointer, center())) / Math.max(start - edge, 1);
    return Math.sqrt(Math.min(1, Math.max(0, done)));
  }

  /**
   * The two corners of the button square that bound it as seen from `apex` (extremes across the direction to it),
   * pushed outward by `tolerance` CSS pixels: the safe triangle's base.
   */
  function farCorners(at: Point, apex: Point, tolerance = 0): [Point, Point] {
    const half = options().launcherSize / 2;
    const length = Math.max(distance(apex, at), 1e-6);
    const across = { x: -(at.y - apex.y) / length, y: (at.x - apex.x) / length };
    const corners = [
      { x: at.x - half, y: at.y - half },
      { x: at.x + half, y: at.y - half },
      { x: at.x + half, y: at.y + half },
      { x: at.x - half, y: at.y + half }
    ];
    const side = (corner: Point) => (corner.x - at.x) * across.x + (corner.y - at.y) * across.y;
    const sorted = [...corners].sort((a, b) => side(a) - side(b));
    const low = sorted[0]!,
      high = sorted[3]!;
    return [
      { x: low.x - across.x * tolerance, y: low.y - across.y * tolerance },
      { x: high.x + across.x * tolerance, y: high.y + across.y * tolerance }
    ];
  }
}

type Point = { x: number; y: number };

/** Intent mode: CSS pixels past the button's edge within which the intent is full. */
const nearSlack = 8;
/** CSS pixels past the revealed button's edge before it stops staying under the pointer. */
const revealSlack = 24;
/** CSS pixels a move must cover before it can show that the pointer aims at the button. */
const minAimMove = 2;

/** An angle in radians within (-π, π]. */
function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Whether `p` lies inside the triangle `a`, `b`, `c` (either winding). */
function inTriangle(p: Point, a: Point, b: Point, c: Point) {
  const cross = (o: Point, u: Point, v: Point) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
  const d1 = cross(a, b, p),
    d2 = cross(b, c, p),
    d3 = cross(c, a, p);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/**
 * The shortcut button and, with `zones`, its safe triangle (blue while tracking, green while aiming) or follow zone
 * (cyan) and fade start (orange). It renders while `pressing`
 * even when hidden, so that the press it captured keeps reaching `onPointerMove` and `onPointerUp`.
 */
export function ShortcutButton(props: {
  shortcut: ReturnType<typeof createShortcutButton>;
  size: number;
  /** Which reach the debug outlines show: the intent triangle, the safe triangle, or the follow zone and fade start. */
  reach: 'intent' | 'aim' | 'zone';
  hidden: boolean;
  pressing: boolean;
  zones: boolean;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
}) {
  const visible = () => !props.hidden && props.shortcut.opacity() > 0.01;

  return (
    <>
      <Show when={props.zones && !props.hidden && props.reach === 'aim' && props.shortcut.aim()}>
        {(aim) => {
          const color = () => (aim().active ? '#1fb26b' : '#2f8cff');
          const points = () => [aim().apex, ...aim().base].map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <svg class={styles.aimTriangle} aria-hidden="true">
              <polygon points={points()} fill={color()} fill-opacity="0.16" stroke={color()} stroke-dasharray="5 4" />
              <For each={[aim().apex, ...aim().base]}>{(p) => <circle cx={p.x} cy={p.y} r="3.5" fill={color()} />}</For>
            </svg>
          );
        }}
      </Show>
      <Show when={props.zones && !props.hidden && props.reach === 'intent' && props.shortcut.intent().pointer}>
        {(pointer) => {
          const state = () => props.shortcut.intent();
          const corners = () =>
            state()
              .base!.map((p) => `${p.x},${p.y}`)
              .join(' ');
          return (
            <svg class={styles.aimTriangle} aria-hidden="true">
              <polygon
                points={`${pointer().x},${pointer().y} ${corners()}`}
                fill="#1fb26b"
                fill-opacity={0.06 + state().intent * 0.25}
                stroke="#1fb26b"
                stroke-dasharray="5 4"
              />
              <text x={pointer().x + 12} y={pointer().y - 12} fill="#1fb26b" font-size="12">
                {Math.round(state().intent * 100)}%
              </text>
            </svg>
          );
        }}
      </Show>
      <Show when={props.zones && !props.hidden && props.reach === 'zone'}>
        <span
          class={styles.zoneCircle}
          style={circle(props.shortcut.center(), props.shortcut.geometry().followZone, '#00d9ffd9')}
        />
        <span
          class={styles.zoneCircle}
          style={circle(props.shortcut.center(), props.shortcut.geometry().fadeStart, '#ff5a00f2')}
        />
      </Show>
      <Show when={visible() || props.pressing}>
        <button
          class={[styles.launcher, styles.square]}
          data-cluster-ui
          style={{
            left: `${props.shortcut.center().x}px`,
            top: `${props.shortcut.center().y}px`,
            width: `${props.size}px`,
            // Debug drawing shows the reach, never the button itself: it fades out as it does without it.
            opacity: props.hidden ? 0 : props.shortcut.opacity(),
            'pointer-events': props.pressing || (!props.hidden && props.shortcut.clickable()) ? 'auto' : 'none'
          }}
          title="Press and drag toward a navigation square"
          onPointerDown={(event) => {
            if (event.button === 0) {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              props.onPointerDown(event);
            }
          }}
          onPointerMove={props.onPointerMove}
          onPointerUp={props.onPointerUp}
          onPointerCancel={props.onPointerUp}
        >
          <SketchIcon name="pan" size={Math.round(props.size * 0.5)} />
        </button>
      </Show>
    </>
  );
}

/** The addon's `click_opacity_threshold`. */
const clickOpacity = 0.12;
/** The addon's `DEFAULT_SHORTCUT_MARGIN`: the button's least distance from the window's edges. */
const margin = 14;
/** The addon's `DEFAULT_FADE_ZONE_MIN_INSET`. */
const fadeMinInset = 10;

/**
 * The addon's geometry: the offset from the pointer (the corner's ±1 components times the distance, which is at
 * least the button's radius), the follow zone (at least the button's diameter, else the offset's length plus the
 * radius) and the fade start, inset into the zone by the inset percentage of the zone, at least 10 px.
 */
function shortcutGeometry(options: DebugOptions) {
  // Below the pen, toward the pen hand's side, as the addon's default bottom-left does for the left hand.
  const [dx, dy] = options.hand === 'left' ? [-1, 1] : [1, 1];
  const edge = options.launcherSize / 2;
  const reach = Math.max(options.launcherDistance, edge);
  const offset = { x: dx * reach, y: dy * reach };
  const followZone = Math.max(edge * 2, Math.hypot(offset.x, offset.y) + edge);
  const inset = Math.max(fadeMinInset, followZone * (options.launcherFadeInset / 100));
  const fadeStart = Math.max(edge, followZone - inset);
  return { offset, edge, followZone, fadeStart };
}

/** The addon's `fade_proximity`: 1 on the button, 0 from the fade start outward, linear between. */
function proximity(distanceToButton: number, geometry: ReturnType<typeof shortcutGeometry>) {
  if (distanceToButton <= geometry.edge) {
    return 1;
  }

  if (distanceToButton >= geometry.fadeStart) {
    return 0;
  }

  return 1 - (distanceToButton - geometry.edge) / Math.max(geometry.fadeStart - geometry.edge, 1);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Style for a debug circle of `radius` around `center`. */
export function circle(center: { x: number; y: number }, radius: number, color: string) {
  return {
    left: `${center.x}px`,
    top: `${center.y}px`,
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
    'border-color': color
  };
}
