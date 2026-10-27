import { worldToScreen, type Camera } from '../arena/camera';
import type { ThoughtView } from './Hud';
import type { KothMatch } from './match';
import { BUBBLE_TIME } from './radio';
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
  const now = match.time;
  const team = match.seat.team;

  return match
    .callouts()
    .filter((callout) => watching || callout.team === team)
    .map((callout) => {
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
    });
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
