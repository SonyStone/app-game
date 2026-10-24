import { createTank, driveTank, muzzleOf, type Tank } from '../arena/bodies';
import { PROP_COLOR } from '../arena/draw';
import type { Collider, Rapier, RigidBody } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { createBurning } from './burning';
import { createCampfire } from './campfire';
import {
  carve,
  dent,
  detachLoosePieces,
  isCoreExposed,
  raycastField,
  scorch,
  solidBoxes,
  surfaceNormal,
  type DamageField,
  type Fragment
} from './field';
import {
  KIND_FIELD,
  KIND_FIELD_OPEN,
  KIND_RECT,
  KIND_TURRET,
  PARTICLE_DUST,
  PARTICLE_FIRE,
  PARTICLE_SMOKE,
  PARTICLE_TRAIL,
  PARTICLE_SPARK,
  type createRangeRenderer
} from './renderer';
import { createCrateField, createHullField, createShellField, HULL_CORE } from './shapes';
import { createScrap } from './scrap';
import { createWalls, type Bounds, type Tile } from './walls';
import { createWrecks, type Wrecks } from './wrecks';

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
 * armor cut loose falls off as debris, which lands and stays as scrap (see `./scrap`), and a shot
 * that reaches a tank's core, hidden until a hole opens onto it, blows the tank up and leaves its
 * wreck standing (see `./wrecks`). Shots chip craters into walls of every material but steel until
 * pieces of them fall, and a hard ram bites into them. Crates come back after a few seconds; tanks
 * only when spawned with `respawn`.
 *
 * Any number of tanks can be driven at once: `drive` sets a tank's input until changed, `fire`
 * shoots its gun. Tanks may belong to teams, and without friendly fire shots pass through the
 * shooter's teammates.
 *
 * The battle owns its Rapier bodies and renderer field slots; `reset` rebuilds the crates and
 * removes every tank.
 *
 * @param options.shell - Makes guns fire shells that fly for a while instead of hitscan shots.
 * @param options.friendlyFire - Whether shots hit the shooter's teammates; defaults to `true`.
 * @param options.wreckFire - Seconds a destroyed tank's wreck burns; defaults to 12.
 * @param options.wrecks - Most wrecks of destroyed tanks left standing at once (see `./wrecks`);
 *   defaults to `WRECK_LIMIT`.
 * @param options.random - Source of randomness in [0, 1) for damage and effects, so a test can
 *   seed it; defaults to `Math.random`.
 * @param options.onHit - Called when a shot chips, ricochets off or detonates a tank.
 * @param options.onDestroyed - Called when a tank blows up or loses all its armor, with the tank
 *   whose shot did it, if any. The tank is already out of `tanks`.
 * @param options.onShot - Called for every shot with its path: the muzzle, each ricochet and the end.
 *   A shell reports its path when it stops.
 * @param options.onWallsChanged - Called with the world bounds of a piece of wall or a wreck
 *   that changed shape, appeared, moved or went, during the step or reset that changed it.
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
    wrecks?: number;
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
  const respawns: { at: number; spawn: () => void }[] = [];
  const scrap = createScrap(renderer, {
    random,
    bounds: layout,
    buried: (point) => Math.min(walls.distance(point, BURIED), wrecks.distance(point, BURIED)) < -BURIED
  });
  const walls = createWalls(rapier, world, renderer, layout, {
    random,
    onDebris: addWallDebris,
    onChange: (bounds) => options.onWallsChanged?.(bounds)
  });
  const wrecks = createWrecks(rapier, world, renderer, {
    limit: options.wrecks,
    random,
    wallDistance: (point, cap) => walls.distance(point, cap),
    onDebris: (piece) => scrap.launch({ ...piece, shape: piece.field, spin: between(-6, 6), material: 'metal' }),
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
  // Pairs that crashed this step: two bodies meet over several colliders at once, but crash once.
  const crashes: [Armored | undefined, Armored | undefined][] = [];
  const shells: Shell[] = [];
  const shellDraw = options.shell ? createShellDraw(renderer) : undefined;

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

    /**
     * Scrap on the ground: pieces knocked off armor and walls, and turrets blown off tanks, which
     * landed and stay where they lie (see `./scrap`). `pieces` lists them with their material and
     * area, `near` finds those around a point and `take` picks one up.
     */
    get scrap() {
      return { pieces: scrap.pieces, near: scrap.near, take: scrap.take, chunks: scrap.chunks, flying: scrap.flying };
    },

    /**
     * Wrecks of destroyed tanks standing on the field (see `./wrecks`): `list` tells where each is
     * and how much armor it has left, `made` how many were left in all, and `take` takes one away whole.
     */
    get wrecks(): Pick<Wrecks, 'list' | 'made' | 'take'> {
      return { list: wrecks.list, made: wrecks.made, take: wrecks.take };
    },

    /** Centers of every crate in play, with their headings. */
    get crates() {
      return armored.flatMap((body) => (body.tank ? [] : [{ ...body.body.translation(), rotation: body.body.rotation() }]));
    },

    /**
     * Shells in flight: an id unique within the battle, where each is, the unit direction it flies
     * in, its speed, and the tank that fired it with that tank's team.
     */
    get shells() {
      return shells.map((shell) => ({
        id: shell.id,
        x: shell.x,
        y: shell.y,
        direction: shell.direction,
        speed: options.shell?.speed ?? 0,
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
     *   A wreck standing on that spot falls apart as the tank comes.
     */
    spawnTank(placement: Placement, tank: { color: number; team?: string; pullSpeed?: number; respawn?: boolean }) {
      return spawnTank(placement, tank);
    },

    /** The armor field of `tank`, live; `undefined` once the tank is destroyed. */
    armorOf(tank: Tank) {
      return byTank.get(tank)?.field;
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
        if (body.tank) {
          driveTank(body.tank, body.move);
        }

        body.before = { velocity: body.body.linvel(), spin: body.body.angvel() };
      }

      wrecks.step(dt);
      world.step(events);
      crashes.length = 0;
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
      wrecks.refresh();

      for (const respawn of respawns.filter((item) => item.at <= clock)) {
        respawns.splice(respawns.indexOf(respawn), 1);
        respawn.spawn();
      }
    },

    /**
     * Fires `tank`'s gun along its turret, with recoil: a hitscan shot, or a shell when the battle
     * has `options.shell`. The shot chips the first armor it meets, knocking the body back, or
     * detonates a core; at a glancing angle it ricochets and flies on. Reload is up to the caller.
     */
    fire(tank: Tank) {
      if (options.shell) {
        launchShell(tank, options.shell);
      } else {
        fire(tank);
      }
    },

    /**
     * Whether a straight line from `from` to `to` is clear of walls, wrecks and crates. Tanks never
     * block it, and neither do holes shot through a crate, nor rubble within the reach of a tank's
     * gun of `from`: a tank sees and shoots over rubble right in front of it.
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
     * Distance from `point` to the nearest wall, wreck, the border or a campfire's stones as they
     * stand now, negative inside one; at most `cap`. Tanks and crates are not obstacles here.
     */
    obstacleDistance(point: Point, cap: number) {
      return Math.min(walls.distance(point, cap), wrecks.distance(point, cap));
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
      scrap.update(dt);
      wrecks.update(dt);

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
     */
    draw(view: Point, underlay?: () => void) {
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

      scrap.draw();
      walls.draw();
      wrecks.draw();

      for (const body of armored) {
        const position = body.body.translation();
        renderer.addBody({
          ...fieldDraw(body.field, body.slot),
          kind: body.coreOpen ? KIND_FIELD_OPEN : KIND_FIELD,
          height: body.tank ? HULL_HEIGHT : CRATE_HEIGHT,
          x: position.x,
          y: position.y,
          angle: body.body.rotation(),
          color: rgb(body.color),
          flash: body.flash
        });
      }

      for (const body of armored) {
        if (body.tank) {
          const position = body.body.translation();
          const angle = body.tank.turretAngle;
          const kick = body.barrelKick;
          renderer.addBody({
            ...TURRET_DRAW,
            x: position.x - Math.cos(angle) * kick,
            y: position.y - Math.sin(angle) * kick,
            angle,
            color: rgb(body.color),
            flash: body.flash
          });
        }
      }

      // Shells cast a shadow of their own and glow on what they pass.
      for (const shell of shellDraw ? shells : []) {
        renderer.addBody({ ...shellDraw!.draw, x: shell.x, y: shell.y, angle: Math.atan2(shell.direction.y, shell.direction.x), color: SHELL_COLOR, height: SHELL_HEIGHT });
        renderer.addLight(shell.x, shell.y, SHELL_LIGHT, 0.5, [1, 0.75, 0.4], SHELL_LIGHT_HEIGHT);
      }

      burning.draw();

      for (const light of flashes) {
        const fade = 1 - light.age / light.life;
        renderer.addLight(light.x, light.y, light.radius * (0.6 + 0.4 * fade), light.intensity * fade * fade, light.color, light.height);
      }

      // An open core glows; the hull around it is taller than the light, so it only shines out through the hole.
      for (const body of armored) {
        if (body.coreOpen) {
          const core = toWorld(body.body, HULL_CORE);
          const pulse = 0.75 + 0.25 * Math.sin(clock * 9 + body.slot);
          renderer.addLight(core.x, core.y, CORE_LIGHT, pulse, [1, 0.5, 0.15], CORE_HEIGHT);
        }
      }
    },

    /**
     * Removes every tank, crate, wreck and piece of scrap, cancels pending respawns, mends the walls
     * and puts the layout's crates back.
     */
    reset() {
      for (const body of [...armored]) {
        remove(body);
      }

      scrap.reset();
      wrecks.reset();
      walls.reset();

      respawns.length = 0;
      shells.length = 0;
      layout.crates?.forEach((placement) => spawnCrate(placement));
    }
  };

  function spawnTank(placement: Placement, options: { color: number; team?: string; pullSpeed?: number; respawn?: boolean }) {
    wrecks.clear(placement, SPAWN_CLEAR);
    const tank = createTank(rapier, world, placement, options.color, options.pullSpeed);
    // A hard hit throws a hull at hundreds of pixels a second; without continuous collision
    // detection it would sink into a wall within a step and stick there.
    tank.hull.enableCcd(true);
    tank.turretAngle = placement.turret ?? placement.rotation;
    const field = createHullField();
    const respawn = options.respawn ? () => spawnTank(placement, options) : undefined;
    register(tank.hull, field, options.color, TANK_MASS, respawn, tank, options.team);

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

    register(body, createCrateField(), PROP_COLOR, CRATE_MASS, () => spawnCrate(placement));
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
    const slot = renderer.allocateField() ?? scrap.reclaimSlot();

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
      rammedAt: -Infinity,
      respawn
    };
    armored.push(entry);

    if (tank) {
      byTank.set(tank, entry);
    }

    refreshShape(entry);

    return entry;
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

  /**
   * Dents both bodies of a new contact in proportion to how fast they met. A body that crashes
   * into something that does not move rams it instead (see `ramWall`).
   */
  function crash(firstHandle: number, secondHandle: number) {
    const first = owners.get(firstHandle);
    const second = owners.get(secondHandle);

    if ((!first && !second) || crashes.some(([a, b]) => (a === first && b === second) || (a === second && b === first))) {
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

    if (speed < (first && second ? CRASH_SPEED : RAM_SPEED)) {
      return;
    }

    crashes.push([first, second]);

    if (first && second) {
      const firstMass = first.body.mass();
      const secondMass = second.body.mass();
      const depth = (speed - CRASH_SPEED) * CRASH_DEPTH_PER_SPEED;
      dentAt(first, point, { x: -normal.x, y: -normal.y }, depth * share(firstMass, secondMass));
      dentAt(second, point, normal, depth * share(secondMass, firstMass));
    } else {
      ramWall(first ? secondHandle : firstHandle, (first ?? second)!, point, first ? normal : { x: -normal.x, y: -normal.y }, speed);
    }

    for (let index = 0; index < Math.min(Math.round(speed / 60), 8); index++) {
      const angle = Math.atan2(normal.y, normal.x) + Math.PI / 2 + between(-0.6, 0.6) + (index % 2) * Math.PI;
      const sparkSpeed = between(80, 220);
      renderer.spawn(PARTICLE_SPARK, point.x, point.y, Math.cos(angle) * sparkSpeed, Math.sin(angle) * sparkSpeed, between(0.1, 0.25), 2, SPARK_COLOR);
    }
  }

  /**
   * A body that crashed at `speed` into something tanks cannot push. A tank driving into it nose
   * first rams it: the blow, its approach speed above `RAM_SPEED`, up to a tank's top speed, times its mass,
   * dents its armor, less against a softer wall, bites into a breakable wall and may shove a wreck,
   * which throws up dust of their material. A tank rams once per run-up: contacts within
   * `RAM_COOLDOWN` s of its last ram leave no mark. A body thrown against it, by a hit or a crash,
   * or brushing it with a corner or a side, only dents, as two bodies do when they crash.
   *
   * @param direction - Unit direction from the rammer into what it hit.
   */
  function ramWall(handle: number, rammer: Armored, point: Point, direction: Point, speed: number) {
    // A body thrown against a wall, by a hit or by another, or brushing it with a corner or a side
    // as it turns, only dents, as in a crash of two bodies.
    const heading = rammer.body.rotation();
    const nose = toLocal(rammer.body, point).x > RAM_NOSE;
    const facing = Math.cos(heading) * direction.x + Math.sin(heading) * direction.y > RAM_FACING;

    if (!nose || !facing || rammer.move.x * direction.x + rammer.move.y * direction.y < RAM_AIM) {
      if (speed >= CRASH_SPEED) {
        dentAt(rammer, point, { x: -direction.x, y: -direction.y }, (speed - CRASH_SPEED) * CRASH_DEPTH_PER_SPEED * THROWN_SHARE);
      }

      return;
    }

    // Pressing on into a wall that just gave way is not another ram.
    if (clock - rammer.rammedAt < RAM_COOLDOWN) {
      return;
    }

    rammer.rammedAt = clock;
    const at = rammer.body.translation();
    const blow = (Math.min(speed, RAM_TOP_SPEED) - RAM_SPEED) * rammer.body.mass();
    const material = walls.ram(handle, { field: rammer.field, x: at.x, y: at.y, angle: rammer.body.rotation() }, direction, blow);
    const wreck = material ? undefined : wrecks.ram(handle, point, direction, blow);
    const dust = material?.color ?? wreck?.color;
    dentAt(rammer, point, { x: -direction.x, y: -direction.y }, blow * RAM_DENT * (material?.ram.hardness ?? wreck?.hardness ?? 1));

    if (dust) {
      spawnDust(point, direction, dust.map((channel) => channel * 0.6));
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
    let start = muzzleOf(tank);
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
   * What a shot does where it meets something: it chips a wall or a wreck, detonates a core,
   * chips armor met head on, or glances off armor and flies on.
   *
   * @param canBounce - Whether the shot may fly on after a glancing hit; a spent one only scuffs the armor.
   * @returns Where and in which direction a ricochet flies on, or `undefined` when the shot stops here.
   */
  function strike(
    hit: ReturnType<typeof castShot>,
    end: Point,
    direction: Point,
    tank: Tank,
    blow: Pick<ShellSpec, 'hole' | 'depth' | 'knockback'>,
    canBounce: boolean
  ) {
    if (hit.wreck) {
      wrecks.chip(hit.wreck, end, direction, blow);
      impact(end, { x: -direction.x, y: -direction.y });
      spawnDust(end, direction, hit.wreck.color);
      return undefined;
    }

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

    const normal = worldNormal(hit.target, end);

    if (!normal || -(direction.x * normal.x + direction.y * normal.y) > RICOCHET_COS) {
      impact(end, { x: -direction.x, y: -direction.y });
      damage(hit.target, end, direction, blow);
      reportHit(hit.target, tank, 'armor');
      return undefined;
    }

    const along = direction.x * normal.x + direction.y * normal.y;
    const bounce = { x: direction.x - 2 * along * normal.x, y: direction.y - 2 * along * normal.y };
    ricochet(hit.target, end, normal, bounce);
    reportHit(hit.target, tank, 'ricochet');
    return canBounce ? { direction: bounce, from: { x: end.x + normal.x * 0.5, y: end.y + normal.y * 0.5 } } : undefined;
  }

  /** Fires a shell from `tank`'s muzzle along its turret. */
  function launchShell(tank: Tank, spec: ShellSpec) {
    const shooter = byTank.get(tank);
    const start = muzzleOf(tank);
    const direction = { x: Math.cos(tank.turretAngle), y: Math.sin(tank.turretAngle) };
    const shell: Shell = {
      id: shellId++,
      shooter: tank,
      team: shooter?.team,
      x: start.x,
      y: start.y,
      direction,
      remaining: spec.range,
      bounces: 0,
      path: [start],
      leg: { travelled: 0, length: 0 },
      drift: { x: 0, y: 0 }
    };

    shooter?.body.applyImpulse({ x: -direction.x * RECOIL, y: -direction.y * RECOIL }, true);
    muzzleBlast(start, direction, shooter, undefined);
    shell.leg.length = expectedLeg(shell);
    shells.push(shell);
  }

  /**
   * Moves a shell along its flight for `dt` seconds: it strikes the first thing in its way, flies
   * on after a ricochet with the range it has left, and falls once the range is spent.
   */
  function flyShell(shell: Shell, dt: number) {
    const spec = options.shell!;
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
      const bounced = strike(hit, end, shell.direction, shell.shooter, spec, shell.bounces < MAX_RICOCHETS);

      if (!bounced) {
        stopShell(shell);
        return;
      }

      shell.bounces++;
      shell.direction = bounced.direction;
      // The bounce starts a hair off the surface; that hair counts against the range too.
      shell.remaining = Math.max(shell.remaining - Math.hypot(bounced.from.x - end.x, bounced.from.y - end.y), 0);
      shell.x = bounced.from.x;
      shell.y = bounced.from.y;
      shell.drift = { x: 0, y: 0 };
      shell.leg = { travelled: 0, length: 0 };
      shell.leg.length = expectedLeg(shell);
    }

    if (shell.remaining <= 1e-6) {
      fall(shell);
    }
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

  /** Pixels ahead of a shell over which it still passes over rubble: the first few after the muzzle. */
  function overRubble(shell: Shell) {
    return Math.max(OVER_RUBBLE - (options.shell!.range - shell.remaining), 0);
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

  /** A spent shell drops to the ground in a puff of dust. */
  function fall(shell: Shell) {
    const at = { x: shell.x, y: shell.y };

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
    options.onShot?.(shell.shooter, shell.path);
  }

  function reportHit(body: Armored, shooter: Tank, part: 'armor' | 'core' | 'ricochet') {
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
   * Finds the first armor, core, wreck, wall or rubble within `maxDistance` along a ray, skipping
   * bodies for which `skip` returns true.
   *
   * @param overRubble - Pixels from the start over which the ray passes over rubble.
   */
  function castShot(start: Point, direction: Point, skip: (body: Armored) => boolean, maxDistance: number, overRubble = 0) {
    let best: { distance: number; target?: Armored; part?: 'armor' | 'core'; tile?: Tile; wreck?: WreckHit } = { distance: maxDistance };

    for (const body of armored) {
      if (skip(body)) {
        continue;
      }

      const hit = raycastField(body.field, toLocal(body.body, start), rotateInto(body.body, direction), best.distance);

      if (hit && hit.distance < best.distance) {
        best = { distance: hit.distance, target: body, part: hit.part };
      }
    }

    const wreck = wrecks.cast(start, direction, best.distance);

    if (wreck) {
      best = { distance: wreck.distance, wreck: wreck.wreck };
    }

    const wall = walls.cast(start, direction, best.distance, overRubble);

    return wall ? { distance: wall.distance, tile: wall.tile } : best;
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
   */
  function muzzleBlast(at: Point, direction: Point, shooter: Armored | undefined, reach: number | undefined) {
    const across = { x: -direction.y, y: direction.x };
    // A brief flash at the muzzle lights the tank itself, so its turret shades the hull.
    flash(at.x + direction.x * 2, at.y + direction.y * 2, MUZZLE_GLARE, 0.07, 1, [1, 0.8, 0.5], MUZZLE_HEIGHT);

    // The main light rides out of the barrel after the shot, fading as it goes.
    flash(at.x + direction.x * 3, at.y + direction.y * 3, MUZZLE_LIGHT, MUZZLE_LIGHT_LIFE, 1, [1, 0.72, 0.38], MUZZLE_HEIGHT, {
      x: direction.x * MUZZLE_LIGHT_SPEED,
      y: direction.y * MUZZLE_LIGHT_SPEED,
      distance: Math.max((reach ?? 0) - 3, 0)
    });

    for (let index = 0; index < 10; index++) {
      const angle = Math.atan2(direction.y, direction.x) + between(-0.3, 0.3);
      const speed = between(80, 280);
      const ahead = between(2, 10);
      renderer.spawn(PARTICLE_FIRE, at.x + direction.x * ahead, at.y + direction.y * ahead, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.1, 0.18), between(3.5, 6), NO_COLOR);
    }

    for (const side of [-1, 1]) {
      const speed = between(60, 120);
      const vx = (across.x * side * 0.9 + direction.x * 0.4) * speed;
      const vy = (across.y * side * 0.9 + direction.y * 0.4) * speed;
      renderer.spawn(PARTICLE_FIRE, at.x, at.y, vx, vy, between(0.06, 0.1), between(1.5, 2.2), NO_COLOR);
    }

    for (let index = 0; index < 6; index++) {
      const angle = Math.atan2(direction.y, direction.x) + between(-0.7, 0.7);
      const speed = between(15, 70);
      const ahead = between(4, 14);
      renderer.spawn(PARTICLE_SMOKE, at.x + direction.x * ahead, at.y + direction.y * ahead, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.5, 0.9), between(2, 3.5), NO_COLOR);
    }

    for (let index = 0; index < 4; index++) {
      const angle = Math.atan2(direction.y, direction.x) + between(-0.25, 0.25);
      const speed = between(300, 550);
      renderer.spawn(PARTICLE_SPARK, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, between(0.08, 0.18), 2, SPARK_COLOR);
    }

    if (shooter) {
      shooter.barrelKick = BARREL_KICK;
    }

    shakeFrom(at, MUZZLE_SHAKE);
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

  /**
   * Blows a tank up from its core: light, fire, smoke, the turret thrown off, and the hull left
   * standing as a burning wreck, torn open around the core.
   */
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

    if (body.tank) {
      const angle = between(0, Math.PI * 2);
      scrap.launch({
        shape: 'turret',
        x: center.x,
        y: center.y,
        angle: body.tank.turretAngle,
        vx: velocity.x + Math.cos(angle) * 90 + direction.x * 60,
        vy: velocity.y + Math.sin(angle) * 90 + direction.y * 60,
        spin: between(-12, 12),
        color: rgb(body.color),
        material: 'metal'
      });
    }

    // The wreck burns where it stood until it burns out.
    burning.ignite(center, WRECK_FIRE_SPREAD, options.wreckFire ?? WRECK_FIRE_LIFE, WRECK_FIRE_LIGHT, 0.5);

    const at = { x: center.x, y: center.y, angle: body.body.rotation() };
    remove(body);
    wrecks.add({ field: body.field, ...at, color: rgb(body.color), team: body.team, core: HULL_CORE, direction });
    scheduleRespawn(body);
    reportDestroyed(body);
  }

  /** Sends a piece knocked out of a wall flying; it lands and stays as scrap. */
  function addWallDebris(piece: Parameters<Parameters<typeof createWalls>[4]['onDebris']>[0]) {
    scrap.launch({ ...piece, shape: piece.field, spin: between(-5, 5) });
  }

  /** Sends a cut-off piece of armor flying away from `from`'s center; it lands and stays as scrap. */
  function launchFragment(from: Armored, fragment: Fragment, at: Point, speed: number, push?: Point) {
    const center = from.body.translation();
    const velocity = from.body.linvel();
    const away = normalize({ x: at.x - center.x, y: at.y - center.y });
    const kick = between(0.4, 1) * speed;
    scrap.launch({
      shape: recenter(fragment),
      x: at.x,
      y: at.y,
      angle: from.body.rotation(),
      vx: velocity.x + away.x * kick + (push?.x ?? 0) * 60,
      vy: velocity.y + away.y * kick + (push?.y ?? 0) * 60,
      spin: between(-8, 8),
      color: rgb(from.color),
      material: 'metal'
    });
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
  /** Battle time of the body's last ram into something that does not move. */
  rammedAt: number;
  respawn: (() => void) | undefined;
};

/** A wreck a shot met. */
type WreckHit = NonNullable<ReturnType<Wrecks['cast']>>['wreck'];

/** A shell in flight. */
type Shell = {
  id: number;
  shooter: Tank;
  team: string | undefined;
  x: number;
  y: number;
  /** Unit direction of flight. */
  direction: Point;
  /** Pixels the shell may still fly. */
  remaining: number;
  /** Ricochets so far; before the first, the shell passes through its own tank. */
  bounces: number;
  /** The muzzle, each ricochet so far and, once it stops, where it ended. */
  path: Point[];
  /** How far the current leg, from the muzzle or the last ricochet, has come and is likely to reach. */
  leg: { travelled: number; length: number };
  /** Drift of the trail point last laid, which the next segment starts from. */
  drift: Point;
};

const STOP = { x: 0, y: 0 };
/** A piece of scrap landing this many pixels inside a wall or a wreck is buried and gone. */
const BURIED = 3;
/** A tank coming back to its spot lets any wreck this close to it fall apart. */
const SPAWN_CLEAR = 45;
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
const MUZZLE_LIGHT_LIFE = 0.16;
const MUZZLE_LIGHT_SPEED = 1100;
const IMPACT_LIGHT = 45;
const EXPLOSION_LIGHT = 260;
const BARREL_KICK = 3;
const BARREL_RETURN = 14;
const MUZZLE_SHAKE = 1.2;
const EXPLOSION_SHAKE = 6;
const SHAKE_DECAY = 12;
/** Shots and blasts within this many pixels of the camera shake it fully, and beyond `SHAKE_FAR` not at all. */
const SHAKE_NEAR = 200;
const SHAKE_FAR = 700;
/**
 * Approach speed in pixels per second below which a crash of two bodies leaves no dent. Speeds
 * here are as Rapier reports them, after the hull's damping: a hull moving at 250 px/s reads 136.
 */
const CRASH_SPEED = 110;
const CRASH_DEPTH_PER_SPEED = 0.012;
/**
 * Approach speed, as Rapier reports it, below which a crash into something that does not move
 * leaves no mark: about half a tank's top speed. Above it each unit of blow dents the rammer by
 * `RAM_DENT` px against steel, so a ram at full speed dents a medium tank's nose by about 3.5 px.
 */
const RAM_SPEED = 70;
const RAM_DENT = 0.055;
const RAM_COOLDOWN = 0.5;
/**
 * A tank rams only while it drives into the wall, its drive input at most about 50 degrees off the
 * contact's normal, and no harder than at `RAM_TOP_SPEED`, a little over a medium tank's top speed,
 * however hard a hit threw it. Thrown against something that does not move, a body dents
 * `THROWN_SHARE` times as deep as in a crash with another body.
 */
const RAM_AIM = 0.6;
/**
 * A ram strikes with the nose: the contact lies more than `RAM_NOSE` px ahead of the hull's center
 * and the hull faces within about 30 degrees of the contact's normal.
 */
const RAM_NOSE = 8;
const RAM_FACING = 0.86;
const RAM_TOP_SPEED = 150;
const THROWN_SHARE = 1.6;
const MAX_CRASH_DEPTH = 4;
const CRASH_RADIUS = 7;
const MIN_FRAGMENT_CELLS = 6;
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

/** Draw fields of a turret: a quad from (-11, -11) to (31, 11) in turret coordinates. */
const TURRET_DRAW = { kind: KIND_TURRET, originX: -10.5, originY: -10.5, cell: 1, cols: 42, rows: 22 };

/** Uploads the shape of a shell into a field slot it keeps for the renderer's life, ready to draw at any spot. */
function createShellDraw(renderer: Renderer) {
  const field = createShellField();
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
