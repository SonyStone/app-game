import type { Tank } from '../arena/bodies';
import type { Camera } from '../arena/camera';
import { holds, plan } from '../ai/goap';
import { botActions, botGoals, type Situation } from './brain';
import { TACTICS } from './classes/tactics';
import type { KothMatch } from './match';
import { cellCenter } from './navigation';
import type { TeamId } from './rules';

type Point = { x: number; y: number };

/**
 * The layers of the debug view over the arena, for the member picked:
 *
 * - `sight`: how far it sees all round and, for a Sniper, along its scope; lines to the enemies it
 *   sees; its gun's line, where it aims at its target and the target.
 * - `memory`: what its team remembers, each enemy as a ghost where the team saw it last, fading
 *   with the time since, with a dotted line to where it really is.
 * - `danger`: how exposed each spot is to the enemies its team knows of, redder the more see it.
 * - `perches`: the Sniper perches its team found, its own ringed, and a lookout, as a Sniper takes one.
 * - `posts`: the posts in front of the point and who holds which, while the team holds the point.
 * - `kits`: repair kits, those claimed with a line from whoever drives to them, its own ringed,
 *   and the spots where members fell lately, which make a kit there a trap.
 * - `breach`: the short ways through walls, the one being opened and those opened.
 * - `path`: where it drives, its path, its cover and its staging spot.
 */
export const DEBUG_LAYERS = ['sight', 'memory', 'danger', 'perches', 'posts', 'kits', 'breach', 'path'] as const;

/** One of `DEBUG_LAYERS`. */
export type DebugLayer = (typeof DEBUG_LAYERS)[number];

/** The layers shown at first: all but the danger map, which covers much of the arena. */
export const DEFAULT_LAYERS: readonly DebugLayer[] = DEBUG_LAYERS.filter((layer) => layer !== 'danger');

/**
 * What member `id` and its team have in mind now, as plain values for the debug panel: who it
 * is, its thought, its facts, its gun, its last plan (see `explainDecision`) and what its team's
 * board says of it. Only reads (see the bots' and boards' `inspect`), so the match plays on as
 * it would. `undefined` for a member not in the match.
 */
export function reportMember(match: KothMatch, id: number) {
  const member = match.members.find((candidate) => candidate.id === id);

  if (!member) {
    return undefined;
  }

  const bot = match.bots.get(member);
  const team = match.boards[member.team].inspect();
  const mind = bot?.inspect();
  const thought = bot?.thought();
  const tank = member.tank;
  const nameOf = (other: Tank | undefined) => (other ? match.members.find((candidate) => candidate.tank === other)?.name : undefined);
  const help = team.help.get(member);
  const post = team.jobs.get(member);
  const claim = [...team.claims.values()].find((entry) => entry.member === member);

  return {
    name: member.name,
    team: member.team,
    tankClass: member.tankClass.id,
    role: member.role,
    bot: bot !== undefined,
    alive: tank !== undefined,
    armor: tank ? match.combat.armorLeft(tank) : 0,
    coreOpen: tank ? match.combat.isCoreOpen(tank) : false,
    goal: thought?.goal,
    action: thought?.action,
    steps: thought?.steps ?? [],
    step: thought?.step ?? 0,
    target: nameOf(thought?.target),
    covering: thought?.covering?.name,
    breach: thought?.breach && `${thought.breach.method} ${thought.breach.phase}`,
    facts: Object.entries(mind?.facts ?? {})
      .filter(([, value]) => value)
      .map(([name]) => name)
      .sort(),
    sees: (mind?.visible ?? []).map(nameOf).filter((name) => name !== undefined),
    aim: mind?.aim.target ? { target: nameOf(mind.aim.target), shot: mind.aim.shot } : undefined,
    /** The last plan, made `ago` seconds before; the same object until the bot plans again. */
    decision: mind?.decision,
    ago: mind?.decision ? match.time - mind.decision.at : undefined,
    board: {
      intent: team.intent,
      phase: team.phase,
      focus: nameOf(team.focus),
      help: help && { ally: help.ally.name, attacker: nameOf(help.attacker) },
      job: post === 'point' ? 'point' : post?.lane,
      kit: claim && { eta: claim.eta - match.time },
      perch: team.perchOf.has(member),
      lookout: team.lookoutOf.has(member),
      fallenBack: team.fallenBack.has(member),
      breaching: team.breach?.member === member ? team.breach.shortcut.lane : undefined
    }
  };
}

/** A report of `reportMember`. */
export type MemberReport = NonNullable<ReturnType<typeof reportMember>>;

/**
 * Why a bot chose its plan, from the situation it planned in: every goal it had, by priority,
 * whether it held already, the cheapest plan to it with its cost, or none within reach, and
 * which one the bot took, the first that did not hold and had a plan; and every action with its
 * price, cheapest first, the ones it could not take at `Infinity`. The planner is pure, so this
 * asks it again what it answered then.
 */
export function explainDecision(situation: Situation) {
  const actions = botActions(situation);
  const usable = actions.filter((action) => Number.isFinite(action.cost));
  let chosen = false;

  const goals = botGoals(situation)
    .sort((a, b) => b.priority - a.priority)
    .map((goal) => {
      const done = holds(situation.facts, goal.wants);
      const steps = done ? [] : plan(situation.facts, goal.wants, usable);
      const pick = !done && steps !== undefined && !chosen;
      chosen ||= pick;
      return {
        name: goal.name,
        priority: goal.priority,
        wants: Object.entries(goal.wants).map(([fact, value]) => (value ? fact : `!${fact}`)),
        done,
        steps: steps?.map((step) => step.name),
        cost: steps?.reduce((total, step) => total + step.cost, 0),
        chosen: pick
      };
    });

  return {
    goals,
    actions: actions.map((action) => ({ name: action.name, cost: action.cost })).sort((a, b) => a.cost - b.cost),
    estimates: {
      ...Object.fromEntries(Object.entries(situation.travel).map(([place, seconds]) => [`travel.${place}`, seconds])),
      'kill.front': situation.kill.front,
      'kill.rear': situation.kill.rear,
      capture: situation.capture,
      enemyClock: situation.enemyClock
    }
  };
}

/**
 * Draws the debug view's `layers` for member `id` onto the 2D canvas `context`, sized to the
 * arena's canvas, as `camera` shows the arena on a screen of `screen` CSS pixels. Reads the match
 * only, as `reportMember` does. Draws nothing for a member not in the match; the team's layers
 * show while the member waits to respawn.
 */
export function drawDebug(
  context: CanvasRenderingContext2D,
  camera: Camera,
  screen: { width: number; height: number },
  match: KothMatch,
  id: number | undefined,
  layers: ReadonlySet<DebugLayer>
) {
  const ratio = context.canvas.width / Math.max(screen.width, 1);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  const member = match.members.find((candidate) => candidate.id === id);

  if (!member) {
    return;
  }

  const zoom = camera.zoom;
  // World pixels on the canvas: lines and text keep their size on screen whatever the zoom.
  context.setTransform(zoom * ratio, 0, 0, zoom * ratio, (screen.width / 2 - camera.x * zoom) * ratio, (screen.height / 2 - camera.y * zoom) * ratio);
  const px = 1 / zoom;
  const team = match.boards[member.team].inspect();
  const mind = match.bots.get(member)?.inspect();
  const thought = match.bots.get(member)?.thought();
  // A tank destroyed this step stays in a bot's lists until its next step, its body already gone from the world.
  const alive = (other: Tank | undefined): other is Tank => other !== undefined && match.combat.armorOf(other) !== undefined;
  const tank = alive(member.tank) ? member.tank : undefined;
  const at = tank?.hull.translation();
  const now = match.time;
  const grid = match.grid;
  const enemy = ENEMY[member.team];

  if (layers.has('danger')) {
    for (let cell = 0; cell < team.danger.length; cell++) {
      const exposure = team.danger[cell];

      if (exposure > 0) {
        const center = cellCenter(grid, cell);
        context.fillStyle = `rgba(224, 50, 30, ${Math.min(0.12 + exposure * 0.14, 0.55)})`;
        context.fillRect(center.x - grid.cell / 2, center.y - grid.cell / 2, grid.cell, grid.cell);
      }
    }
  }

  if (layers.has('breach')) {
    for (const shortcut of team.shortcuts) {
      const active = team.breach?.shortcut === shortcut;
      const opened = team.opened.has(shortcut);
      line(shortcut.from, shortcut.to, active ? YELLOW : opened ? GREEN : MUTED, active ? 3 : 1.5, [6, 5]);
      cross(shortcut.wall, 8, active ? YELLOW : opened ? GREEN : MUTED, 2.5);

      if (active) {
        label(shortcut.wall, `breach ${team.breach!.member.name}`, YELLOW, 0, -14);
      }
    }
  }

  if (layers.has('posts')) {
    for (const post of team.posts) {
      const holder = [...team.jobs.entries()].find(([, job]) => job === post)?.[0];
      const own = holder === member;
      line(post.at, post.watch, own ? YELLOW : MUTED, own ? 2 : 1, [3, 4]);
      ring(post.at, 10, own ? YELLOW : TEAM[member.team], own ? 3 : 1.5);
      label(post.at, holder ? `${post.lane} · ${holder.name}` : post.lane, own ? YELLOW : PAPER, 0, -16);
    }
  }

  if (layers.has('perches')) {
    for (const perch of team.perches) {
      diamond(perch, 5, MUTED);
    }

    for (const [holder, perch] of team.perchOf) {
      const own = holder === member;
      line(perch, perch.watch, own ? YELLOW : MUTED, own ? 2 : 1, [2, 4]);
      diamond(perch, own ? 9 : 7, own ? YELLOW : TEAM[member.team]);
      label(perch, `perch · ${holder.name}${team.fallenBack.has(holder) ? ' · unsafe' : ''}`, own ? YELLOW : PAPER, 0, -14);
    }

    for (const [holder, lookout] of team.lookoutOf) {
      diamond(lookout.perch, 8, CYAN);
      label(lookout.perch, `lookout · ${holder.name}`, CYAN, 0, -14);
    }
  }

  if (layers.has('kits')) {
    for (const kit of match.kits.kits) {
      ring(kit, kit === mind?.kit ? 16 : 11, kit.readyAt > now ? MUTED : GREEN, kit === mind?.kit ? 3 : 1.5);
    }

    for (const [kit, claim] of team.claims) {
      const by = alive(claim.member.tank) ? claim.member.tank.hull.translation() : undefined;

      if (by && claim.until > now) {
        line(by, kit, GREEN, 1.5, [4, 4]);
        label(kit, `${claim.member.name} ${Math.max(claim.eta - now, 0).toFixed(1)} s`, GREEN, 0, 22);
      }
    }

    for (const loss of team.losses) {
      if (loss.until > now) {
        cross(loss, 7, RED, 2);
      }
    }
  }

  if (layers.has('memory')) {
    for (const sighting of team.sightings) {
      const rival = match.members.find((candidate) => candidate.tank === sighting.tank);

      if (!rival || !alive(rival.tank)) {
        continue;
      }

      const age = now - sighting.seenAt;
      const fade = Math.max(1 - age / GHOST_FADE, 0.25);
      context.globalAlpha = fade;
      const hull = rival.tankClass.hull;
      context.save();
      context.translate(sighting.position.x, sighting.position.y);
      context.rotate(sighting.heading);
      context.setLineDash([4 * px, 3 * px]);
      context.strokeStyle = TEAM[enemy];
      context.lineWidth = 2 * px;
      context.strokeRect(-hull.halfLength, -hull.halfWidth, hull.halfLength * 2, hull.halfWidth * 2);
      context.restore();
      context.setLineDash([]);
      line(sighting.position, rival.tank!.hull.translation(), PAPER, 1, [1, 4]);
      label(sighting.position, `${rival.name} · ${age.toFixed(1)} s`, PAPER, 0, hull.halfWidth + 14);
      context.globalAlpha = 1;
    }
  }

  if (layers.has('path') && thought) {
    if (thought.path.length > 1 && at) {
      context.beginPath();
      context.moveTo(at.x, at.y);

      for (const point of thought.path.slice(1)) {
        context.lineTo(point.x, point.y);
      }

      context.strokeStyle = PAPER;
      context.lineWidth = 2 * px;
      context.setLineDash([7 * px, 5 * px]);
      context.stroke();
      context.setLineDash([]);
    }

    if (thought.destination) {
      cross(thought.destination, 9, PAPER, 2.5);
    }

    if (mind?.cover) {
      ring(mind.cover, 8, CYAN, 2);
      label(mind.cover, 'cover', CYAN, 0, 18);
    }
  }

  if (layers.has('sight') && tank && at && mind) {
    context.beginPath();
    context.arc(at.x, at.y, mind.sight.range, 0, Math.PI * 2);
    context.fillStyle = 'rgba(251, 246, 234, 0.05)';
    context.fill();
    context.strokeStyle = 'rgba(251, 246, 234, 0.6)';
    context.lineWidth = 1.5 * px;
    context.stroke();

    if (mind.sight.scope) {
      const { range, arc } = mind.sight.scope;
      context.beginPath();
      context.moveTo(at.x, at.y);
      context.arc(at.x, at.y, range, tank.turretAngle - arc, tank.turretAngle + arc);
      context.closePath();
      context.fillStyle = 'rgba(122, 214, 232, 0.08)';
      context.fill();
      context.strokeStyle = 'rgba(122, 214, 232, 0.7)';
      context.stroke();
    }

    for (const seen of mind.visible.filter(alive)) {
      line(at, seen.hull.translation(), GREEN, 1.5);
    }

    const pivot = match.combat.gunPivotOf(tank);
    const reach = TACTICS[member.tankClass.id].reach;
    line(pivot, { x: pivot.x + Math.cos(tank.turretAngle) * reach, y: pivot.y + Math.sin(tank.turretAngle) * reach }, YELLOW, 1.5, [10, 6]);

    if (alive(mind.aim.target)) {
      ring(mind.aim.target.hull.translation(), 26, YELLOW, 2.5);
    }

    if (mind.aim.spot) {
      cross(mind.aim.spot, 6, ORANGE, 2.5);
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);

  function line(from: Point, to: Point, color: string, width: number, dash: number[] = []) {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = color;
    context.lineWidth = width * px;
    context.setLineDash(dash.map((length) => length * px));
    context.stroke();
    context.setLineDash([]);
  }

  function ring(center: Point, radius: number, color: string, width: number) {
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = width * px;
    context.stroke();
  }

  function cross(center: Point, size: number, color: string, width: number) {
    const half = size * px;
    context.beginPath();
    context.moveTo(center.x - half, center.y - half);
    context.lineTo(center.x + half, center.y + half);
    context.moveTo(center.x + half, center.y - half);
    context.lineTo(center.x - half, center.y + half);
    context.strokeStyle = color;
    context.lineWidth = width * px;
    context.stroke();
  }

  function diamond(center: Point, size: number, color: string) {
    const half = size * px;
    context.beginPath();
    context.moveTo(center.x, center.y - half);
    context.lineTo(center.x + half, center.y);
    context.lineTo(center.x, center.y + half);
    context.lineTo(center.x - half, center.y);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = INK;
    context.lineWidth = 1 * px;
    context.stroke();
  }

  function label(point: Point, text: string, color: string, dx: number, dy: number) {
    context.font = `600 ${11 * px}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const width = context.measureText(text).width;
    context.fillStyle = 'rgba(20, 20, 20, 0.7)';
    context.fillRect(point.x + dx * px - width / 2 - 3 * px, point.y + dy * px - 7 * px, width + 6 * px, 14 * px);
    context.fillStyle = color;
    context.fillText(text, point.x + dx * px, point.y + dy * px);
  }
}

/** Seconds over which a remembered enemy fades to its faintest. */
const GHOST_FADE = 6;

const ENEMY: Record<TeamId, TeamId> = { red: 'blue', blue: 'red' };
const TEAM: Record<TeamId, string> = { red: '#ff8a7a', blue: '#8ab4ff' };
const PAPER = '#fbf6ea';
const INK = '#141414';
const MUTED = 'rgba(251, 246, 234, 0.45)';
const YELLOW = '#f2c418';
const ORANGE = '#f0773a';
const GREEN = '#6fd17a';
const CYAN = '#7ad6e8';
const RED = '#ff5a46';
