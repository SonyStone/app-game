import { createEventListener, makeEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { worldToScreen, type Camera } from '../arena/camera';
import { forecastShot, type Lane, type ShotForecast, type Verdict } from './aim';
import type { HudState } from './Hud';
import type { KothMatch } from './match';

type Point = { x: number; y: number };

/**
 * The player's aim, drawn over the canvas on top of everything the battle draws, smoke, fire and
 * explosions included, in the game's look: light strokes with a black outline.
 *
 * - The crosshair replaces the cursor over the canvas. It is moved by every pointer event itself,
 *   not by the game's frame, so it sits under the latest pointer position. Around its center it
 *   shows the weapon at a glance: the rounds in the clip and the one loading, a gatling's belt and
 *   spin, a casemate gun's charge. It turns red when the shot will hit an enemy, orange when it
 *   would only glance off, and fades when the pointer is beyond the shot's reach.
 * - The forecast of the next shot from `aimOnScreen`: the way the shell flies from the muzzle to
 *   where it stops, red where it hits an enemy; a fan for a weapon that spreads its shots, with a
 *   dot where each lane ends; a grenade's way as dots that swell as it flies higher and shrink
 *   where it lands, bounces and rolls; and a mark where a lane stops that tells what happens
 *   there: an X on an enemy hit, a bar across the lane at a wall, wreck or crate in the way
 *   (yellow and broken where shots chip it, white and whole where they cannot), or a small ring
 *   where it falls with nothing in range. A shell that goes off shows its blast's reach, red
 *   around every other enemy it reaches. The line from the gun also shows where the player's own
 *   tank is, so the tank needs no marker of its own.
 *
 * Three looks differ in the line and the crosshair's center; X cycles through them and `?aim=`
 * in the address picks one (see `AIM_LOOKS`).
 *
 * @param canvas - The game canvas: the pointer is followed over it, and the cursor is hidden over it while `active`.
 * @param view - Where the aim is on screen this frame, from `aimOnScreen`.
 * @param player - The player's weapon as the heads-up display shows it.
 * @param active - Whether the player is playing: without a menu, the match's result or watching
 *   the bots. Otherwise nothing is drawn and the cursor shows as usual.
 */
export function AimOverlay(props: { canvas: HTMLCanvasElement | undefined; view: AimView | undefined; player: HudState['player'] | undefined; active: boolean }) {
  const [look, setLook] = createSignal(lookFromAddress());
  const [hovering, setHovering] = createSignal(false);
  const [notice, setNotice] = createSignal(false);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let crosshair: HTMLDivElement | undefined;

  createEventListener(
    () => props.canvas,
    ['pointermove', 'pointerdown', 'pointerover'],
    (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        return;
      }

      crosshair?.style.setProperty('transform', `translate(${event.offsetX - CROSSHAIR_SIZE / 2}px, ${event.offsetY - CROSSHAIR_SIZE / 2}px)`);
      setHovering(true);
    }
  );
  createEventListener(() => props.canvas, 'pointerleave', () => setHovering(false));

  makeEventListener(window, 'keydown', (event) => {
    if (event.code === 'KeyX' && !event.repeat) {
      setLook((current) => AIM_LOOK_IDS[(AIM_LOOK_IDS.indexOf(current) + 1) % AIM_LOOK_IDS.length]);
      clearTimeout(noticeTimer);
      setNotice(true);
      noticeTimer = setTimeout(() => setNotice(false), NOTICE_TIME);
    }
  });
  onCleanup(() => clearTimeout(noticeTimer));

  createEffect(
    () => ({ canvas: props.canvas, hidden: props.active }),
    ({ canvas, hidden }) => {
      if (canvas) {
        canvas.style.cursor = hidden ? 'none' : '';
      }
    }
  );

  const shot = () => (props.active ? props.view?.shot : undefined);

  return (
    <>
      <svg class="pointer-events-none absolute inset-0 h-full w-full">
        <Show when={shot()}>{(shown) => <ShotMarks shot={shown()} look={AIM_LOOKS[look()]} />}</Show>
      </svg>
      <div
        ref={(element) => (crosshair = element)}
        class="pointer-events-none absolute left-0 top-0"
        style={{ display: props.active && hovering() ? 'block' : 'none', width: `${CROSSHAIR_SIZE}px`, height: `${CROSSHAIR_SIZE}px` }}
      >
        <Crosshair player={props.player} verdict={shot()?.verdict} out={shot()?.out ?? false} look={AIM_LOOKS[look()]} />
      </div>
      <Show when={notice()}>
        <div class="pointer-events-none absolute left-1/2 top-32 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm font-bold text-white">
          Aim look: {AIM_LOOKS[look()].name} (X)
        </div>
      </Show>
    </>
  );
}

/**
 * Where the player's aim is on screen this frame: the forecast of the shot the gun would fire now
 * (see `forecastShot`), in CSS pixels. `undefined` while the player has no tank.
 *
 * @param input.angle - The direction the player aims, in world radians; defaults to the turret's.
 * @param input.reach - How far from the hull's center the player aims, in world pixels.
 * @param view - The camera the frame is drawn with, shake included, so the marks stay on what they mark.
 */
export function aimOnScreen(match: KothMatch, input: { angle?: number; reach?: number }, view: Camera, screen: { width: number; height: number }): AimView | undefined {
  const tank = match.player;

  if (!tank) {
    return undefined;
  }

  const toScreen = (point: Point) => worldToScreen(view, point, screen);
  const forecast = forecastShot(match.combat, tank, match.seat.tankClass, input.angle ?? tank.turretAngle, input.reach);

  return { shot: forecast && shotOnScreen(forecast, input.reach, toScreen, view) };
}

/** What `AimOverlay` draws for a frame, from `aimOnScreen`, in CSS pixels. */
export type AimView = {
  /** The forecast of the next shot; `undefined` for a gun with a laser sight of its own. */
  shot: ShotView | undefined;
};

/** A shot's forecast placed on screen, as `ShotMarks` draws it. */
type ShotView = {
  kind: ShotForecast['kind'];
  verdict: Verdict;
  /** Each lane's points over the ground and its end. */
  lanes: { points: Point[]; end: ScreenEnd; weight: number }[];
  /**
   * A grenade's way as dots over the ground, each as large as the grenade flies high there, so
   * the dots swell over its arc and shrink where it lands, bounces and rolls; and where it first lands.
   */
  hops: { x: number; y: number; radius: number }[] | undefined;
  landing: Point | undefined;
  /** The outline of the fan a spreading weapon's lanes cover, muzzle first. */
  fan: Point[] | undefined;
  blast: { x: number; y: number; radius: number; reaches: { x: number; y: number; radius: number }[] } | undefined;
  /** The pointer is farther than the shot reaches, or closer than a grenade's shortest throw. */
  out: boolean;
};

/** Where a lane ends on screen, which way the shell flies there and what it meets, as `LaneEnd` says. */
type ScreenEnd = Point & Pick<Lane['end'], 'meets' | 'core' | 'breakable' | 'glancing'> & { angle: number; enemy: boolean };

/** Places a forecast on screen with `toScreen`. */
function shotOnScreen(forecast: ShotForecast, reach: number | undefined, toScreen: (point: Point) => Point, view: Camera): ShotView {
  const lanes = forecast.lanes.map((lane) => {
    const points = lane.path.map((point) => toScreen(point));
    const end = toScreen(lane.end.at);
    const ahead = toScreen({ x: lane.end.at.x + lane.end.heading.x, y: lane.end.at.y + lane.end.heading.y });
    const { meets, core, breakable, glancing } = lane.end;
    return { points, end: { ...end, angle: Math.atan2(ahead.y - end.y, ahead.x - end.x), meets, core, breakable, glancing, enemy: lane.end.tank !== undefined }, weight: lane.weight };
  });
  const lob = forecast.kind === 'lob' ? forecast.lanes[0] : undefined;
  const blast = forecast.blast;

  return {
    kind: forecast.kind,
    verdict: forecast.verdict,
    lanes,
    hops: lob && hopDots(lob.path.map((point) => ({ ...toScreen(point), height: point.height }))),
    landing: lob?.landing && toScreen(lob.landing),
    fan: forecast.spread > 0 ? fanOutline(lanes) : undefined,
    // A tank the shell hits head on is marked where it hits; the blast's ring marks the others it reaches.
    blast: blast && {
      ...toScreen(blast.at),
      radius: blast.radius * view.zoom,
      reaches: blast.reaches
        .filter((tank) => !forecast.lanes.some((lane) => lane.end.tank === tank))
        .map((tank) => ({ ...toScreen(tank.hull.translation()), radius: REACHED_RADIUS * view.zoom }))
    },
    out: reach !== undefined && (reach > forecast.reachable.max || reach < forecast.reachable.min)
  };
}

/** Dots every `HOP_SPACING` pixels along a grenade's way on screen, sized by its height there. */
function hopDots(path: readonly { x: number; y: number; height: number }[]) {
  const dots: { x: number; y: number; radius: number }[] = [];
  let carried = 0;

  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    for (let along = HOP_SPACING - carried; along <= length; along += HOP_SPACING) {
      const share = along / length;
      const height = from.height + (to.height - from.height) * share;
      dots.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share, radius: HOP_DOT + height * HOP_GROWTH });
    }

    carried = (carried + length) % HOP_SPACING;
  }

  return dots;
}

/** Screen pixels between the dots of a grenade's way, a dot's radius on the ground and its growth per world pixel of height. */
const HOP_SPACING = 9;
const HOP_DOT = 1.3;
const HOP_GROWTH = 0.07;

/** The outline of a fan of lanes: from the muzzle of its leftmost lane, along their ends in turn, back to its rightmost lane's muzzle. */
function fanOutline(lanes: readonly { points: Point[] }[]) {
  const muzzle = lanes[0].points[0];
  const sorted = [...lanes].sort((a, b) => sideOf(muzzle, a.points.at(-1)!, lanes[0].points.at(-1)!) - sideOf(muzzle, b.points.at(-1)!, lanes[0].points.at(-1)!));
  return [sorted[0].points[0], ...sorted.map((lane) => lane.points.at(-1)!), sorted.at(-1)!.points[0]];
}

/** Signed angle at `origin` from `reference` to `point`. */
function sideOf(origin: Point, point: Point, reference: Point) {
  const a = Math.atan2(point.y - origin.y, point.x - origin.x);
  const b = Math.atan2(reference.y - origin.y, reference.x - origin.x);
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Radius in world pixels of the ring around an enemy a blast reaches. */
const REACHED_RADIUS = 26;

/**
 * The looks the aim can take: how the line is drawn and the crosshair's center.
 *
 * - `dots`: a dotted line, light round dots with dark rims that show over any ground, and a cross.
 * - `line`: a thin solid line, and a dot inside small brackets.
 * - `dash`: a dashed line, and a cross turned on its side.
 */
export const AIM_LOOKS = {
  dots: { name: 'Dots', dash: '0 7', width: 3, center: 'cross' },
  line: { name: 'Line', dash: undefined, width: 1.6, center: 'dot' },
  dash: { name: 'Dashes', dash: '7 5', width: 2, center: 'saltire' }
} as const satisfies Record<string, AimLook>;

/** One of `AIM_LOOKS`. */
type AimLook = {
  name: string;
  /** SVG dash pattern of the line; dots are dashes of zero length with round caps. */
  dash: string | undefined;
  /** Stroke width of the line's light middle. */
  width: number;
  /** The crosshair's center: an upright cross, a dot in brackets or a diagonal cross. */
  center: 'cross' | 'dot' | 'saltire';
};

const AIM_LOOK_IDS = Object.keys(AIM_LOOKS) as (keyof typeof AIM_LOOKS)[];

/** The look picked by `?aim=` in the address, else `dots`. */
function lookFromAddress() {
  const asked = new URLSearchParams(window.location.search).get('aim');
  return AIM_LOOK_IDS.find((id) => id === asked) ?? 'dots';
}

/** The light middle of every mark, its dark outline, and the colors that tell what a shot does. */
const LIGHT = '#fbf7ec';
const INK = '#151515';
const HIT = '#ff3b2f';
const KILL = '#ffd23f';
const GLANCE = '#ffa63d';
const BREAKS = '#ffd27a';
const SOLID = '#a3abb5';

/**
 * A stroke in the game's look: `d` drawn in `color` over a dark outline `outline` pixels wider,
 * both with the same dashes, so it reads over light ground, dark ground and smoke alike.
 */
function Stroke(props: { d: string; color: string; width: number; dash?: string; opacity?: number; outline?: number; fill?: string }) {
  return (
    <g opacity={props.opacity ?? 1} fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d={props.d} stroke={INK} stroke-width={props.width + (props.outline ?? 2)} stroke-dasharray={props.dash} stroke-opacity="0.75" />
      <path d={props.d} stroke={props.color} stroke-width={props.width} stroke-dasharray={props.dash} fill={props.fill ?? 'none'} />
    </g>
  );
}

/**
 * The forecast of the next shot: its lanes, its fan or a grenade's dots, the blast's reach and the
 * mark at every lane's end.
 */
function ShotMarks(props: { shot: ShotView; look: AimLook }) {
  const paths = createMemo(() => shotPaths(props.shot));

  return (
    <>
      <Show when={props.shot.fan}>
        {(fan) => (
          <>
            <path d={`${polyline(fan())} Z`} fill={props.shot.verdict === 'hit' || props.shot.verdict === 'kill' ? HIT : LIGHT} fill-opacity="0.16" stroke="none" />
            <Stroke d={paths().fanEdges} color={LIGHT} width={1.2} opacity={0.75} />
          </>
        )}
      </Show>
      <Show when={props.shot.hops}>
        {(hops) => (
          <path
            d={hops().map((dot) => circlePath(dot.x, dot.y, dot.radius)).join(' ')}
            fill={props.shot.verdict === 'hit' || props.shot.verdict === 'kill' ? HIT : LIGHT}
            fill-opacity="0.9"
            stroke={INK}
            stroke-opacity="0.75"
            stroke-width="1.6"
            paint-order="stroke"
          />
        )}
      </Show>
      <Show when={!props.shot.fan && !props.shot.hops}>
        <Stroke d={paths().lanes} color={LIGHT} width={props.look.width} dash={props.look.dash} opacity={0.85} />
        <Stroke d={paths().hitLanes} color={HIT} width={props.look.width} dash={props.look.dash} />
      </Show>
      <Show when={props.shot.blast}>
        {(blast) => (
          <>
            <Stroke
              d={circlePath(blast().x, blast().y, blast().radius)}
              color={blast().reaches.length > 0 ? HIT : LIGHT}
              width={1.3}
              dash="4 5"
              opacity={blast().reaches.length > 0 ? 0.9 : 0.5}
            />
            <Stroke d={blast().reaches.map((tank) => circlePath(tank.x, tank.y, tank.radius)).join(' ')} color={HIT} width={2} dash="3 3" />
          </>
        )}
      </Show>
      <Show when={props.shot.landing}>{(landing) => <Stroke d={circlePath(landing().x, landing().y, 4)} color={LIGHT} width={1.5} opacity={0.85} />}</Show>
      <Stroke d={paths().clear} color={LIGHT} width={1.5} opacity={0.8} />
      <Stroke d={paths().breaks} color={BREAKS} width={3} outline={2.6} />
      <Stroke d={paths().solid} color={LIGHT} width={3} outline={2.6} />
      <Stroke d={paths().pellets} color={LIGHT} width={1.6} />
      <Stroke d={paths().glances} color={GLANCE} width={2.2} />
      <Stroke d={paths().hits} color={HIT} width={3} outline={2.8} />
      <Stroke d={paths().kills} color={KILL} width={2.4} outline={2.6} />
    </>
  );
}

/** The SVG paths of a shot's lanes and end marks, grouped by how they are drawn. */
function shotPaths(shot: ShotView) {
  const enemyHit = (end: ScreenEnd) => end.enemy && !end.glancing;
  const fanned = shot.fan !== undefined;
  const ends = shot.lanes.map((lane) => lane.end);
  const edges = fanned ? [shot.fan![0], shot.fan![1], shot.fan!.at(-2)!, shot.fan!.at(-1)!] : [];

  return {
    lanes: shot.lanes.filter((lane) => !enemyHit(lane.end)).map((lane) => polyline(lane.points)).join(' '),
    hitLanes: shot.lanes.filter((lane) => enemyHit(lane.end)).map((lane) => polyline(lane.points)).join(' '),
    fanEdges: fanned ? `${polyline(edges.slice(0, 2))} ${polyline(edges.slice(2))}` : '',
    // A fan's lanes end in dots, red where they hit; a single lane in a mark of what it meets.
    pellets: fanned ? ends.filter((end) => !end.enemy).map((end) => circlePath(end.x, end.y, 1.6)).join(' ') : '',
    hits: ends
      .filter((end) => enemyHit(end))
      .map((end) => (fanned ? circlePath(end.x, end.y, 2.4) : crossMark(end, 4, 12)))
      .join(' '),
    kills: ends
      .filter((end) => end.core)
      .map((end) => circlePath(end.x, end.y, 13))
      .join(' '),
    glances: ends
      .filter((end) => end.enemy && end.glancing)
      .map((end) => crossMark(end, 3.5, 9))
      .join(' '),
    breaks: fanned ? '' : ends.filter((end) => blocked(end) && end.breakable).map((end) => wallMark(end, true)).join(' '),
    solid: fanned ? '' : ends.filter((end) => blocked(end) && !end.breakable).map((end) => wallMark(end, false)).join(' '),
    clear: fanned || shot.kind === 'lob' ? '' : ends.filter((end) => end.meets === 'nothing').map((end) => circlePath(end.x, end.y, 3.5)).join(' ')
  };
}

/** Whether a lane stops at something that is not an enemy tank. */
function blocked(end: ScreenEnd) {
  return !end.enemy && end.meets !== 'nothing';
}

/** An X of four strokes from `inner` to `outer` pixels around a point, as shooters mark a hit. */
function crossMark(at: Point, inner: number, outer: number) {
  return [1, 3, 5, 7]
    .map((eighth) => {
      const angle = (eighth * Math.PI) / 4;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return `M ${at.x + cos * inner} ${at.y + sin * inner} L ${at.x + cos * outer} ${at.y + sin * outer}`;
    })
    .join(' ');
}

/**
 * A bar across the lane where it meets a wall: whole where shots cannot chip it, broken in the
 * middle where they can.
 */
function wallMark(end: ScreenEnd, breaks: boolean) {
  const across = { x: -Math.sin(end.angle), y: Math.cos(end.angle) };
  const half = 10;
  const gap = breaks ? 2.5 : 0;
  const segment = (from: number, to: number) => `M ${end.x + across.x * from} ${end.y + across.y * from} L ${end.x + across.x * to} ${end.y + across.y * to}`;
  return breaks ? `${segment(-half, -gap)} ${segment(gap, half)}` : segment(-half, half);
}

/**
 * The crosshair: a center that marks the exact aim point, ticks red when the shot will hit and the
 * weapon's state around it: the clip's rounds as segments of a ring, the round loading filling the
 * next one; a gatling's belt as one arc and its spin inside it; a casemate gun's charge filling
 * the ring. It fades when the pointer is beyond the shot's reach.
 */
function Crosshair(props: { player: HudState['player'] | undefined; verdict: Verdict | undefined; out: boolean; look: AimLook }) {
  const middle = CROSSHAIR_SIZE / 2;
  const tint = () => (props.verdict === 'hit' || props.verdict === 'kill' || props.verdict === 'splash' ? HIT : props.verdict === 'glance' ? GLANCE : LIGHT);
  const center = () => crosshairCenter(props.look.center, middle);

  return (
    <svg width={CROSSHAIR_SIZE} height={CROSSHAIR_SIZE} viewBox={`0 0 ${CROSSHAIR_SIZE} ${CROSSHAIR_SIZE}`} class="block overflow-visible" opacity={props.out ? 0.5 : 1}>
      <Show when={props.player?.alive && props.player}>{(player) => <WeaponRing player={player()} middle={middle} />}</Show>
      <Stroke d={center()} color={tint()} width={2.6} outline={2.6} dash={props.out ? '2.5 3' : undefined} />
      <Stroke d={circlePath(middle, middle, 1.2)} color={tint()} width={1.8} fill={tint()} />
    </svg>
  );
}

/** Width and height of the crosshair's box in CSS pixels. */
const CROSSHAIR_SIZE = 84;
/** Radius of the ring of rounds and of the gatling's spin inside it. */
const RING_RADIUS = 26;
const SPIN_RADIUS = 21;

/** The SVG path of the crosshair's center for a look: an upright cross, the corners of brackets around the dot, or a diagonal cross. */
function crosshairCenter(kind: AimLook['center'], middle: number) {
  const ticks = (turn: number) =>
    [0, 1, 2, 3]
      .map((quarter) => {
        const angle = turn + (quarter * Math.PI) / 2;
        return `M ${middle + Math.cos(angle) * 7} ${middle + Math.sin(angle) * 7} L ${middle + Math.cos(angle) * 17} ${middle + Math.sin(angle) * 17}`;
      })
      .join(' ');

  if (kind === 'dot') {
    const corner = (sx: number, sy: number) => `M ${middle + sx * 11} ${middle + sy * 5} L ${middle + sx * 11} ${middle + sy * 11} L ${middle + sx * 5} ${middle + sy * 11}`;
    return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].join(' ');
  }

  return ticks(kind === 'saltire' ? Math.PI / 4 : 0);
}

/**
 * The weapon's state around the crosshair, read from the heads-up display: rounds of a clip of up
 * to `MAX_PIPS` as segments, a bigger clip, the gatling's belt, as one arc with the spin inside
 * it, and a charged shot as an arc that fills and turns red when full.
 */
function WeaponRing(props: { player: HudState['player']; middle: number }) {
  const segments = () => ringSegments(props.player);

  return (
    <>
      <For each={segments()} keyed={false}>
        {(segment) => (
          <>
            <path
              d={arcPath(props.middle, segment().radius, segment().from, segment().to)}
              fill="none"
              stroke={INK}
              stroke-opacity="0.45"
              stroke-width={segment().width + 2.2}
            />
            <Show when={segment().filled > segment().from}>
              <path
                d={arcPath(props.middle, segment().radius, segment().from, Math.min(segment().filled, segment().to))}
                fill="none"
                stroke={segment().color}
                stroke-width={segment().width}
              />
            </Show>
          </>
        )}
      </For>
    </>
  );
}

/** Most rounds a clip may hold to show them one by one around the crosshair. */
const MAX_PIPS = 12;

/**
 * The arcs of the crosshair's ring for the player's weapon, angles in radians clockwise from the
 * top: each with its radius, the part filled and the fill's color.
 */
function ringSegments(player: HudState['player']) {
  const full = Math.PI * 2;
  const top = -Math.PI / 2;

  if (player.weapon === 'charge') {
    const charge = player.charge ?? (player.rounds > 0 ? 0 : player.loading);
    const color = player.charge === undefined ? SOLID : player.charge >= 0.95 ? HIT : BREAKS;
    return [{ radius: RING_RADIUS, from: top, to: top + full - 0.001, filled: top + full * charge, width: 3, color }];
  }

  if (player.clip > MAX_PIPS) {
    const belt = { radius: RING_RADIUS, from: top, to: top + full - 0.001, filled: top + full * (player.rounds / player.clip), width: 3, color: BREAKS };
    const spin = { radius: SPIN_RADIUS, from: top, to: top + full - 0.001, filled: top + full * player.spin, width: 2, color: player.spin >= 1 ? BREAKS : LIGHT };
    return player.weapon === 'spin' ? [belt, spin] : [belt];
  }

  const gap = 0.16;
  const each = full / player.clip;

  return Array.from({ length: player.clip }, (_, index) => {
    const from = top + index * each + gap / 2;
    const to = from + each - gap;
    const share = index < player.rounds ? 1 : index === player.rounds ? player.loading : 0;
    return { radius: RING_RADIUS, from, to, filled: from + (to - from) * share, width: 3.2, color: index < player.rounds ? BREAKS : LIGHT };
  });
}

/** Milliseconds the notice of a newly picked look stays. */
const NOTICE_TIME = 1400;

/** An SVG path through `points`. */
function polyline(points: readonly Point[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

/** An SVG path of a circle, starting at its left. */
function circlePath(x: number, y: number, radius: number) {
  return `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}

/** An SVG arc about (`middle`, `middle`) from angle `from` to `to`, clockwise, in radians. */
function arcPath(middle: number, radius: number, from: number, to: number) {
  const start = { x: middle + Math.cos(from) * radius, y: middle + Math.sin(from) * radius };
  const end = { x: middle + Math.cos(to) * radius, y: middle + Math.sin(to) * radius };
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${to - from > Math.PI ? 1 : 0} 1 ${end.x} ${end.y}`;
}
