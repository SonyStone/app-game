import { worldToScreen, type Camera } from '../arena/camera';
import type { ThoughtView } from './Hud';
import type { KothMatch } from './match';
import type { Chronicle } from './chronicle';
import { BUBBLE_TIME, MARKER_TIME, type MarkerKind } from './radio';
import type { CalloutView } from './RadioOverlay';

/** What each bot thinks, with its label, path and target placed on screen. */
export function thoughtsOnScreen(
  match: KothMatch,
  camera: Camera,
  screen: { width: number; height: number }
): ThoughtView[] {
  const toScreen = (point: { x: number; y: number }) => worldToScreen(camera, point, screen);

  return match.thoughts().map((thought) => {
    const label = toScreen(thought.position);
    const target =
      thought.target && match.combat.armorOf(thought.target) ? toScreen(thought.target.hull.translation()) : undefined;

    return {
      id: thought.member.id,
      team: thought.member.team,
      name: thought.member.name,
      role: thought.member.role,
      goal: thought.goal ?? '',
      action: thought.breach
        ? `${thought.action ?? ''} · breach: ${thought.breach.method} ${thought.breach.phase}`
        : (thought.action ?? ''),
      steps: thought.steps.join(' → '),
      covering: thought.covering?.name,
      x: label.x,
      y: label.y,
      path: [thought.position, ...thought.path.slice(1)]
        .map(toScreen)
        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(' '),
      target
    };
  });
}

/**
 * What the bots say on the radio, placed on screen: the player's team's lines, or both teams'
 * while watching. A bubble fades over its last `BUBBLE_FADE` s and a marker over its last
 * `MARKER_FADE` s; a marker off the screen is held `EDGE_INSET` px inside its edge. The shot flies
 * from `SHOT_START` px off the speaker's tank to `SHOT_END` px short of the marker at `SHOT_SPEED`
 * px/s, by the match's clock, and is left out when that leaves less than `SHOT_SHORTEST` px.
 */
export function calloutsOnScreen(
  match: KothMatch,
  camera: Camera,
  screen: { width: number; height: number },
  watching: boolean
): CalloutView[] {
  const team = match.seat.team;

  return match
    .callouts()
    .filter((callout) => watching || callout.team === team)
    // Each team's radio numbers its own lines; the overlay tells them apart by number.
    .map((callout) => calloutView({ ...callout, id: callout.id * 2 + (callout.team === 'red' ? 0 : 1) }, match.time, camera, screen));
}

/**
 * The radio's lines at `time`, in steps, as a replay shows them from the match's chronicle and
 * as `calloutsOnScreen` places them: each from the step it was said for `BUBBLE_TIME` s, or
 * `MARKER_TIME` s with a marker, cut short when its speaker says another. Bubbles and markers on
 * tanks go where `positionOf` puts a member's tank then, as the replay draws it between steps; a
 * marker on a tank destroyed since stays where it went.
 *
 * @param positionOf - Where member `id`'s tank is at `time`, `undefined` while it waits to respawn.
 */
export function calloutsAt(
  chronicle: Chronicle,
  time: number,
  positionOf: (id: number) => { x: number; y: number } | undefined,
  camera: Camera,
  screen: { width: number; height: number }
): CalloutView[] {
  const now = time / 60;
  const radio = chronicle.radio;
  const seatOf = (id: number | undefined) => {
    const index = chronicle.members.findIndex((member) => member.id === id);
    const member = chronicle.members[index];
    return member && { name: member.name, team: member.team, seat: member.seat, player: index === 0 && member.human, human: member.human };
  };
  let first = 0;

  // Lines are kept in the order they were said; none said before the longest shows any more.
  for (let span = radio.length; span > 0; span >>= 1) {
    while (first + span <= radio.length && radio[first + span - 1].step < time - MARKER_TIME * 60) {
      first += span;
    }
  }

  const views: CalloutView[] = [];

  for (let index = first; index < radio.length && radio[index].step <= time; index++) {
    const line = radio[index];
    const at = line.step / 60;
    const cut = radio.slice(index + 1).find((later) => later.member === line.member && later.step <= time);
    const until = Math.min(at + (line.marker ? MARKER_TIME : BUBBLE_TIME), cut ? cut.step / 60 : Infinity);

    if (until <= now) {
      continue;
    }

    const on = line.marker?.on;
    const fell = on === undefined ? undefined : chronicle.kills.find((kill) => kill.victim === on && kill.step > line.step && kill.step <= time);
    const marked = on === undefined || fell ? undefined : positionOf(on);
    const marker = line.marker && { kind: line.marker.kind, ...(fell ? { x: fell.x, y: fell.y } : (marked ?? line.marker)) };
    views.push(
      calloutView(
        { ...line, id: index, team: seatOf(line.member)!.team, ally: seatOf(line.ally), at, until, speaker: positionOf(line.member), marker },
        now,
        camera,
        screen
      )
    );
  }

  return views;
}

/** A line on the radio, said `at` and shown `until`, in seconds, placed on screen at `now` (see `calloutsOnScreen`). */
function calloutView(
  callout: Omit<CalloutView, 'bubble' | 'shot' | 'marker' | 'tankClass' | 'lane' | 'seconds'> &
    Partial<Pick<CalloutView, 'tankClass' | 'lane' | 'seconds'>> & {
    at: number;
    until: number;
    speaker: { x: number; y: number } | undefined;
    marker: { kind: MarkerKind; x: number; y: number } | undefined;
  },
  now: number,
  camera: Camera,
  screen: { width: number; height: number }
): CalloutView {
  const said = now - callout.at;
  const speaker = callout.speaker && said < BUBBLE_TIME ? worldToScreen(camera, callout.speaker, screen) : undefined;
  const marker = callout.marker && worldToScreen(camera, callout.marker, screen);
  const held = marker && {
    x: Math.min(Math.max(marker.x, EDGE_INSET), screen.width - EDGE_INSET),
    y: Math.min(Math.max(marker.y, EDGE_INSET), screen.height - EDGE_INSET)
  };
  const off = marker && held && (held.x !== marker.x || held.y !== marker.y);
  const bubbleOpacity = Math.min((BUBBLE_TIME - said) / BUBBLE_FADE, 1);

  return {
    id: callout.id,
    team: callout.team,
    line: callout.line,
    tankClass: callout.tankClass,
    ally: callout.ally,
    lane: callout.lane,
    seconds: callout.seconds,
    bubble: speaker && { x: speaker.x, y: speaker.y, opacity: bubbleOpacity },
    shot: speaker && held ? shotBetween(speaker, held, said, bubbleOpacity) : undefined,
    marker:
      callout.marker && held
        ? {
            ...held,
            kind: callout.marker.kind,
            opacity: Math.min((callout.until - now) / MARKER_FADE, 1),
            edge: off ? Math.atan2(marker.y - screen.height / 2, marker.x - screen.width / 2) : undefined
          }
        : undefined
  };
}

const BUBBLE_FADE = 0.4;
const MARKER_FADE = 0.8;
const EDGE_INSET = 34;

/**
 * The radio shot from the speaker at `from` to the marker at `to`, on screen, cut short at both
 * ends, `said` s after it was fired; none if too short. The bolt, `BOLT_LENGTH` px or less on a
 * short way, comes out of the speaker and flies with its head reaching the target in `flight` s,
 * then is gone.
 */
function shotBetween(from: { x: number; y: number }, to: { x: number; y: number }, said: number, opacity: number) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const shown = length - SHOT_START - SHOT_END;

  if (shown < SHOT_SHORTEST) {
    return undefined;
  }

  const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const at = (distance: number) => ({ x: from.x + along.x * (SHOT_START + distance), y: from.y + along.y * (SHOT_START + distance) });
  const flight = Math.min(Math.max(shown / SHOT_SPEED, SHOT_QUICKEST), SHOT_SLOWEST);
  const head = (said / flight) * shown;
  const tail = Math.max(head - Math.min(BOLT_LENGTH, shown * 0.6), 0);

  return {
    bolt: head < shown ? { tail: at(tail), head: at(head) } : undefined,
    to: at(shown),
    flight,
    opacity
  };
}

const SHOT_START = 22;
const SHOT_END = 12;
const SHOT_SHORTEST = 24;
const SHOT_SPEED = 1200;
/** Seconds a shot flies at least and at most, so a near one is still seen and a far one does not keep the marker waiting. */
const SHOT_QUICKEST = 0.15;
const SHOT_SLOWEST = 0.4;
const BOLT_LENGTH = 110;

/** Sizes the canvas's drawing buffer to its CSS size times the device pixel ratio; returns the CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = window.devicePixelRatio;
  const pixelWidth = Math.max(Math.round(width * ratio), 1);
  const pixelHeight = Math.max(Math.round(height * ratio), 1);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  return { width, height };
}
