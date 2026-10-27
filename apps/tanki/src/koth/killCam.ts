import { worldToScreen, type Camera } from '../arena/camera';
import { PARTICLE_TRAIL, type createRangeRenderer } from '../damage/renderer';
import type { Chronicle } from './chronicle';
import type { SeatHud } from './match';
import { createTapePlayer, type Tape } from './tape';
import type { TankClassId } from './tanks';

type Point = { x: number; y: number };

/**
 * The kill-cam: how a tank was destroyed, told from the match's tape as a short film on `renderer`
 * (see `directKillCam` for its shots). The film starts from `camera`, the view as the tank went,
 * zooms in from its zoom and draws over the match, which goes on meanwhile; the caller keeps the
 * match's own drawing off `renderer` while it shows.
 *
 * @param kill - The kill, with the members as the match and the tape number them.
 * @param who - The killer's seat and class, as the display names them; none for a tank lost to its own side or nobody.
 */
export function createKillCam(
  renderer: ReturnType<typeof createRangeRenderer>,
  tape: Tape,
  chronicle: Chronicle,
  kill: KillCamKill,
  who: { killer: SeatHud | undefined; tankClass: TankClassId | undefined },
  camera: Camera
) {
  const film = directKillCam(tape, chronicle, kill);
  const player = createTapePlayer(renderer, tape);
  const view = { ...camera };
  // Close-ups zoom in from the view as it was, or from a near one when that showed the whole map.
  const base = Math.max(camera.zoom, LEAST_ZOOM);
  let elapsed = 0;

  return {
    film,

    /**
     * Shows the film `dt` s on, on `screen`: what the display shows over it, or `undefined` once
     * it is over, when nothing was drawn.
     */
    frame(dt: number, screen: { width: number; height: number }, background: readonly number[]) {
      elapsed += dt;
      const shot = filmAt(film, elapsed);

      if (!shot) {
        return undefined;
      }

      const shown = player.show(Math.min(shot.time, tape.end ?? shot.time));
      const both = [film.killerAt(shot.time) ?? film.hit, film.hit];
      const fit = Math.min(
        Math.max(Math.min(screen.width / (Math.abs(both[0].x - both[1].x) + FIT_MARGIN.x), screen.height / (Math.abs(both[0].y - both[1].y) + FIT_MARGIN.y)), 0.5),
        1.4
      );
      const zoom = base * shot.zoom + (fit - base * shot.zoom) * shot.fit;
      // Shots follow on from one another; easing toward each one's view smooths the joins.
      const ease = dt === 0 ? 0 : Math.min(dt * CAMERA_EASE, 1);
      view.x += (shot.focus.x - view.x) * ease;
      view.y += (shot.focus.y - view.y) * ease;
      view.zoom += (zoom - view.zoom) * ease;
      view.rotation += Math.atan2(Math.sin(shot.rotation - view.rotation), Math.cos(shot.rotation - view.rotation)) * ease;
      const shaken = {
        ...view,
        x: view.x + (Math.random() * 2 - 1) * shot.shake * SHAKE,
        y: view.y + (Math.random() * 2 - 1) * shot.shake * SHAKE
      };
      renderer.render(shaken, screen, background, shown?.age ?? 0);

      return {
        bars: shot.bars,
        grey: shot.grey,
        rewind: shot.kind === 'rewind',
        card: shot.card > 0 ? { ...who, ...film.story, opacity: shot.card } : undefined,
        bam: shot.bam && { ...worldToScreen(shaken, film.hit, screen), ...shot.bam },
        stats: shot.stats > 0 ? { range: film.range, armor: film.story.armor, opacity: shot.stats } : undefined
      };
    }
  };
}

/** What the kill-cam shows over its film, as `createKillCam`'s `frame` returns it. */
export type KillCamView = NonNullable<ReturnType<ReturnType<typeof createKillCam>['frame']>>;

/**
 * A kill as the kill-cam tells it: the step the tank went, the members by their place in the
 * match's list (which the tape and the chronicle keep), the killer's if any, and where the tank was.
 */
export type KillCamKill = { death: number; killer: number | undefined; victim: number; at: Point };

/**
 * Plans the kill-cam's film of `kill` from the tape and the chronicle: shots, each so long in
 * seconds, that show the tape from one step to another.
 *
 * - `freeze`: the moment the tank went, near stopped, as the picture greys and black bars come in.
 * - `rewind`: the tape run back to a moment before the fatal shot, on to the killer.
 * - `killer`: the killer up to the shot, with a card of who it was and what it had in mind.
 * - `fire`: the shot, slowed.
 * - `flight`: the camera rides the shell to its target, turned so the shell flies up the screen.
 * - `impact`: held a step short of the hit, with a «BAM!».
 * - `blast`: the tank going, the view shaking and pulling back to show both tanks, with the shot's range.
 * - `out`: the bars and the grey go.
 *
 * With no killer, `approach` shows the tank's last moments in place of the killer, shot and flight.
 */
export function directKillCam(tape: Tape, chronicle: Chronicle, kill: KillCamKill) {
  const death = kill.death;
  const shot = kill.killer === undefined ? undefined : fatalShotOf(tape, kill.killer, death, kill.at);
  const fired = shot?.fired ?? death - UNSEEN_FLIGHT;
  const hit = shot?.hit ?? death;
  const from = Math.max(fired - KILLER_TIME * 60, death - MOST_BEFORE * 60, tape.start ?? 0);
  const aim = Math.max(fired - FIRE_LEAD, from);
  // Held a step short of the hit, though not before the shot, as a rail's strikes the step it is fired.
  const held = Math.max(hit - 1, fired + 1);
  const shots: Shot[] = [
    { kind: 'freeze', length: 0.5, from: death, to: death + 4 },
    { kind: 'rewind', length: 0.75, from: death + 4, to: from }
  ];

  if (kill.killer === undefined) {
    shots.push({ kind: 'approach', length: 1.4, from, to: held });
  } else {
    shots.push(
      { kind: 'killer', length: 1.1, from, to: aim },
      { kind: 'fire', length: 0.45, from: aim, to: fired + 1 },
      { kind: 'flight', length: Math.min(Math.max((hit - fired) / 60 / FLIGHT_SLOW, 0.35), 1.6), from: fired + 1, to: held }
    );
  }

  shots.push(
    { kind: 'impact', length: 0.45, from: held, to: held },
    { kind: 'blast', length: 1, from: held, to: held + 50 },
    { kind: 'out', length: 0.35, from: held + 50, to: held + 70 }
  );

  const path = shot?.path ?? [];
  const hitPoint = path.at(-1) ?? kill.at;
  const killerAt = (time: number) => (kill.killer === undefined ? undefined : memberAt(tape, kill.killer, time));
  const flight = path.length > 1 ? { x: hitPoint.x - path[0].x, y: hitPoint.y - path[0].y } : undefined;

  return {
    shots,
    length: shots.reduce((sum, each) => sum + each.length, 0),
    /** The fatal shot found on the tape, if any. */
    shot,
    /** Where the shot struck, or where the tank was without one. */
    hit: hitPoint,
    /** Where the killer's tank was at `time`, in steps, as the tape draws it. */
    killerAt,
    /** Where the destroyed tank was at `time`, as the tape draws it, and where it went once gone. */
    victimAt: (time: number) => memberAt(tape, kill.victim, time) ?? kill.at,
    /** The camera's turn that has the shell fly straight up the screen. */
    upward: flight ? normalAngle(-Math.PI / 2 - Math.atan2(flight.y, flight.x)) : 0,
    /** Pixels from the killer's tank as it fired to where the shot struck, or to the tank without a shot. */
    range: Math.round(killerAt(fired) ? Math.hypot(killerAt(fired)!.x - hitPoint.x, killerAt(fired)!.y - hitPoint.y) : 0),
    story: storyOf(chronicle, kill)
  };
}

/** A shot of the kill-cam's film (see `directKillCam`): its kind, its seconds, and the steps of the tape it runs from and to. */
type Shot = { kind: 'freeze' | 'rewind' | 'killer' | 'fire' | 'flight' | 'approach' | 'impact' | 'blast' | 'out'; length: number; from: number; to: number };

/** A film of `directKillCam`. */
export type KillCamFilm = ReturnType<typeof directKillCam>;

/**
 * What the film shows `elapsed` s in, or `undefined` past its end: its shot and the step of the
 * tape, where the camera looks and how it is turned, its zoom as a share of the view's at the
 * start and how far it has gone over to the zoom that shows both tanks (`fit`, 0-1), and the
 * shake, the black bars, the grey, the card, the «BAM!» and the stats, 0-1 each.
 */
export function filmAt(film: KillCamFilm, elapsed: number) {
  let start = 0;
  const index = film.shots.findIndex((shot) => {
    if (elapsed < start + shot.length) {
      return true;
    }

    start += shot.length;
    return false;
  });

  if (index < 0) {
    return undefined;
  }

  const shot = film.shots[index];
  const share = (elapsed - start) / shot.length;
  const eased = smooth(share);
  const time = shot.from + (shot.to - shot.from) * (shot.kind === 'rewind' ? eased : share);
  const killer = film.killerAt(time) ?? film.victimAt(time);
  const look = { kind: shot.kind, time, focus: killer, zoom: 1, fit: 0, rotation: 0, shake: 0, bars: 1, grey: CINEMA_GREY, card: 1, stats: 0, bam: undefined as { scale: number; opacity: number } | undefined };

  switch (shot.kind) {
    case 'freeze':
      return { ...look, focus: film.victimAt(shot.from), zoom: 1 + 0.15 * eased, bars: eased, grey: eased, card: 0 };
    case 'rewind': {
      const from = film.victimAt(shot.from);
      const to = film.killerAt(shot.to) ?? film.victimAt(shot.to);
      return { ...look, focus: lerpPoint(from, to, eased), zoom: 1.15 + 0.35 * eased, grey: 1, card: 0 };
    }
    case 'killer':
      return { ...look, zoom: 1.5 + 0.3 * share, card: Math.min(share * 4, 1) };
    case 'approach':
      return { ...look, focus: film.victimAt(time), zoom: 1.5 + 0.4 * share, card: Math.min(share * 4, 1) };
    case 'fire':
      return { ...look, zoom: 1.8 + 0.3 * share };
    case 'flight':
      return {
        ...look,
        focus: film.shot ? pointAlong(film.shot.path, share) : lerpPoint(killer, film.hit, share),
        zoom: 2.1,
        rotation: film.upward * smooth(Math.min(share / 0.4, 1))
      };
    case 'impact':
      return {
        ...look,
        focus: film.hit,
        zoom: 2.1 + 0.3 * share,
        rotation: film.upward,
        bam: { scale: share < 0.3 ? 0.5 + (share / 0.3) * 0.7 : 1.2 - Math.min((share - 0.3) / 0.2, 1) * 0.2, opacity: 1 }
      };
    case 'blast':
      return {
        ...look,
        focus: lerpPoint(film.hit, lerpPoint(killer, film.hit, 0.5), eased),
        zoom: 2.4,
        fit: eased,
        rotation: film.upward * (1 - eased),
        shake: (1 - share) ** 2,
        stats: Math.min(share * 3, 1),
        bam: share < 0.3 ? { scale: 1, opacity: 1 - share / 0.3 } : undefined
      };
    case 'out':
      return { ...look, focus: lerpPoint(killer, film.hit, 0.5), fit: 1, bars: 1 - eased, grey: CINEMA_GREY * (1 - eased), card: 1 - eased, stats: 1 - eased };
  }
}

/**
 * The shot that destroyed the tank of `kill`, found on the tape by the trail shells lay as they
 * fly, which the tape keeps with their particles. A shell lays its trail a piece a step, each
 * piece from where the last one ended, and a rocket's blast throws shrapnel from about where its
 * trail ended, within `JOIN` px; an instant shot lays it whole. The last piece is one that
 * ended within `HIT_REACH` px of the tank, no more than `TRAIL_LATE` steps before it went, the
 * latest and nearest; the pieces before it are followed back to the muzzle, which must be within
 * `MUZZLE_REACH` px of the killer's tank. The shot's path, with the steps it was fired and struck
 * at; `undefined` when no trail will do, as for a tank rammed or caught by a grenade's blast.
 */
export function fatalShotOf(tape: Tape, killer: number, death: number, at: Point) {
  const first = tape.indexAt(death - SHOT_SEARCH * 60) ?? 0;
  const last = tape.indexAt(death + 2) ?? first - 1;
  const pieces = new Map<number, Piece>();

  for (let index = first; index <= last; index++) {
    const { step, spawns } = tape.frames[index];

    for (let offset = 0; offset < spawns.length; offset += 11) {
      if (spawns[offset] !== PARTICLE_TRAIL) {
        continue;
      }

      // A piece's particles share an id, which rides as their color's second part.
      const id = spawns[offset + 8];
      let piece = pieces.get(id);

      if (!piece) {
        piece = { step, points: [] };
        pieces.set(id, piece);
      }

      piece.points.push({ x: spawns[offset + 1], y: spawns[offset + 2] });
    }
  }

  let best: { score: number; piece: Piece } | undefined;

  for (const piece of pieces.values()) {
    const end = piece.points.at(-1)!;
    const miss = Math.hypot(end.x - at.x, end.y - at.y);
    const score = miss + (death - piece.step) * 2;

    if (miss <= HIT_REACH && piece.step >= death - TRAIL_LATE && (!best || score < best.score)) {
      best = { score, piece };
    }
  }

  if (!best) {
    return undefined;
  }

  const path = [...best.piece.points];
  const used = new Set([best.piece]);
  let fired = best.piece.step;

  for (;;) {
    const start = path[0];
    const before = [...pieces.values()].filter(
      (piece) => !used.has(piece) && piece.step <= fired && Math.hypot(piece.points.at(-1)!.x - start.x, piece.points.at(-1)!.y - start.y) <= JOIN
    );
    const piece = before.reduce<Piece | undefined>((latest, each) => (!latest || each.step > latest.step ? each : latest), undefined);

    if (!piece) {
      break;
    }

    used.add(piece);
    path.unshift(...piece.points.slice(0, -1));
    fired = piece.step;
  }

  const shooter = memberAt(tape, killer, fired);

  if (shooter && Math.hypot(path[0].x - shooter.x, path[0].y - shooter.y) > MUZZLE_REACH) {
    return undefined;
  }

  return { fired, hit: best.piece.step, path: path.filter((point, index) => index === 0 || point.x !== path[index - 1].x || point.y !== path[index - 1].y) };
}

/** A piece of a shell's trail (see `fatalShotOf`): the step it was laid and its points in order. */
type Piece = { step: number; points: Point[] };

/**
 * What the kill-cam's card tells of the killer, from the chronicle: its kills within `STREAK` s up
 * to this one, its goal and action as it last thought before the kill, whether its target was the
 * destroyed tank, and its armor left, 0-1, at the last sample.
 */
function storyOf(chronicle: Chronicle, kill: KillCamKill) {
  const killer = kill.killer === undefined ? undefined : chronicle.members[kill.killer]?.id;
  const victim = chronicle.members[kill.victim]?.id;
  const thought = chronicle.thoughts.filter((each) => each.member === killer && each.step <= kill.death).at(-1);
  const sample = chronicle.samples[Math.min(Math.floor(kill.death / chronicle.every), chronicle.samples.length - 1)];
  const pose = kill.killer === undefined ? undefined : sample?.[kill.killer];

  return {
    streak: chronicle.kills.filter((each) => each.killer !== undefined && each.killer === killer && each.step <= kill.death && each.step > kill.death - STREAK * 60).length,
    goal: thought?.goal,
    action: thought?.action,
    onYou: thought?.target !== undefined && thought.target === victim,
    armor: pose ? pose[4] : undefined
  };
}

/** Where member `member`'s tank is on the tape at `time`, in steps, between frames too; `undefined` while it waits to respawn. */
function memberAt(tape: Tape, member: number, time: number) {
  const index = tape.indexAt(time);

  if (index === undefined) {
    return undefined;
  }

  const frame = tape.frames[index];
  const next = tape.frames[index + 1];
  const x = frame.members[member * 2];
  const y = frame.members[member * 2 + 1];

  if (Number.isNaN(x)) {
    return undefined;
  }

  if (!next || Number.isNaN(next.members[member * 2]) || next.step === frame.step) {
    return { x, y };
  }

  const share = Math.min(Math.max((time - frame.step) / (next.step - frame.step), 0), 1);
  return { x: x + (next.members[member * 2] - x) * share, y: y + (next.members[member * 2 + 1] - y) * share };
}

/** The point a `share` of the way along `path`, by length. */
function pointAlong(path: readonly Point[], share: number) {
  let left = pathLength(path) * share;

  for (let index = 1; index < path.length; index++) {
    const leg = Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);

    if (left <= leg && leg > 0) {
      return lerpPoint(path[index - 1], path[index], left / leg);
    }

    left -= leg;
  }

  return path.at(-1)!;
}

function pathLength(path: readonly Point[]) {
  return path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0);
}

function lerpPoint(from: Point, to: Point, share: number) {
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
}

/** Eases 0-1 in and out. */
function smooth(share: number) {
  return share * share * (3 - 2 * share);
}

function normalAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Seconds of the killer shown before its shot at most, and of the tape before the kill at most. */
const KILLER_TIME = 0.9;
const MOST_BEFORE = 3;
/** Steps before the shot the `fire` shot begins. */
const FIRE_LEAD = 8;
/** Steps a shot is taken to have flown when no trail shows it. */
const UNSEEN_FLIGHT = 20;
/** How much the camera riding the shell slows it down; the ride lasts 0.35-1.6 s whatever that makes it. */
const FLIGHT_SLOW = 0.25;
/** The grey over the film once it is under way. */
const CINEMA_GREY = 0.3;
/** The least zoom the film's close-ups start from. */
const LEAST_ZOOM = 1;
/** How fast the camera eases toward a shot's view, per second, and how far it shakes, in world px. */
const CAMERA_EASE = 12;
const SHAKE = 7;
/** Room around both tanks when the view pulls back to show them, in screen px. */
const FIT_MARGIN = { x: 360, y: 300 };
/** Seconds before a kill searched for its shot, and how near the tank, the killer and the kill its trail must be (see `fatalShotOf`). */
const SHOT_SEARCH = 4;
const HIT_REACH = 70;
const MUZZLE_REACH = 80;
const TRAIL_LATE = 30;
const JOIN = 3;
/** Seconds within which a killer's kills make a streak. */
const STREAK = 6;
