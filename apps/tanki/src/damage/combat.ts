import { createTank, driveTank, HULL_LINEAR_DAMPING, type Tank } from '../arena/bodies';
import { PROP_COLOR } from '../arena/draw';
import type { Collider, Rapier, RigidBody } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { createBurning } from './burning';
import { createCampfire } from './campfire';
import {
  carve,
  CHANNELS,
  dent,
  detachLoosePieces,
  isCoreExposed,
  raycastField,
  sampleField,
  scorch,
  shatter,
  solidBoxes,
  surfaceNormal,
  type DamageField,
  type Fragment
} from './field';
import {
  CAMERA_HEIGHT,
  KIND_FIELD,
  KIND_FIELD_OPEN,
  KIND_RECT,
  KIND_TURRET,
  PARTICLE_DUST,
  PARTICLE_FIRE,
  PARTICLE_SMOKE,
  PARTICLE_TRAIL,
  PARTICLE_SPARK,
  SUN,
  TURRET_CASEMATE,
  TURRET_MEDIUM,
  TURRET_QUADS,
  type createRangeRenderer
} from './renderer';
import { createCrateField, createGrenadeField, createHullField, createShellField, MEDIUM_HULL, type HullSpec } from './shapes';
import { createWalls, type Bounds, type Tile } from './walls';
import { isRolling, launchLob, stepLob, type LobSpec, type LobState } from './weapons/lob';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/** A position and heading on the battlefield; `turret` defaults to the heading. */
export type Placement = { x: number; y: number; rotation: number; turret?: number };

/**
 * A fixed wall or building: a box around its center, turned by `rotation`, that stops tanks and
 * shots. Shots chip walls of every material but steel, which is the default; see `WALL_MATERIALS`.
 */
export type WallPlacement = { x: number; y: number; halfWidth: number; halfHeight: number; rotation?: number; material?: WallMaterial };

/** What a wall is built of: `steel` stands forever, the others break after more or fewer hits. */
export type WallMaterial = 'steel' | 'concrete' | 'brick' | 'wood';

/**
 * A gun that fires shells instead of hitscan shots: a visible shell flies at `speed`, leaving the
 * thin smoke trail behind it, and falls to the ground with a puff of dust once it has flown
 * `range` pixels, ricochets included. It still bounces off armor it meets at a glancing angle.
 */
export type ShellSpec = {
  /** Flight speed in pixels per second. */
  speed: number;
  /** Distance the shell flies before it falls, in pixels. */
  range: number;
  /** Radius of the hole a penetrating hit chips, in pixels. */
  hole: number;
  /** How far past the surface the hole reaches, in pixels: 0 chips a single crater. */
  depth: number;
  /** Impulse of a penetrating hit, which knocks the body back. */
  knockback: number;
  /**
   * Share of its hole and depth a shell has lost by the end of its range, as damage falls off with
   * distance in Team Fortress 2; defaults to 0, biting as hard at the end as at the muzzle.
   */
  fade?: number;
  /** Drawn size against the 9 px tank shell; defaults to 1. */
  size?: number;
  /** Whether it glances off armor met at a steep angle; defaults to `true`. A shell with a blast goes off instead. */
  ricochet?: boolean;
  /** Goes off where it stops, at what it hits or where it falls, with this blast. */
  blast?: BlastSpec;
  /** Shrapnel the blast throws out in every direction: `count` small shells of `shell`. */
  fragments?: { count: number; shell: ShellSpec };
  /**
   * Punches through what it hits: up to `armor` pixels of a tank's armor, flying on through the
   * hole it chipped and so reaching a core that lies that deep, and, with `thin`, clean through
   * thin bodies such as crates.
   */
  pierce?: { armor: number; thin: boolean };
  /** Flies in an arc instead of along the ground: over low bodies, bouncing off walls, until its fuse burns down. */
  lob?: LobSpec;
};

/**
 * An explosion, which `blast` sets off and shells with a blast set off where they stop: every body
 * with armor within `radius` and not behind a wall takes a crater on the side facing the blast and
 * is pushed away from it. Craters and pushes shrink toward the edge of the radius, to half at the
 * edge, as splash damage falls off in Team Fortress 2. A blast close to a core that was open
 * before it destroys it.
 */
export type BlastSpec = {
  radius: number;
  /** Radius and depth of the crater at the blast's center. */
  hole: number;
  depth: number;
  /** Impulse at the center. */
  knockback: number;
  /**
   * Damage to bodies without a core, such as crates and walls that can break, against tanks; 3
   * makes the blast a wall breaker. Defaults to 1.
   */
  structures?: number;
  /** Share of the knockback the shooter's own tank takes, which lets it jump; its armor is spared. Defaults to 1. */
  self?: number;
};

/** How a tank's turret is drawn and where its muzzle is. */
export type TankLook = {
  /** One of the renderer's `TURRET_*` looks. */
  turret: number;
  /** Distance from the hull's center to the muzzle along the gun, in pixels. */
  muzzle: number;
  /** A casemate gun: its superstructure is drawn turned with the hull, and the turret is only its gun. */
  casemate?: boolean;
};

/**
 * A shot for `fire`: the battle's shell, or a hitscan shot without one, along the turret, unless
 * the shot says otherwise.
 */
export type Shot = {
  shell?: ShellSpec;
  /** World direction in radians; defaults to the turret's. */
  angle?: number;
  /** Offsets in radians from `angle` of the shells of a volley, all fired at once; defaults to one shell straight ahead. */
  volley?: readonly number[];
  /** How far a lobbed shell is thrown, in pixels; defaults to its whole range. */
  reach?: number;
  /** Size of the muzzle blast and recoil: 1 for a tank gun, less for a machine gun. */
  flash?: number;
};

/**
 * Static layout of a battlefield in pixels around the origin: a walled floor, walls of steel,
 * concrete, brick or wood, crates and campfires. Tanks are spawned separately with `spawnTank`.
 */
export type CombatLayout = {
  halfWidth: number;
  halfHeight: number;
  walls?: readonly WallPlacement[];
  crates?: readonly Placement[];
  /** Campfires whose ring of stones stops tanks. */
  campfires?: readonly Point[];
};

/**
 * The core of a tank battle with destructible armor: tanks and crates whose armor is a distance
 * field, on a walled floor among walls (see `./walls`). Shots chip holes, dent the armor and
 * knock bodies back; shots that meet armor at a glancing angle ricochet. Crashes dent both bodies,
 * armor cut loose falls off as debris, and a shot that reaches a tank's core, hidden until a hole
 * opens onto it, blows the tank apart. Shots chip craters into walls of every material but steel
 * until pieces of them fall. Crates come back after a few seconds; tanks only when spawned with
 * `respawn`.
 *
 * Any number of tanks can be driven at once: `drive` sets a tank's input until changed, `fire`
 * shoots its gun. Tanks may belong to teams, and without friendly fire shots pass through the
 * shooter's teammates. Each tank may have a hull, mass and look of its own, and each shot a shell
 * of its own: a volley of pellets, a rocket that goes off in a blast with shrapnel, a round that
 * punches through, a grenade lobbed in an arc. `blast` sets off an explosion anywhere; it reaches
 * every body with armor around it.
 *
 * The battle owns its Rapier bodies and renderer field slots; `reset` rebuilds the crates and
 * removes every tank.
 *
 * @param options.shell - Makes guns fire shells that fly for a while instead of hitscan shots.
 * @param options.friendlyFire - Whether shots hit the shooter's teammates; defaults to `true`.
 * @param options.wreckFire - Seconds a destroyed tank's wreck burns; defaults to 12.
 * @param options.random - Source of randomness in [0, 1) for damage and effects, so a test can
 *   seed it; defaults to `Math.random`.
 * @param options.onHit - Called when a shot chips, ricochets off or detonates a tank.
 * @param options.onDestroyed - Called when a tank blows up or loses all its armor, with the tank
 *   whose shot did it, if any. The tank is already out of `tanks`.
 * @param options.onShot - Called for every shot with its path: the muzzle, each ricochet and the end.
 *   A shell reports its path when it stops.
 * @param options.onWallsChanged - Called with the world bounds of a piece of wall whose shape
 *   changed, during the step that changed it.
 */
export function createCombat(
  rapier: Rapier,
  world: World,
  renderer: Renderer,
  layout: CombatLayout,
  options: {
    shell?: ShellSpec;
    friendlyFire?: boolean;
    wreckFire?: number;
    random?: () => number;
    onHit?: (target: Tank, shooter: Tank | undefined, part: 'armor' | 'core' | 'ricochet') => void;
    onDestroyed?: (victim: Tank, killer: Tank | undefined) => void;
    onShot?: (shooter: Tank, path: readonly Point[]) => void;
    onWallsChanged?: (bounds: Bounds) => void;
  } = {}
) {
  const random = options.random ?? Math.random;
  const friendlyFire = options.friendlyFire ?? true;
  const events = new rapier.EventQueue(true);
  const owners = new Map<number, Armored>();
  const armored: Armored[] = [];
  const byTank = new Map<Tank, Armored>();
  const debris: Debris[] = [];
  const respawns: { at: number; spawn: () => void }[] = [];
  const walls = createWalls(rapier, world, renderer, layout, {
    random,
    onDebris: addWallDebris,
    onChange: (bounds) => options.onWallsChanged?.(bounds)
  });
  const burning = createBurning(renderer);
  const campfires = (layout.campfires ?? []).map((at) => createCampfire(renderer, burning, at));
  let clock = 0;
  let shake = 0;
  let listener: Point = { x: 0, y: 0 };
  const flashes: {
    x: number;
    y: number;
    radius: number;
    life: number;
    intensity: number;
    color: readonly number[];
    height: number;
    age: number;
    motion: { x: number; y: number; distance: number };
    travelled: number;
  }[] = [];
  let trailId = 0;
  let shellId = 0;
  const shells: Shell[] = [];
  const shellDraw = createShellDraw(renderer, createShellField());
  const grenadeDraw = createShellDraw(renderer, createGrenadeField());

  layout.crates?.forEach((placement) => spawnCrate(placement));

  return {
    /** Camera shake in world pixels from nearby shots and explosions; decays by itself. */
    get shake() {
      return shake;
    },

    /** Seconds of simulated time since creation. */
    get clock() {
      return clock;
    },

    /** Every tank in play. */
    get tanks() {
      return armored.flatMap((body) => (body.tank ? [body.tank] : []));
    },

    /** The walls' breakable tiles, live, and how many hits chipped them and how many tiles fell. */
    get walls() {
      return { tiles: walls.tiles, damage: walls.damage };
    },

    /** Centers of every crate in play, with their headings. */
    get crates() {
      return armored.flatMap((body) => (body.tank ? [] : [{ ...body.body.translation(), rotation: body.body.rotation() }]));
    },

    /**
     * Shells in flight: an id unique within the battle, where each is, the unit direction it flies
     * in, its speed over the ground, its height for a lobbed one, and the tank that fired it with
     * that tank's team.
     */
    get shells() {
      return shells.map((shell) => ({
        id: shell.id,
        x: shell.x,
        y: shell.y,
        direction: shell.direction,
        speed: shell.speed,
        height: shell.lob?.height ?? 0,
        lobbed: shell.lob !== undefined,
        shooter: shell.shooter,
        team: shell.team
      }));
    },

    /**
     * Puts a tank on the field with full armor.
     *
     * @param tank.color - Hull and turret color, 0xRRGGBB.
     * @param tank.team - Team the tank fights for; tanks without one have no teammates.
     * @param tank.pullSpeed - Pull speed in pixels per second at full input.
     * @param tank.respawn - Brings the tank back at `placement` a few seconds after it is destroyed.
     * @param tank.hull - Shape of the hull and its core; defaults to the medium tank's.
     * @param tank.mass - Mass of the hull, 1 for the medium tank. Heavier tanks are pushed less
     *   by hits, dent less in crashes and shove harder.
     * @param tank.look - How the turret is drawn and where its muzzle is; defaults to the medium tank's.
     */
    spawnTank(
      placement: Placement,
      tank: { color: number; team?: string; pullSpeed?: number; respawn?: boolean; hull?: HullSpec; mass?: number; look?: TankLook }
    ) {
      return spawnTank(placement, tank);
    },

    /** Takes `tank` off the field without a trace or a respawn, as when a player changes class in the base. */
    removeTank(tank: Tank) {
      const body = byTank.get(tank);

      if (body) {
        remove(body);
      }
    },

    /** The armor field of `tank`, live; `undefined` once the tank is destroyed. */
    armorOf(tank: Tank) {
      return byTank.get(tank)?.field;
    },

    /** World position of `tank`'s core, under its armor; `undefined` once the tank is destroyed. */
    coreOf(tank: Tank) {
      const body = byTank.get(tank);
      return body && toWorld(body.body, (body.hull ?? MEDIUM_HULL).core);
    },

    /** Where `tank`'s muzzle is when its gun points along `angle`, in world radians. */
    muzzleOf(tank: Tank, angle = tank.turretAngle) {
      return muzzleAt(tank, angle);
    },

    /**
     * How far a ray goes before it meets a wall, a crate or a tank's armor, and which tank it met
     * if any; `skip` lets it pass through tanks it returns true for.
     */
    raycast(from: Point, direction: Point, range: number, skip?: (tank: Tank) => boolean) {
      const hit = castShot(from, direction, (body) => body.tank !== undefined && (skip?.(body.tank) ?? false), range);
      return { distance: hit.distance, tank: hit.target?.tank };
    },

    /** Turns the barrels of a gatling turret to `angle` about their axis, for drawing. */
    spinBarrels(tank: Tank, angle: number) {
      const body = byTank.get(tank);

      if (body) {
        body.spin = angle;
      }
    },

    /** Whether `tank` is in the air, thrown by a blast; it cannot drive until it lands. */
    isAirborne(tank: Tank) {
      return (byTank.get(tank)?.airborne?.left ?? 0) > 0;
    },

    /** Whether a hole in `tank`'s armor leads to its core, so one more hit there destroys it. */
    isCoreOpen(tank: Tank) {
      return byTank.get(tank)?.coreOpen ?? false;
    },

    /** Share of `tank`'s armor left, 0-1; 0 once it is destroyed. */
    armorLeft(tank: Tank) {
      const body = byTank.get(tank);
      return body ? body.area / body.fullArea : 0;
    },

    /** Team of `tank`, as given to `spawnTank`. */
    teamOf(tank: Tank) {
      return byTank.get(tank)?.team;
    },

    /**
     * Sets `tank`'s drive input, kept for every following step until changed.
     *
     * @param move - Direction in world axes, length up to 1.
     */
    drive(tank: Tank, move: Point) {
      const body = byTank.get(tank);

      if (body) {
        body.move = move;
      }
    },

    /**
     * Advances physics by one fixed step: drives every tank, steps Rapier, dents crashed bodies,
     * moves shells and refreshes changed shapes.
     */
    step(dt: number) {
      clock += dt;

      for (const body of armored) {
        if (body.tank && body.airborne) {
          fly(body, dt);
        } else if (body.tank) {
          driveTank(body.tank, body.move);
        }

        body.before = { velocity: body.body.linvel(), spin: body.body.angvel() };
      }

      world.step(events);
      events.drainCollisionEvents((first, second, started) => {
        if (started) {
          crash(first, second);
        }
      });

      for (const shell of [...shells]) {
        flyShell(shell, dt);
      }

      for (const body of [...armored]) {
        if (body.changed) {
          refreshShape(body);
        }
      }

      walls.refresh();

      for (const respawn of respawns.filter((item) => item.at <= clock)) {
        respawns.splice(respawns.indexOf(respawn), 1);
        respawn.spawn();
      }
    },

    /**
     * Fires `tank`'s gun along its turret, with recoil: the shot's shell, else the battle's
     * `options.shell`, else a hitscan shot. The shot chips the first armor it meets, knocking the
     * body back, or detonates a core; at a glancing angle it ricochets and flies on. A shell with a
     * blast goes off where it stops instead. Reload is up to the caller.
     */
    fire(tank: Tank, shot: Shot = {}) {
      const shell = shot.shell ?? options.shell;

      if (shell) {
        launchShell(tank, shell, shot);
      } else {
        fire(tank);
      }
    },

    /**
     * Sets off an explosion at `at`, as `BlastSpec` describes, credited to `shooter`. Without
     * friendly fire it spares the shooter's teammates; the shooter's own tank is only pushed.
     */
    blast(at: Point, spec: BlastSpec, shooter?: Tank) {
      explode(at, spec, shooter, shooter && byTank.get(shooter)?.team);
    },

    /**
     * Whether a straight line from `from` to `to` is clear of walls and crates. Tanks never block
     * it, and neither do holes shot through a crate, nor rubble within the reach of a tank's gun
     * of `from`: a tank sees and shoots over rubble right in front of it.
     */
    lineOfSight(from: Point, to: Point) {
      const length = Math.hypot(to.x - from.x, to.y - from.y);

      if (length < 1e-6) {
        return true;
      }

      const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
      return castShot(from, direction, (body) => body.tank !== undefined, length, BARREL + OVER_RUBBLE).distance >= length;
    },

    /**
     * Distance from `point` to the nearest wall, the border or a campfire's stones as they stand
     * now, negative inside one; at most `cap`. Tanks and crates are not obstacles here.
     */
    obstacleDistance(point: Point, cap: number) {
      return walls.distance(point, cap);
    },

    /**
     * Mends `tank`'s armor toward its factory shape, filling holes and dents and wiping soot.
     *
     * @param amount - Share of the remaining damage to undo, 0-1.
     */
    repair(tank: Tank, amount: number) {
      const body = byTank.get(tank);

      if (!body?.pristine || amount <= 0) {
        return;
      }

      const data = body.field.data;
      const pristine = body.pristine;

      for (let index = 0; index < data.length; index++) {
        data[index] += (pristine[index] - data[index]) * Math.min(amount, 1);
      }

      body.changed = true;
    },

    /** Moves debris, emits exhaust, feeds fires and fades hit flashes over a frame of `dt` seconds. */
    update(dt: number) {
      burning.update(dt);

      for (let index = debris.length - 1; index >= 0; index--) {
        const piece = debris[index];
        const drag = Math.exp(-DEBRIS_DRAG * dt);
        piece.age += dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.angle += piece.spin * dt;
        piece.vx *= drag;
        piece.vy *= drag;
        piece.spin *= drag;

        if (piece.age >= piece.life) {
          if (piece.slot !== undefined) {
            renderer.releaseField(piece.slot);
          }

          debris.splice(index, 1);
        }
      }

      shake *= Math.exp(-SHAKE_DECAY * dt);

      for (let index = flashes.length - 1; index >= 0; index--) {
        const light = flashes[index];
        light.age += dt;

        if (light.age >= light.life) {
          flashes.splice(index, 1);
          continue;
        }

        const speed = Math.hypot(light.motion.x, light.motion.y);
        const step = Math.min(speed * dt, light.motion.distance - light.travelled);

        if (speed > 0 && step > 0) {
          light.x += (light.motion.x / speed) * step;
          light.y += (light.motion.y / speed) * step;
          light.travelled += step;
        }
      }

      for (const body of armored) {
        body.flash = Math.max(body.flash - dt * 8, 0);
        body.barrelKick *= Math.exp(-BARREL_RETURN * dt);

        if (body.tank) {
          body.exhaust += dt * EXHAUST_RATE;

          while (body.exhaust >= 1) {
            body.exhaust -= 1;
            const at = toWorld(body.body, EXHAUST_OFFSET);
            burning.puff(at.x, at.y, between(-6, 6), between(-6, 6), 1.5, between(1.2, 2.2));
          }
        }
      }
    },

    /**
     * Queues the floor, walls, every body, turret, debris piece, smoke and light for
     * drawing, bottom to top. Also makes `view` the point that hears shots, for camera shake.
     *
     * @param view - Point on the ground under the camera.
     * @param underlay - Adds markings on the floor, drawn after the floor and before anything on it.
     * @param overlay - Adds bodies such as sight lines, drawn over the tanks and shells and under the smoke.
     */
    draw(view: Point, underlay?: () => void, overlay?: () => void) {
      listener = { x: view.x, y: view.y };
      renderer.beginBodies();
      renderer.addBody({
        kind: KIND_RECT,
        x: 0,
        y: 0,
        angle: 0,
        originX: -layout.halfWidth + 0.5,
        originY: -layout.halfHeight + 0.5,
        cell: 1,
        cols: layout.halfWidth * 2,
        rows: layout.halfHeight * 2,
        color: FLOOR_COLOR
      });
      underlay?.();
      campfires.forEach((campfire) => campfire.draw());

      for (const piece of debris) {
        const alpha = Math.min((piece.life - piece.age) / DEBRIS_FADE, 1);

        if (piece.field && piece.slot !== undefined) {
          renderer.addBody({ ...fieldDraw(piece.field, piece.slot), x: piece.x, y: piece.y, angle: piece.angle, color: piece.color, alpha, height: DEBRIS_HEIGHT });
        } else {
          const style = piece.turret ?? TURRET_MEDIUM;
          renderer.addBody({ ...turretDraw(style), style, x: piece.x, y: piece.y, angle: piece.angle, color: piece.color, alpha });
        }
      }

      walls.draw();

      // Things in the air cast their own long shadow on the ground, where the sun throws it.
      for (const body of armored) {
        const lift = liftOf(body);

        if (lift > 0) {
          const position = body.body.translation();
          const shadow = shadowOf(position, lift);
          renderer.addBody({ ...fieldDraw(body.field, body.slot), x: shadow.x, y: shadow.y, angle: body.body.rotation(), color: SHADOW_COLOR, alpha: SHADOW_ALPHA, height: 0 });
        }
      }

      for (const shell of shells) {
        if (shell.lob && shell.lob.height > 0) {
          const shadow = shadowOf(shell, shell.lob.height);
          renderer.addBody({ ...grenadeDraw.draw, x: shadow.x, y: shadow.y, angle: 0, color: SHADOW_COLOR, alpha: SHADOW_ALPHA, height: 0 });
        }
      }

      for (const body of armored) {
        const lift = liftOf(body);
        const seen = seenFrom(view, body.body.translation(), lift);
        renderer.addBody({
          ...scaled(fieldDraw(body.field, body.slot), seen.scale),
          kind: body.coreOpen ? KIND_FIELD_OPEN : KIND_FIELD,
          height: body.tank ? HULL_HEIGHT : CRATE_HEIGHT,
          x: seen.x,
          y: seen.y,
          angle: body.body.rotation(),
          color: rgb(body.color),
          flash: body.flash
        });
      }

      for (const body of armored) {
        if (body.tank) {
          const position = seenFrom(view, body.body.translation(), liftOf(body));
          const angle = body.tank.turretAngle;
          const kick = body.barrelKick;
          const look = body.look ?? MEDIUM_LOOK;

          // A casemate is part of the hull: it turns with it, and only the gun inside it aims.
          if (look.casemate) {
            renderer.addBody({ ...turretDraw(TURRET_CASEMATE), style: TURRET_CASEMATE, x: position.x, y: position.y, angle: body.body.rotation(), color: rgb(body.color), flash: body.flash, height: CASEMATE_HEIGHT });
          }

          renderer.addBody({
            ...turretDraw(look.turret),
            style: look.turret,
            spin: body.spin,
            x: position.x - Math.cos(angle) * kick,
            y: position.y - Math.sin(angle) * kick,
            angle,
            color: rgb(body.color),
            flash: body.flash
          });
        }
      }

      // Shells cast a shadow of their own and glow on what they pass; lobbed ones rise toward the camera.
      for (const shell of shells) {
        const size = shell.spec.size ?? 1;

        if (shell.lob) {
          const seen = seenFrom(view, shell, shell.lob.height);
          renderer.addBody({ ...scaled(grenadeDraw.draw, seen.scale * size), x: seen.x, y: seen.y, angle: shell.lob.age * GRENADE_TUMBLE, color: GRENADE_COLOR, height: 0 });
          continue;
        }

        renderer.addBody({ ...scaled(shellDraw.draw, size), x: shell.x, y: shell.y, angle: Math.atan2(shell.direction.y, shell.direction.x), color: SHELL_COLOR, height: SHELL_HEIGHT });

        if (size >= 0.75) {
          renderer.addLight(shell.x, shell.y, SHELL_LIGHT * size, 0.5, [1, 0.75, 0.4], SHELL_LIGHT_HEIGHT);
        }
      }

      overlay?.();
      burning.draw();

      for (const light of flashes) {
        const fade = 1 - light.age / light.life;
        renderer.addLight(light.x, light.y, light.radius * (0.6 + 0.4 * fade), light.intensity * fade * fade, light.color, light.height);
      }

      // An open core glows; the hull around it is taller than the light, so it only shines out through the hole.
      for (const body of armored) {
        if (body.coreOpen) {
          const core = toWorld(body.body, (body.hull ?? MEDIUM_HULL).core);
          const pulse = 0.75 + 0.25 * Math.sin(clock * 9 + body.slot);
          renderer.addLight(core.x, core.y, CORE_LIGHT, pulse, [1, 0.5, 0.15], CORE_HEIGHT);
        }
      }
    },

    /**
     * Removes every tank, crate and debris piece, cancels pending respawns, mends the walls and puts
     * the layout's crates back.
     */
    reset() {
      for (const body of [...armored]) {
        remove(body);
      }

      for (const piece of debris.splice(0)) {
        if (piece.slot !== undefined) {
          renderer.releaseField(piece.slot);
        }
      }

      walls.reset();

      respawns.length = 0;
      shells.length = 0;
      layout.crates?.forEach((placement) => spawnCrate(placement));
    }
  };

  function spawnTank(
    placement: Placement,
    options: { color: number; team?: string; pullSpeed?: number; respawn?: boolean; hull?: HullSpec; mass?: number; look?: TankLook }
  ) {
    const mass = options.mass ?? TANK_MASS;
    // The pull weighs as many times more as the hull, so every hull is towed alike.
    const tank = createTank(rapier, world, placement, options.color, options.pullSpeed, mass / TANK_MASS);
    tank.turretAngle = placement.turret ?? placement.rotation;
    const field = createHullField(options.hull);
    const respawn = options.respawn ? () => spawnTank(placement, options) : undefined;
    const entry = register(tank.hull, field, options.color, mass, respawn, tank, options.team);
    entry.hull = options.hull;
    entry.look = options.look;

    return tank;
  }

  function spawnCrate(placement: Placement) {
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(placement.x, placement.y)
        .setRotation(placement.rotation)
        .setLinearDamping(50)
        .setAngularDamping(25)
    );

    // A crate is thin enough for a piercing round and low enough for a grenade to fly over.
    const entry = register(body, createCrateField(), PROP_COLOR, CRATE_MASS, () => spawnCrate(placement));
    entry.thin = true;
    entry.top = CRATE_HEIGHT;
  }

  /**
   * Gives a body its armor: a field slot, colliders built from the field and an entry in the lookups.
   *
   * @param respawn - Brings the body back after it is destroyed; tanks spawned without `respawn` have none.
   */
  function register(
    body: RigidBody,
    field: DamageField,
    color: number,
    mass: number,
    respawn: (() => void) | undefined,
    tank?: Tank,
    team?: string
  ): Armored {
    const slot = renderer.allocateField() ?? reclaimDebrisSlot();

    if (slot === undefined) {
      throw new Error('The battle ran out of field slots.');
    }

    const area = solidBoxes(field, blockCells(field)).area;
    const entry: Armored = {
      body,
      field,
      pristine: tank ? field.data.slice() : undefined,
      slot,
      color,
      tank,
      team,
      move: STOP,
      density: mass / area,
      area,
      fullArea: area,
      colliders: [],
      coreOpen: false,
      barrelKick: 0,
      changed: true,
      flash: 0,
      exhaust: random(),
      before: { velocity: { x: 0, y: 0 }, spin: 0 },
      lastShooter: undefined,
      respawn,
      hull: undefined,
      look: undefined,
      thin: false,
      // Bodies are tall unless said otherwise, so a grenade bounces off any new kind, such as a wall.
      top: tank ? TANK_TOP : Infinity,
      airborne: undefined,
      spin: 0
    };
    armored.push(entry);

    if (tank) {
      byTank.set(tank, entry);
    }

    refreshShape(entry);

    return entry;
  }

  /** Takes the slot of the oldest debris piece that has one, for a body that needs a slot when all are taken. */
  function reclaimDebrisSlot() {
    const index = debris.findIndex((piece) => piece.slot !== undefined);

    if (index < 0) {
      return undefined;
    }

    const [piece] = debris.splice(index, 1);
    return piece.slot;
  }

  /** Detaches loose armor, rebuilds colliders from the field and uploads it. */
  function refreshShape(body: Armored) {
    body.changed = false;

    for (const fragment of detachLoosePieces(body.field, MIN_FRAGMENT_CELLS)) {
      launchFragment(body, fragment, toWorld(body.body, { x: fragment.centerX, y: fragment.centerY }), 60);
    }

    for (const collider of body.colliders) {
      owners.delete(collider.handle);
      world.removeCollider(collider, false);
    }

    const { boxes, area } = solidBoxes(body.field, blockCells(body.field));

    if (boxes.length === 0) {
      remove(body);
      scheduleRespawn(body);
      reportDestroyed(body);
      return;
    }

    body.area = area;
    body.colliders = boxes.map((box) => {
      const collider = world.createCollider(
        rapier.ColliderDesc.cuboid(box.halfWidth, box.halfHeight)
          .setTranslation(box.x, box.y)
          .setMass(body.density * box.halfWidth * box.halfHeight * 4)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        body.body
      );
      owners.set(collider.handle, body);
      return collider;
    });
    body.body.wakeUp();
    body.coreOpen = body.tank !== undefined && isCoreExposed(body.field);
    renderer.uploadField(body.slot, body.field);
  }

  /** Dents both bodies of a new contact in proportion to how fast they met. */
  function crash(firstHandle: number, secondHandle: number) {
    const first = owners.get(firstHandle);
    const second = owners.get(secondHandle);

    if (!first && !second) {
      return;
    }

    const firstCollider = world.getCollider(firstHandle);
    const secondCollider = world.getCollider(secondHandle);
    let contact: { point: Point; normal: Point } | undefined;

    world.contactPair(firstCollider, secondCollider, (manifold, flipped) => {
      if (contact || manifold.numSolverContacts() === 0) {
        return;
      }

      const normal = manifold.normal();
      const sign = flipped ? -1 : 1;
      contact = { point: manifold.solverContactPoint(0), normal: { x: normal.x * sign, y: normal.y * sign } };
    });

    if (!contact) {
      return;
    }

    const { point, normal } = contact;
    const firstVelocity = first ? velocityAt(first, point) : { x: 0, y: 0 };
    const secondVelocity = second ? velocityAt(second, point) : { x: 0, y: 0 };
    const speed = (firstVelocity.x - secondVelocity.x) * normal.x + (firstVelocity.y - secondVelocity.y) * normal.y;

    if (speed < CRASH_SPEED) {
      return;
    }

    const firstMass = first?.body.mass() ?? Infinity;
    const secondMass = second?.body.mass() ?? Infinity;
    const depth = (speed - CRASH_SPEED) * CRASH_DEPTH_PER_SPEED;

    if (first) {
      dentAt(first, point, { x: -normal.x, y: -normal.y }, depth * share(firstMass, secondMass));
    }

    if (second) {
      dentAt(second, point, normal, depth * share(secondMass, firstMass));
    }

    for (let index = 0; index < Math.min(Math.round(speed / 60), 8); index++) {
      const angle = Math.atan2(normal.y, normal.x) + Math.PI / 2 + between(-0.6, 0.6) + (index % 2) * Math.PI;
      const sparkSpeed = between(80, 220);
      renderer.spawn(PARTICLE_SPARK, point.x, point.y, Math.cos(angle) * sparkSpeed, Math.sin(angle) * sparkSpeed, between(0.1, 0.25), 2, SPARK_COLOR);
    }
  }

  function dentAt(body: Armored, point: Point, direction: Point, depth: number) {
    dent(body.field, toLocal(body.body, point), rotateInto(body.body, direction), Math.min(depth, MAX_CRASH_DEPTH), CRASH_RADIUS);
    body.changed = true;
  }

  /** Point velocity of `body` before this step's contacts resolved. */
  function velocityAt(body: Armored, point: Point) {
    const center = body.body.translation();
    return {
      x: body.before.velocity.x - body.before.spin * (point.y - center.y),
      y: body.before.velocity.y + body.before.spin * (point.x - center.x)
    };
  }

  function fire(tank: Tank) {
    const shooter = byTank.get(tank);
    let start = muzzleAt(tank, tank.turretAngle);
    let direction = { x: Math.cos(tank.turretAngle), y: Math.sin(tank.turretAngle) };
    let remaining = SHOT_RANGE;
    const path = [start];
    const passes = (body: Armored, first: boolean) => (first && body === shooter) || passesAsTeammate(shooter?.team, shooter, body);

    shooter?.body.applyImpulse({ x: -direction.x * RECOIL, y: -direction.y * RECOIL }, true);
    muzzleBlast(start, direction, shooter, castShot(start, direction, (body) => passes(body, true), SHOT_RANGE, OVER_RUBBLE).distance);

    for (let bounce = 0; bounce <= MAX_RICOCHETS; bounce++) {
      const hit = castShot(start, direction, (body) => passes(body, bounce === 0), remaining, bounce === 0 ? OVER_RUBBLE : 0);
      const end = { x: start.x + direction.x * hit.distance, y: start.y + direction.y * hit.distance };
      smokeTrail(start, end);
      path.push(end);

      if (hit.distance >= remaining) {
        break;
      }

      const bounced = strike(hit, end, direction, tank, HITSCAN_HIT, bounce < MAX_RICOCHETS);

      if (!bounced) {
        break;
      }

      direction = bounced.direction;
      start = bounced.from;
      remaining -= hit.distance;
    }

    options.onShot?.(tank, path);
  }

  /** Whether a shot from `shooter`, of `team`, passes through `body` because they are teammates. */
  function passesAsTeammate(team: string | undefined, shooter: Armored | undefined, body: Armored) {
    return !friendlyFire && team !== undefined && body.team === team && body !== shooter;
  }

  /**
   * What a shot does where it meets something: it chips a wall, detonates a core, chips armor
   * met head on, or glances off armor and flies on. A shell that pierces flies on through the
   * hole it chipped, or clean through a thin body.
   *
   * @param canBounce - Whether the shot may fly on after a glancing hit; a spent one only scuffs the armor.
   * @param shell - The shell striking, if it is one, whose pierce it may spend.
   * @returns Where and in which direction the shot flies on, and whether off a ricochet, or
   *   `undefined` when the shot stops here.
   */
  function strike(
    hit: ReturnType<typeof castShot>,
    end: Point,
    direction: Point,
    tank: Tank,
    blow: Pick<ShellSpec, 'hole' | 'depth' | 'knockback' | 'ricochet'>,
    canBounce: boolean,
    shell?: Shell
  ) {
    if (!hit.target) {
      const material = hit.tile && walls.chip(end, direction, hit.tile, blow.hole / SHELL_HOLE);
      impact(end, { x: -direction.x, y: -direction.y });
      spawnDust(end, direction, material ? material.color.map((channel) => channel * 0.6) : WALL_DUST);
      return undefined;
    }

    hit.target.lastShooter = tank;

    if (hit.part === 'core') {
      reportHit(hit.target, tank, 'core');
      destroy(hit.target, direction);
      return undefined;
    }

    if (shell && hit.target.thin && shell.pierce.thin > 0) {
      shell.pierce.thin--;
      impact(end, { x: -direction.x, y: -direction.y });
      return { direction, from: punchThrough(hit.target, end, direction, blow), ricochet: false };
    }

    const normal = worldNormal(hit.target, end);

    if (!normal || blow.ricochet === false || -(direction.x * normal.x + direction.y * normal.y) > RICOCHET_COS) {
      impact(end, { x: -direction.x, y: -direction.y });
      damage(hit.target, end, direction, blow);
      const cost = blow.depth + blow.hole;

      // A piercing shell whose tunnel passes by the core bores into it.
      if (shell && hit.target.tank && shell.pierce.armor > 0 && boresCore(hit.target, end, direction, cost)) {
        reportHit(hit.target, tank, 'core');
        destroy(hit.target, direction);
        return undefined;
      }

      reportHit(hit.target, tank, 'armor');

      // A piercing shell flies on into the hole it chipped, which may lead to the core.
      if (shell && hit.target.tank && shell.pierce.armor >= cost) {
        shell.pierce.armor -= cost;
        return { direction, from: { x: end.x + direction.x * 0.5, y: end.y + direction.y * 0.5 }, ricochet: false };
      }

      return undefined;
    }

    const along = direction.x * normal.x + direction.y * normal.y;
    const bounce = { x: direction.x - 2 * along * normal.x, y: direction.y - 2 * along * normal.y };
    ricochet(hit.target, end, normal, bounce);
    reportHit(hit.target, tank, 'ricochet');
    return canBounce ? { direction: bounce, from: { x: end.x + normal.x * 0.5, y: end.y + normal.y * 0.5 }, ricochet: true } : undefined;
  }

  /** Whether a tunnel `length` pixels long into `body` from `entry` along `direction` passes close enough to the core to open it. */
  function boresCore(body: Armored, entry: Point, direction: Point, length: number) {
    const core = (body.hull ?? MEDIUM_HULL).core;
    const start = toLocal(body.body, entry);
    const inward = rotateInto(body.body, direction);
    const along = Math.min(Math.max((core.x - start.x) * inward.x + (core.y - start.y) * inward.y, 0), length);
    const gap = Math.hypot(start.x + inward.x * along - core.x, start.y + inward.y * along - core.y);
    return gap < core.radius + BORE_REACH;
  }

  /**
   * Bores a tunnel clean through a thin body from where a shot entered it, chipping holes along
   * the way and knocking it back a little, and returns where the shot comes out.
   */
  function punchThrough(body: Armored, entry: Point, direction: Point, blow: Pick<ShellSpec, 'hole' | 'knockback'>) {
    const local = toLocal(body.body, entry);
    const inward = rotateInto(body.body, direction);
    const sample = new Float32Array(CHANNELS);
    const seed = random() * 1000;
    let depth = 0;

    while (depth < MAX_PUNCH && sampleField(body.field, local.x + inward.x * depth, local.y + inward.y * depth, sample)[0] < 0) {
      depth += PUNCH_STEP;
    }

    for (let along = 0; along <= depth; along += blow.hole * 0.7) {
      carve(body.field, { x: local.x + inward.x * along, y: local.y + inward.y * along }, blow.hole * 0.8, 0.3, seed + along);
    }

    body.body.applyImpulse({ x: direction.x * blow.knockback * 0.3, y: direction.y * blow.knockback * 0.3 }, true);
    body.flash = 1;
    body.changed = true;
    const exit = { x: entry.x + direction.x * (depth + 0.5), y: entry.y + direction.y * (depth + 0.5) };
    spawnDust(exit, { x: -direction.x, y: -direction.y }, rgb(body.color).map((value) => value * 0.55));
    return exit;
  }

  /**
   * Fires a shell, or a volley of them, from `tank`'s muzzle along the shot's angle, with one
   * muzzle blast and recoil.
   */
  function launchShell(tank: Tank, spec: ShellSpec, shot: Shot) {
    const shooter = byTank.get(tank);
    const angle = shot.angle ?? tank.turretAngle;
    const start = muzzleAt(tank, angle);
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const size = shot.flash ?? 1;

    for (const offset of shot.volley ?? [0]) {
      addShell(tank, shooter?.team, start, { x: Math.cos(angle + offset), y: Math.sin(angle + offset) }, spec, { reach: shot.reach, primary: true });
    }

    shooter?.body.applyImpulse({ x: -direction.x * RECOIL * size, y: -direction.y * RECOIL * size }, true);
    muzzleBlast(start, direction, shooter, undefined, size);
  }

  /**
   * Puts a shell in flight from `start`.
   *
   * @param options.reach - How far a lobbed shell is thrown.
   * @param options.primary - The shell was fired by a gun rather than thrown out by a blast, so
   *   `onShot` reports its path.
   */
  function addShell(tank: Tank, team: string | undefined, start: Point, direction: Point, spec: ShellSpec, options: { reach?: number; primary: boolean }) {
    const shell: Shell = {
      id: shellId++,
      shooter: tank,
      team,
      spec,
      x: start.x,
      y: start.y,
      direction,
      speed: spec.speed,
      remaining: spec.range,
      bounces: 0,
      pierce: { armor: spec.pierce?.armor ?? 0, thin: spec.pierce?.thin ? MAX_PUNCHES : 0 },
      lob: spec.lob && launchLob(spec.lob, spec.speed, options.reach ?? spec.range, spec.range),
      primary: options.primary,
      path: [start],
      leg: { travelled: 0, length: 0 },
      drift: { x: 0, y: 0 }
    };

    shell.leg.length = expectedLeg(shell);
    shells.push(shell);
  }

  /**
   * Moves a shell along its flight for `dt` seconds: it strikes the first thing in its way, flies
   * on after a ricochet with the range it has left, and falls once the range is spent. A shell
   * with a blast goes off where it stops.
   */
  function flyShell(shell: Shell, dt: number) {
    if (shell.lob) {
      flyLob(shell, shell.lob, dt);
      return;
    }

    const spec = shell.spec;
    let step = Math.min(spec.speed * dt, shell.remaining);

    // A shell bouncing in a corner could strike over and over within one step; a few strikes are plenty.
    for (let strikes = 0; strikes < 4 && step > 1e-6; strikes++) {
      const from = { x: shell.x, y: shell.y };
      const hit = castShot(from, shell.direction, (body) => passesShell(shell, body), step, overRubble(shell));
      const end = { x: from.x + shell.direction.x * hit.distance, y: from.y + shell.direction.y * hit.distance };
      shellTrail(shell, from, end);
      shell.x = end.x;
      shell.y = end.y;
      shell.remaining -= hit.distance;
      shell.leg.travelled += hit.distance;

      if (hit.distance >= step) {
        break;
      }

      step -= hit.distance;
      shell.path.push(end);
      const bite = 1 - (spec.fade ?? 0) * Math.min(1 - shell.remaining / spec.range, 1);
      const blow = { ...spec, hole: spec.hole * bite, depth: spec.depth * bite };
      const onward = strike(hit, end, shell.direction, shell.shooter, blow, shell.bounces < MAX_RICOCHETS, shell);

      if (!onward) {
        detonate(shell, end);
        return;
      }

      if (onward.ricochet) {
        shell.bounces++;
      }

      shell.direction = onward.direction;
      // A bounce starts a hair off the surface, a pierce on the far side; that way counts against the range too.
      shell.remaining = Math.max(shell.remaining - Math.hypot(onward.from.x - end.x, onward.from.y - end.y), 0);
      shell.x = onward.from.x;
      shell.y = onward.from.y;
      shell.drift = { x: 0, y: 0 };
      shell.leg = { travelled: 0, length: 0 };
      shell.leg.length = expectedLeg(shell);
    }

    if (shell.remaining <= 1e-6) {
      fall(shell);
    }
  }

  /**
   * Moves a lobbed shell for `dt` seconds: up and down along its arc, over the ground at its
   * speed, which every bounce on the ground and the rolling after cut. It flies over bodies lower
   * than itself and bounces off walls and taller bodies, except an enemy tank it meets before it
   * first landed, which sets it off. It goes off when its fuse has burned down.
   */
  function flyLob(shell: Shell, lob: LobState, dt: number) {
    const spec = shell.spec.lob!;

    if (stepLob(spec, lob, dt)) {
      shell.speed *= spec.bounce;
      spawnDust(shell, { x: -shell.direction.x, y: -shell.direction.y }, FALL_DUST.slice(0, 3));
    }

    if (isRolling(lob)) {
      shell.speed *= Math.exp(-spec.roll * dt);
    }

    let step = shell.speed * dt;

    for (let strikes = 0; strikes < 3 && step > 1e-6; strikes++) {
      const from = { x: shell.x, y: shell.y };
      const hit = castLob(shell, lob, from, step);
      const end = { x: from.x + shell.direction.x * hit.distance, y: from.y + shell.direction.y * hit.distance };
      shell.x = end.x;
      shell.y = end.y;

      if (hit.distance >= step) {
        break;
      }

      step -= hit.distance;

      if (hit.target?.tank && !lob.landed) {
        shell.path.push(end);

        // A grenade that flies into an open core destroys it before it goes off.
        if (hit.part === 'core') {
          hit.target.lastShooter = shell.shooter;
          reportHit(hit.target, shell.shooter, 'core');
          destroy(hit.target, shell.direction);
        }

        detonate(shell, end);
        return;
      }

      const normal = hit.normal ?? (hit.target && worldNormal(hit.target, end)) ?? { x: -shell.direction.x, y: -shell.direction.y };
      const along = shell.direction.x * normal.x + shell.direction.y * normal.y;
      shell.direction = normalize({ x: shell.direction.x - 2 * along * normal.x, y: shell.direction.y - 2 * along * normal.y });
      shell.speed *= spec.rebound;
      shell.bounces++;
      shell.x = end.x + normal.x * 0.5;
      shell.y = end.y + normal.y * 0.5;
      shell.path.push(end);

      for (let index = 0; index < 3; index++) {
        const angle = Math.atan2(normal.y, normal.x) + between(-0.9, 0.9);
        const speed = between(60, 160);
        renderer.spawn(PARTICLE_SPARK, end.x, end.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.06, 0.14), 1.5, SPARK_COLOR);
      }
    }

    // Before it first lands, a grenade goes off as it brushes past an enemy tank, as a pipe's wide hull hits in Team Fortress 2.
    const brushed = !lob.landed && lob.height < TANK_TOP && armored.some((body) => body.tank && !passesShell(shell, body) && hullDistance(body, shell) < PROXIMITY);

    if (brushed || lob.age >= spec.fuse) {
      shell.path.push({ x: shell.x, y: shell.y });
      detonate(shell, { x: shell.x, y: shell.y });
    }
  }

  /** Distance from a point to the outside of a tank's hull box, by its shape rather than its chipped armor. */
  function hullDistance(body: Armored, point: Point) {
    const hull = body.hull ?? MEDIUM_HULL;
    const local = toLocal(body.body, point);
    const qx = Math.abs(local.x) - hull.halfLength;
    const qy = Math.abs(local.y) - hull.halfWidth;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  }

  /**
   * The first wall, or body taller than a lobbed shell flies, within `maxDistance` of it, with the
   * wall's normal. It flies over rubble, passes its own tank until its first bounce and teammates
   * without friendly fire.
   */
  function castLob(shell: Shell, lob: LobState, from: Point, maxDistance: number) {
    return castShot(from, shell.direction, (body) => body.top <= lob.height || passesShell(shell, body), maxDistance, Infinity);
  }

  /** Ends a shell where it stopped at `at`: a shell with a blast goes off there and throws out its shrapnel. */
  function detonate(shell: Shell, at: Point) {
    const spec = shell.spec;

    if (spec.blast) {
      // Back off the surface a little, so the blast sees the face it hit.
      const center = { x: at.x - shell.direction.x * 1.5, y: at.y - shell.direction.y * 1.5 };
      explode(center, spec.blast, shell.shooter, shell.team);

      for (let index = 0; index < (spec.fragments?.count ?? 0); index++) {
        const angle = between(0, Math.PI * 2);
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        addShell(shell.shooter, shell.team, center, direction, spec.fragments!.shell, { primary: false });
      }
    }

    stopShell(shell);
  }

  /** Whether a shell flies through `body`: its own tank until the first ricochet, and teammates without friendly fire. */
  function passesShell(shell: Shell, body: Armored) {
    const shooter = byTank.get(shell.shooter);
    return (body.tank === shell.shooter && shell.bounces === 0) || passesAsTeammate(shell.team, shooter, body);
  }

  /** How far the shell's current leg will likely reach, for the fade along its trail. */
  function expectedLeg(shell: Shell) {
    const distance = castShot({ x: shell.x, y: shell.y }, shell.direction, (body) => passesShell(shell, body), shell.remaining, overRubble(shell)).distance;
    return Math.max(distance, 1);
  }

  /**
   * Pixels ahead of a shell over which it still passes over rubble: the first few after the
   * muzzle. Shrapnel flies from a blast, not a muzzle, and meets rubble at once.
   */
  function overRubble(shell: Shell) {
    return shell.primary ? Math.max(OVER_RUBBLE - (shell.spec.range - shell.remaining), 0) : 0;
  }

  /**
   * Extends a shell's trail by one segment, from `from` to `to`, in the look of `smokeTrail`. The
   * segment is a trail of its own that starts where the previous one ended, with the same drift,
   * so the pieces stay joined as they drift apart from the rest.
   */
  function shellTrail(shell: Shell, from: Point, to: Point) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    if (length < 0.01) {
      return;
    }

    const t0 = Math.min(shell.leg.travelled / shell.leg.length, 1);
    const t1 = Math.min((shell.leg.travelled + length) / shell.leg.length, 1);
    const angle = between(0, Math.PI * 2);
    const speed = between(1, 10);
    const drift = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    trailId = (trailId + 1) % 1e6;
    renderer.spawn(PARTICLE_TRAIL, from.x, from.y, shell.drift.x, shell.drift.y, TRAIL_LIFETIME, TRAIL_WIDTH, [t0, trailId, 0, 0]);
    renderer.spawn(PARTICLE_TRAIL, to.x, to.y, drift.x, drift.y, TRAIL_LIFETIME, TRAIL_WIDTH, [t1, trailId, 0, 0]);
    shell.drift = drift;
  }

  /** A spent shell drops to the ground in a puff of dust; one with a blast goes off there. */
  function fall(shell: Shell) {
    const at = { x: shell.x, y: shell.y };

    if (shell.spec.blast) {
      shell.path.push(at);
      detonate(shell, at);
      return;
    }

    for (let index = 0; index < 6; index++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(20, 70);
      renderer.spawn(PARTICLE_DUST, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.4, 0.8), between(1, 1.6), FALL_DUST);
    }

    renderer.spawn(PARTICLE_SMOKE, at.x, at.y, shell.direction.x * 15, shell.direction.y * 15, between(0.5, 0.8), between(2, 3), NO_COLOR);
    shell.path.push(at);
    stopShell(shell);
  }

  function stopShell(shell: Shell) {
    shells.splice(shells.indexOf(shell), 1);

    if (shell.primary) {
      options.onShot?.(shell.shooter, shell.path);
    }
  }

  function reportHit(body: Armored, shooter: Tank | undefined, part: 'armor' | 'core' | 'ricochet') {
    if (body.tank) {
      options.onHit?.(body.tank, shooter, part);
    }
  }

  function reportDestroyed(body: Armored) {
    if (body.tank) {
      options.onDestroyed?.(body.tank, body.lastShooter);
    }
  }

  /**
   * Finds the first armor, core, wall or rubble within `maxDistance` along a ray, skipping bodies
   * for which `skip` returns true. A wall hit comes with the wall's outward normal there and, for
   * a breakable wall, the tile hit.
   *
   * @param overRubble - Pixels from the start over which the ray passes over rubble; `Infinity`
   *   passes over all of it, as a lobbed grenade does.
   */
  function castShot(start: Point, direction: Point, skip: (body: Armored) => boolean, maxDistance: number, overRubble = 0) {
    let best: { distance: number; target?: Armored; part?: 'armor' | 'core'; tile?: Tile; normal?: Point } = { distance: maxDistance };

    for (const body of armored) {
      if (skip(body)) {
        continue;
      }

      const hit = raycastField(body.field, toLocal(body.body, start), rotateInto(body.body, direction), best.distance);

      if (hit && hit.distance < best.distance) {
        best = { distance: hit.distance, target: body, part: hit.part };
      }
    }

    const wall = walls.cast(start, direction, best.distance, overRubble);

    return wall ? { distance: wall.distance, tile: wall.tile, normal: wall.normal } : best;
  }

  /**
   * Chips the armor where a shot hit, dents it slightly and knocks the body back. A deep blow
   * chips a row of craters inward from the surface.
   */
  function damage(body: Armored, point: Point, direction: Point, blow: Pick<ShellSpec, 'hole' | 'depth' | 'knockback'>) {
    const local = toLocal(body.body, point);
    const inward = rotateInto(body.body, direction);
    const craters = Math.ceil(blow.depth / (blow.hole * 0.5));
    const seed = random() * 1000;

    for (let crater = 0; crater <= craters; crater++) {
      const along = 0.6 + (craters > 0 ? (blow.depth * crater) / craters : 0);
      carve(body.field, { x: local.x + inward.x * along, y: local.y + inward.y * along }, blow.hole, 0.35, seed + crater * 7.31);
    }

    const spin = blow.knockback * KNOCKBACK_SPIN_SHARE;
    dent(body.field, local, inward, 0.9, 4.5);
    body.body.applyImpulse({ x: direction.x * blow.knockback, y: direction.y * blow.knockback }, true);
    body.body.applyImpulseAtPoint({ x: direction.x * spin, y: direction.y * spin }, point, true);
    body.flash = 1;
    body.changed = true;

    const color = rgb(body.color);
    spawnDust(point, direction, [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55]);
  }

  /** Chips of material bouncing back toward the shooter. */
  function spawnDust(point: Point, direction: Point, color: readonly number[]) {
    for (let index = 0; index < 5; index++) {
      const angle = Math.atan2(-direction.y, -direction.x) + between(-1.1, 1.1);
      const speed = between(40, 140);
      renderer.spawn(PARTICLE_DUST, point.x, point.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.4, 0.9), between(1, 1.5), [...color, 1]);
    }
  }

  /** A glancing hit: a scuff of soot, a shallow dent, a shove off the surface and sparks along the bounce. */
  function ricochet(body: Armored, point: Point, normal: Point, bounce: Point) {
    const local = toLocal(body.body, point);
    scorch(body.field, local, 2.5);
    dent(body.field, local, rotateInto(body.body, { x: -normal.x, y: -normal.y }), 0.3, 3);
    body.body.applyImpulseAtPoint({ x: -normal.x * RICOCHET_PUSH, y: -normal.y * RICOCHET_PUSH }, point, true);
    body.flash = 0.6;
    body.changed = true;
    impact(point, bounce);
  }

  /** Outward normal of `body`'s armor at a world point, in world axes. */
  function worldNormal(body: Armored, point: Point) {
    const local = surfaceNormal(body.field, toLocal(body.body, point));
    return local && rotateOut(body.body, local);
  }

  /**
   * A trail of smoke along a shot segment, after Godot's `bullet.gd`: points every 15 px that
   * drift apart at a few pixels a second while the trail fades out over 2 s.
   */
  function smokeTrail(start: Point, end: Point) {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const count = Math.max(Math.ceil(length / TRAIL_SPACING), 1);
    trailId = (trailId + 1) % 1e6;

    for (let index = 0; index <= count; index++) {
      const t = index / count;
      const angle = between(0, Math.PI * 2);
      const drift = index === 0 ? 0 : between(1, 10);
      renderer.spawn(
        PARTICLE_TRAIL,
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t,
        Math.cos(angle) * drift,
        Math.sin(angle) * drift,
        TRAIL_LIFETIME,
        TRAIL_WIDTH,
        [t, trailId, 0, 0]
      );
    }
  }

  /**
   * The gun going off, after photos of tank guns firing: a flash that lights the ground and throws
   * shadows, a fireball blown forward out of the barrel with two side jets, a little smoke and a few
   * sparks. The barrel kicks back and the camera shakes if it is near.
   *
   * @param reach - Where a hitscan shot first stops: the main light rides out of the barrel up to
   *   there. A shell carries its own light, so it passes `undefined` and the light stays at the muzzle.
   * @param size - 1 for a tank gun; a machine gun's smaller blast has fewer, smaller puffs, a
   *   dimmer flash and shakes the camera less.
   */
  function muzzleBlast(at: Point, direction: Point, shooter: Armored | undefined, reach: number | undefined, size = 1) {
    const across = { x: -direction.y, y: direction.x };
    // A brief flash at the muzzle lights the tank itself, so its turret shades the hull.
    flash(at.x + direction.x * 2, at.y + direction.y * 2, MUZZLE_GLARE * size, 0.07, 1, [1, 0.8, 0.5], MUZZLE_HEIGHT);

    // The main light rides out of the barrel after the shot, fading as it goes.
    if (size >= 0.75) {
      flash(at.x + direction.x * 3, at.y + direction.y * 3, MUZZLE_LIGHT * size, MUZZLE_LIGHT_LIFE, 1, [1, 0.72, 0.38], MUZZLE_HEIGHT, {
        x: direction.x * MUZZLE_LIGHT_SPEED,
        y: direction.y * MUZZLE_LIGHT_SPEED,
        distance: Math.max((reach ?? 0) - 3, 0)
      });
    }

    for (let index = 0; index < Math.round(10 * size); index++) {
      const angle = Math.atan2(direction.y, direction.x) + between(-0.3, 0.3);
      const speed = between(80, 280) * size;
      const ahead = between(2, 10) * size;
      renderer.spawn(PARTICLE_FIRE, at.x + direction.x * ahead, at.y + direction.y * ahead, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.1, 0.18), between(3.5, 6) * size, NO_COLOR);
    }

    for (const side of [-1, 1]) {
      const speed = between(60, 120);
      const vx = (across.x * side * 0.9 + direction.x * 0.4) * speed;
      const vy = (across.y * side * 0.9 + direction.y * 0.4) * speed;
      renderer.spawn(PARTICLE_FIRE, at.x, at.y, vx, vy, between(0.06, 0.1), between(1.5, 2.2) * size, NO_COLOR);
    }

    for (let index = 0; index < Math.round(6 * size); index++) {
      const angle = Math.atan2(direction.y, direction.x) + between(-0.7, 0.7);
      const speed = between(15, 70);
      const ahead = between(4, 14);
      renderer.spawn(PARTICLE_SMOKE, at.x + direction.x * ahead, at.y + direction.y * ahead, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.5, 0.9), between(2, 3.5) * size, NO_COLOR);
    }

    for (let index = 0; index < Math.max(Math.round(4 * size), 1); index++) {
      const angle = Math.atan2(direction.y, direction.x) + between(-0.25, 0.25);
      const speed = between(300, 550);
      renderer.spawn(PARTICLE_SPARK, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.08, 0.18), 2, SPARK_COLOR);
    }

    if (shooter) {
      shooter.barrelKick = BARREL_KICK * Math.max(size, 0.4);
    }

    shakeFrom(at, MUZZLE_SHAKE * size);
  }

  /** Shakes the camera by up to `strength`, less the farther `at` is from the point that hears it. */
  function shakeFrom(at: Point, strength: number) {
    const distance = Math.hypot(at.x - listener.x, at.y - listener.y);
    const falloff = Math.min(Math.max((SHAKE_FAR - distance) / (SHAKE_FAR - SHAKE_NEAR), 0), 1);
    shake = Math.max(shake, strength * falloff);
  }

  /**
   * A point light that fades out over `life` seconds.
   *
   * @param height - Height above the floor in pixels, which sets how long shadows fall.
   * @param motion - Velocity in pixels per second and how far the light may travel; it stays put without one.
   */
  function flash(
    x: number,
    y: number,
    radius: number,
    life: number,
    intensity: number,
    color: readonly number[],
    height: number,
    motion = { x: 0, y: 0, distance: 0 }
  ) {
    flashes.push({ x, y, radius, life, intensity, color, height, age: 0, motion, travelled: 0 });
  }

  /** A burst of light, a puff of fire and a fan of sparks thrown toward `toward`. */
  function impact(point: Point, toward: Point) {
    flash(point.x, point.y, IMPACT_LIGHT, 0.08, 0.8, [1, 0.7, 0.35], IMPACT_HEIGHT);
    renderer.spawn(PARTICLE_FIRE, point.x, point.y, toward.x * 40, toward.y * 40, between(0.06, 0.1), between(1.5, 2.5), NO_COLOR);

    for (let index = 0; index < 8; index++) {
      const angle = Math.atan2(toward.y, toward.x) + between(-1.1, 1.1);
      const speed = between(150, 420);
      renderer.spawn(PARTICLE_SPARK, point.x, point.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.1, 0.3), 2.5, SPARK_COLOR);
    }
  }

  /** Blows a body apart from its core: light, fire, smoke, the whole armor as debris, and a wreck fire left burning. */
  function destroy(body: Armored, direction: Point) {
    const center = body.body.translation();
    const velocity = body.body.linvel();

    flash(center.x, center.y, EXPLOSION_LIGHT, 0.45, 1, [1, 0.6, 0.28], EXPLOSION_HEIGHT);
    flash(center.x, center.y, EXPLOSION_LIGHT * 0.5, 0.15, 1, [1, 0.95, 0.8], EXPLOSION_HEIGHT);
    shakeFrom(center, EXPLOSION_SHAKE);

    for (let index = 0; index < 40; index++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(150, 480);
      renderer.spawn(PARTICLE_SPARK, center.x, center.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.15, 0.45), 2.5, SPARK_COLOR);
    }

    for (let index = 0; index < 24; index++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(20, 130);
      renderer.spawn(PARTICLE_FIRE, center.x, center.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.4, 0.8), between(4, 7), NO_COLOR);
    }

    for (let index = 0; index < 30; index++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(10, 70);
      burning.puff(center.x + between(-8, 8), center.y + between(-8, 8), Math.cos(angle) * speed, Math.sin(angle) * speed, between(1.5, 3.5), between(5, 9));
    }

    for (const fragment of shatter(body.field, 7, MIN_FRAGMENT_CELLS, random)) {
      launchFragment(body, fragment, toWorld(body.body, { x: fragment.centerX, y: fragment.centerY }), 260, direction);
    }

    if (body.tank) {
      const angle = between(0, Math.PI * 2);
      debris.push({
        x: center.x,
        y: center.y,
        angle: body.tank.turretAngle,
        vx: velocity.x + Math.cos(angle) * 90 + direction.x * 60,
        vy: velocity.y + Math.sin(angle) * 90 + direction.y * 60,
        spin: between(-12, 12),
        age: 0,
        life: between(3, 4.5),
        color: rgb(body.color),
        turret: (body.look ?? MEDIUM_LOOK).turret
      });
    }

    // The wreck burns where it stood until it burns out.
    burning.ignite(center, WRECK_FIRE_SPREAD, options.wreckFire ?? WRECK_FIRE_LIFE, WRECK_FIRE_LIGHT, 0.5);

    remove(body);
    scheduleRespawn(body);
    reportDestroyed(body);
  }

  /** Turns a piece knocked out of a wall into debris, if a field slot is free for it. */
  function addWallDebris(piece: { field: DamageField; x: number; y: number; angle: number; vx: number; vy: number; color: readonly number[] }) {
    const slot = renderer.allocateField();

    if (slot === undefined) {
      return;
    }

    renderer.uploadField(slot, piece.field);
    debris.push({ ...piece, slot, spin: between(-5, 5), age: 0, life: between(2.5, 4) });
  }

  /** Turns a cut-off piece into debris flying away from `from`'s center. */
  function launchFragment(from: Armored, fragment: Fragment, at: Point, speed: number, push?: Point) {
    const slot = renderer.allocateField();

    if (slot === undefined) {
      return;
    }

    const center = from.body.translation();
    const velocity = from.body.linvel();
    const away = normalize({ x: at.x - center.x, y: at.y - center.y });
    const kick = between(0.4, 1) * speed;
    const piece = recenter(fragment);
    renderer.uploadField(slot, piece);
    debris.push({
      field: piece,
      slot,
      x: at.x,
      y: at.y,
      angle: from.body.rotation(),
      vx: velocity.x + away.x * kick + (push?.x ?? 0) * 60,
      vy: velocity.y + away.y * kick + (push?.y ?? 0) * 60,
      spin: between(-8, 8),
      age: 0,
      life: between(2.5, 4),
      color: rgb(from.color)
    });
  }

  /**
   * An explosion at `at`: a fireball, smoke, sparks and a flash, and a blast that reaches every
   * body with armor within its radius and in the open from it, as `BlastSpec` describes.
   */
  function explode(at: Point, spec: BlastSpec, shooter: Tank | undefined, team: string | undefined) {
    const source = shooter && byTank.get(shooter);
    blastEffects(at, spec.radius);

    for (const body of [...armored]) {
      const own = body.tank !== undefined && body.tank === shooter;

      // A body the blast destroyed already is gone; teammates are spared without friendly fire.
      if (!armored.includes(body) || (!own && passesAsTeammate(team, source, body))) {
        continue;
      }

      const reach = blastReach(body, at, spec.radius);

      if (!reach) {
        continue;
      }

      const falloff = 1 - 0.5 * (reach.distance / spec.radius);

      if (own) {
        throwBody(body, reach.direction, spec.knockback * falloff * (spec.self ?? 1));
        continue;
      }

      body.lastShooter = shooter ?? body.lastShooter;
      const core = body.coreOpen ? coreReach(body, at, spec.radius * (1 - CORE_BLAST) * 2) : undefined;

      // Only a core open before the blast: the hole a rocket chips as it hits does not let its own blast in.
      if (core) {
        reportHit(body, shooter, 'core');
        destroy(body, core);
        continue;
      }

      // The crater digs straight into the face the blast meets, the push goes away from the blast.
      const scale = body.tank ? 1 : (spec.structures ?? 1);
      const normal = worldNormal(body, reach.point);
      const inward = normal ? { x: -normal.x, y: -normal.y } : reach.direction;
      damage(body, reach.point, inward, { hole: spec.hole * falloff * Math.sqrt(scale), depth: spec.depth * falloff * scale, knockback: 0 });
      throwBody(body, reach.direction, spec.knockback * falloff);
      reportHit(body, shooter, 'armor');
    }

  }

  /**
   * Where a blast at `at` meets `body`: the first armor or open core on the line from the blast to
   * the body's center, if it lies within `radius` and no wall or crate stands in between.
   */
  function blastReach(body: Armored, at: Point, radius: number) {
    const center = body.body.translation();
    const length = Math.hypot(center.x - at.x, center.y - at.y);
    const direction = length > 1e-6 ? { x: (center.x - at.x) / length, y: (center.y - at.y) / length } : { x: 1, y: 0 };
    const hit = raycastField(body.field, toLocal(body.body, at), rotateInto(body.body, direction), radius);

    if (!hit) {
      return undefined;
    }

    const point = { x: at.x + direction.x * hit.distance, y: at.y + direction.y * hit.distance };
    const cover = castShot(at, direction, (other) => other === body || other.tank !== undefined, hit.distance);

    return cover.distance < hit.distance - 0.5 ? undefined : { distance: hit.distance, point, direction, part: hit.part };
  }

  /**
   * Whether a blast at `at` reaches the open core of `body` within `reach` pixels: the line from
   * the blast to the core meets the core before any armor and no wall or crate. Returns the line's
   * direction, or `undefined`.
   */
  function coreReach(body: Armored, at: Point, reach: number) {
    const core = toWorld(body.body, (body.hull ?? MEDIUM_HULL).core);
    const length = Math.hypot(core.x - at.x, core.y - at.y);

    if (length > reach + (body.hull ?? MEDIUM_HULL).core.radius) {
      return undefined;
    }

    const direction = length > 1e-6 ? { x: (core.x - at.x) / length, y: (core.y - at.y) / length } : { x: 1, y: 0 };
    const hit = raycastField(body.field, toLocal(body.body, at), rotateInto(body.body, direction), length + 1);

    if (hit?.part !== 'core' || hit.distance > reach) {
      return undefined;
    }

    const cover = castShot(at, direction, (other) => other === body || other.tank !== undefined, hit.distance);
    return cover.distance < hit.distance - 0.5 ? undefined : direction;
  }

  /**
   * Pushes a body away with `impulse`. A push hard enough lifts a tank off the ground: it flies on
   * with the push, its pull carried along, and cannot drive until it lands.
   */
  function throwBody(body: Armored, direction: Point, impulse: number) {
    body.body.applyImpulse({ x: direction.x * impulse, y: direction.y * impulse }, true);
    const speed = impulse / body.body.mass();

    if (!body.tank || speed < LIFT_SPEED) {
      return;
    }

    const time = Math.min(MIN_AIR_TIME + (speed - LIFT_SPEED) * AIR_TIME_PER_SPEED, MAX_AIR_TIME);

    if ((body.airborne?.left ?? 0) < time) {
      body.airborne = { left: time, total: time };
    }

    // The pull flies along at the hull's speed and slows with it, so it neither drags nor brakes the hull.
    body.body.setLinearDamping(AIR_DAMPING);
    body.tank.pull.setLinearDamping(AIR_DAMPING);
    body.tank.pull.setLinvel(body.body.linvel(), true);
  }

  /** Counts down a tank's time in the air; once it lands, the ground holds it again and its tracks raise dust. */
  function fly(body: Armored, dt: number) {
    const air = body.airborne!;
    air.left -= dt;

    if (air.left > 0) {
      return;
    }

    body.airborne = undefined;
    body.body.setLinearDamping(HULL_LINEAR_DAMPING);
    body.tank?.pull.setLinearDamping(0);
    spawnDust(body.body.translation(), normalize(body.body.linvel()), FALL_DUST.slice(0, 3));
    shakeFrom(body.body.translation(), LANDING_SHAKE);
  }

  /** Height in pixels a tank flies at, along an arc over its time in the air; 0 on the ground. */
  function liftOf(body: Armored) {
    const air = body.airborne;

    if (!air) {
      return 0;
    }

    const t = 1 - air.left / air.total;
    return 4 * t * (1 - t) * air.total * AIR_RISE;
  }

  /**
   * The look of an explosion of `radius`: a flash that throws shadows, a fireball, soot, dust
   * thrown out as far as the blast reaches, sparks, and a shake of the camera.
   */
  function blastEffects(at: Point, radius: number) {
    const size = radius / 80;
    flash(at.x, at.y, EXPLOSION_LIGHT * 0.7 * size, 0.3, 1, [1, 0.62, 0.3], EXPLOSION_HEIGHT);
    flash(at.x, at.y, EXPLOSION_LIGHT * 0.35 * size, 0.1, 1, [1, 0.95, 0.8], EXPLOSION_HEIGHT);
    shakeFrom(at, BLAST_SHAKE * size);

    for (let index = 0; index < Math.round(22 * size); index++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(30, 190) * size;
      renderer.spawn(PARTICLE_FIRE, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.22, 0.45), between(5, 9) * size, NO_COLOR);
    }

    for (let index = 0; index < Math.round(8 * size); index++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(10, 60);
      burning.puff(at.x + between(-6, 6), at.y + between(-6, 6), Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.9, 1.8), between(3, 5.5) * size);
    }

    for (let index = 0; index < 18; index++) {
      const angle = between(0, Math.PI * 2);
      const speed = radius * between(1.6, 2.6);
      renderer.spawn(PARTICLE_DUST, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.35, 0.6), between(1.1, 1.8), FALL_DUST);
    }

    for (let index = 0; index < 20; index++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(150, 420);
      renderer.spawn(PARTICLE_SPARK, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.12, 0.35), 2.5, SPARK_COLOR);
    }
  }

  /** Where `tank`'s muzzle is with its gun along `angle`: its look's barrel length out from the hull's center. */
  function muzzleAt(tank: Tank, angle: number) {
    const center = tank.hull.translation();
    const reach = byTank.get(tank)?.look?.muzzle ?? MEDIUM_LOOK.muzzle;
    return { x: center.x + Math.cos(angle) * reach, y: center.y + Math.sin(angle) * reach };
  }

  function remove(body: Armored) {
    const index = armored.indexOf(body);

    if (index < 0) {
      return;
    }

    armored.splice(index, 1);

    for (const collider of body.colliders) {
      owners.delete(collider.handle);
    }

    if (body.tank) {
      byTank.delete(body.tank);
      world.removeRigidBody(body.tank.pull);
    }

    world.removeRigidBody(body.body);
    renderer.releaseField(body.slot);
  }

  function scheduleRespawn(body: Armored) {
    const respawn = body.respawn;

    if (respawn) {
      respawns.push({ at: clock + RESPAWN_DELAY, spawn: respawn });
    }
  }

  function between(min: number, max: number) {
    return min + random() * (max - min);
  }
}

/** The battle core returned by `createCombat`. */
export type Combat = ReturnType<typeof createCombat>;

/** A body with destructible armor. */
type Armored = {
  body: RigidBody;
  field: DamageField;
  /** The undamaged field of a tank, which repairs restore. */
  pristine: Float32Array | undefined;
  slot: number;
  color: number;
  tank: Tank | undefined;
  team: string | undefined;
  /** Drive input of a tank, applied every step. */
  move: Point;
  /** Mass per square pixel of armor, so chipped armor weighs less. */
  density: number;
  /** Solid area now and when new, in square pixels. */
  area: number;
  fullArea: number;
  colliders: Collider[];
  /** A hole has opened onto the core, so it is drawn. */
  coreOpen: boolean;
  /** How far the turret is drawn pushed back after firing, in pixels. */
  barrelKick: number;
  /** The field changed since its colliders and GPU copy were refreshed. */
  changed: boolean;
  flash: number;
  exhaust: number;
  /** Velocity before the current physics step, for crash speeds. */
  before: { velocity: Point; spin: number };
  /** Tank whose shot hit this body last, credited if it falls apart. */
  lastShooter: Tank | undefined;
  respawn: (() => void) | undefined;
  /** A tank's hull and look, when not the medium tank's. */
  hull: HullSpec | undefined;
  look: TankLook | undefined;
  /** A thin body, such as a crate, that a piercing shell goes clean through. */
  thin: boolean;
  /** Height of the body's top in pixels, which a lobbed shell must clear to fly over it. */
  top: number;
  /** Seconds a tank thrown by a blast still flies, of how long it flies in all. */
  airborne: { left: number; total: number } | undefined;
  /** Angle the barrels of a gatling turret have turned. */
  spin: number;
};

/** A piece of armor or a turret flying off without physics, fading at the end of its life. */
type Debris = {
  field?: DamageField;
  slot?: number;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  spin: number;
  age: number;
  life: number;
  color: readonly number[];
  /** Look of a turret flying off, one of the renderer's `TURRET_*`. */
  turret?: number;
};

/** A shell in flight. */
type Shell = {
  id: number;
  shooter: Tank;
  team: string | undefined;
  spec: ShellSpec;
  x: number;
  y: number;
  /** Unit direction of flight. */
  direction: Point;
  /** Speed over the ground in pixels per second, which bounces of a lobbed shell cut. */
  speed: number;
  /** Pixels the shell may still fly. */
  remaining: number;
  /** Ricochets and bounces so far; before the first, the shell passes through its own tank. */
  bounces: number;
  /** Tank armor in pixels it may still punch through, and thin bodies it may still go through. */
  pierce: { armor: number; thin: number };
  /** Height and vertical motion of a lobbed shell. */
  lob: LobState | undefined;
  /** Fired by a gun, not thrown out by a blast. */
  primary: boolean;
  /** The muzzle, each ricochet so far and, once it stops, where it ended. */
  path: Point[];
  /** How far the current leg, from the muzzle or the last ricochet, has come and is likely to reach. */
  leg: { travelled: number; length: number };
  /** Drift of the trail point last laid, which the next segment starts from. */
  drift: Point;
};

const STOP = { x: 0, y: 0 };
/** The medium tank's turret, with its muzzle 30 px out, the look of tanks spawned without one. */
const MEDIUM_LOOK: TankLook = { turret: TURRET_MEDIUM, muzzle: 30 };
const WRECK_FIRE_SPREAD = 10;
const WRECK_FIRE_LIFE = 12;
const WRECK_FIRE_LIGHT = 140;
const TANK_MASS = 1;
const CRATE_MASS = 10;
const SHOT_RANGE = 1000;
/**
 * A hitscan hit chips a 2.3 px hole; its impulse of 300 shoves a 1-mass hull about 10 px against
 * its damping.
 */
const HITSCAN_HIT = { hole: 2.3, depth: 0, knockback: 300 };
/** Hole of a medium tank's shell, the blow that chips a wall material's full crater. */
const SHELL_HOLE = 4.5;
/**
 * A shot passes over rubble for this many pixels past the muzzle, about the depth of a heap, so a
 * tank right behind rubble shoots over it, while shots from farther away meet it. The muzzle is
 * `BARREL` px from a hull's center.
 */
const OVER_RUBBLE = 64;
const BARREL = 30;
/** Share of a hit's impulse applied again at the hit point, which turns the body a little. */
const KNOCKBACK_SPIN_SHARE = 1 / 15;
const RECOIL = 25;
/** Shots meeting armor at more than about 65 degrees from its normal bounce off. */
const RICOCHET_COS = 0.42;
const RICOCHET_PUSH = 90;
const MAX_RICOCHETS = 2;
const TRAIL_SPACING = 15;
const TRAIL_LIFETIME = 2;
const TRAIL_WIDTH = 5;
const MUZZLE_LIGHT = 140;
const MUZZLE_GLARE = 70;
/** The flash leaves the barrel at turret height, a little above the turret so its own barrel shades the tank. */
const MUZZLE_HEIGHT = 11;
const IMPACT_HEIGHT = 5;
const EXPLOSION_HEIGHT = 16;
const CORE_LIGHT = 32;
/** Below the hull's height, so an open core lights only what its hole looks onto. */
const CORE_HEIGHT = 3;
const HULL_HEIGHT = 6;
const CRATE_HEIGHT = 8;
/** A tank's top, its turret included, which a lobbed shell must clear to fly over it. */
const TANK_TOP = 12;
const CASEMATE_HEIGHT = 9;
const DEBRIS_HEIGHT = 2;
const MUZZLE_LIGHT_LIFE = 0.16;
const MUZZLE_LIGHT_SPEED = 1100;
const IMPACT_LIGHT = 45;
const EXPLOSION_LIGHT = 260;
const BARREL_KICK = 3;
const BARREL_RETURN = 14;
const MUZZLE_SHAKE = 1.2;
const EXPLOSION_SHAKE = 6;
const BLAST_SHAKE = 3.5;
const LANDING_SHAKE = 1.5;
/** Share of a blast's full effect, by nearness, from which it destroys an open core it reaches through the hole. */
const CORE_BLAST = 0.75;
/**
 * A blast that would give a tank more than `LIFT_SPEED` px/s throws it into the air for
 * `MIN_AIR_TIME` s and `AIR_TIME_PER_SPEED` s more per px/s beyond, up to `MAX_AIR_TIME` s. In the
 * air its damping drops from the ground's 50 to `AIR_DAMPING`, and it rises `AIR_RISE` px per
 * second it flies at the top of its arc.
 */
const LIFT_SPEED = 1100;
const MIN_AIR_TIME = 0.2;
const AIR_TIME_PER_SPEED = 0.0003;
const MAX_AIR_TIME = 0.4;
const AIR_DAMPING = 7;
const AIR_RISE = 90;
/** Shadows of things in the air: a translucent dark copy of their shape on the ground. */
const SHADOW_COLOR = [0.05, 0.05, 0.06];
const SHADOW_ALPHA = 0.32;
/** Khaki, so a grenade stands out on the gray ground and against tanks of either team. */
const GRENADE_COLOR = [0.78, 0.7, 0.36];
/** Radians a grenade turns per second as it tumbles. */
const GRENADE_TUMBLE = 9;
/** Deepest a piercing shell bores through a thin body, and the step it bores in, in pixels. */
const MAX_PUNCH = 140;
const PUNCH_STEP = 1;
/** Thin bodies a piercing shell goes through before it stops in one. */
const MAX_PUNCHES = 2;
/** A piercing round's tunnel opens the core when it passes this close to the core's rim. */
const BORE_REACH = 4;
/** A grenade in flight this close to an enemy hull goes off. */
const PROXIMITY = 8;
const SHAKE_DECAY = 12;
/** Shots and blasts within this many pixels of the camera shake it fully, and beyond `SHAKE_FAR` not at all. */
const SHAKE_NEAR = 200;
const SHAKE_FAR = 700;
/** Approach speed in pixels per second below which a crash leaves no dent. */
const CRASH_SPEED = 110;
const CRASH_DEPTH_PER_SPEED = 0.012;
const MAX_CRASH_DEPTH = 4;
const CRASH_RADIUS = 7;
const MIN_FRAGMENT_CELLS = 6;
const DEBRIS_DRAG = 2.2;
const DEBRIS_FADE = 1;
const RESPAWN_DELAY = 5;
const EXHAUST_RATE = 8 / 1.5;
const EXHAUST_OFFSET = { x: -16, y: -8 };
const FLOOR_COLOR = [0.514, 0.514, 0.514];
const WALL_DUST = [0.35, 0.35, 0.35];
const SPARK_COLOR = [1, 0.9, 0.55, 1];
const FALL_DUST = [0.62, 0.6, 0.56, 1];
const SHELL_COLOR = [1, 0.84, 0.5];
/**
 * Shells fly at hull height, so they cast a small sun shadow; their glow hangs well above them, so
 * the shell's own shadow from it stays short.
 */
const SHELL_HEIGHT = 6;
const SHELL_LIGHT = 34;
const SHELL_LIGHT_HEIGHT = 24;
/** Puffs take their colors from their layer. */
const NO_COLOR = [0, 0, 0, 0];

/** Draw fields of a turret of `style`, one of the renderer's `TURRET_*` looks. */
function turretDraw(style: number) {
  return { kind: KIND_TURRET, ...(TURRET_QUADS[style] ?? TURRET_QUADS[TURRET_MEDIUM]) };
}

/** Uploads the shape of a shell into a field slot it keeps for the renderer's life, ready to draw at any spot. */
function createShellDraw(renderer: Renderer, field: DamageField) {
  const slot = renderer.allocateField();

  if (slot === undefined) {
    throw new Error('The battle ran out of field slots for its shells.');
  }

  renderer.uploadField(slot, field);
  return { draw: fieldDraw(field, slot) };
}

function fieldDraw(field: DamageField, slot: number) {
  return { kind: KIND_FIELD, originX: field.originX, originY: field.originY, cell: field.cell, cols: field.cols, rows: field.rows, slot };
}

/** A field's draw fields enlarged `scale` times about its local origin. */
function scaled<Draw extends { originX: number; originY: number; cell: number }>(draw: Draw, scale: number): Draw {
  return scale === 1 ? draw : { ...draw, originX: draw.originX * scale, originY: draw.originY * scale, cell: draw.cell * scale };
}

/**
 * Where something `height` pixels above the ground point `at` appears to the camera looking down
 * from the renderer's `CAMERA_HEIGHT` over `view`, and how much larger, as the renderer shows smoke.
 */
function seenFrom(view: Point, at: Point, height: number) {
  if (height <= 0) {
    return { x: at.x, y: at.y, scale: 1 };
  }

  const scale = CAMERA_HEIGHT / Math.max(CAMERA_HEIGHT - height, 1);
  return { x: view.x + (at.x - view.x) * scale, y: view.y + (at.y - view.y) * scale, scale };
}

/** Where the sun throws the shadow of something `height` pixels above the ground point `at`. */
function shadowOf(at: Point, height: number) {
  return { x: at.x + SUN.direction.x * height * SUN.shadowLength, y: at.y + SUN.direction.y * height * SUN.shadowLength };
}

/** Moves a fragment's field so its center is the local origin, for debris that spins about it. */
function recenter(fragment: Fragment): DamageField {
  return { ...fragment.field, originX: fragment.field.originX - fragment.centerX, originY: fragment.field.originY - fragment.centerY };
}

/** Blocks of about 2 px for colliders. */
function blockCells(field: DamageField) {
  return Math.max(Math.round(2 / field.cell), 1);
}

/** Share of a crash's dent taken by a body of `mass` against `otherMass`: the lighter body dents more. */
function share(mass: number, otherMass: number) {
  if (!Number.isFinite(otherMass)) {
    return 1.6;
  }

  return Math.min((2 * otherMass) / (mass + otherMass), 1.6);
}

function toLocal(body: RigidBody, point: Point) {
  const center = body.translation();
  return rotateInto(body, { x: point.x - center.x, y: point.y - center.y });
}

function toWorld(body: RigidBody, local: Point) {
  const center = body.translation();
  const angle = body.rotation();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: center.x + local.x * cos - local.y * sin, y: center.y + local.x * sin + local.y * cos };
}

/** Rotates a local vector of `body` into world axes. */
function rotateOut(body: RigidBody, vector: Point) {
  const angle = body.rotation();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

/** Rotates a world vector into `body`'s local axes. */
function rotateInto(body: RigidBody, vector: Point) {
  const angle = body.rotation();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos + vector.y * sin, y: -vector.x * sin + vector.y * cos };
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

/** Converts a 0xRRGGBB color to components 0-1. */
function rgb(color: number) {
  return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
}
