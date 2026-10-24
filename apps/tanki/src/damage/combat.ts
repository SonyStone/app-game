import { createTank, driveTank, muzzleOf, type Tank } from '../arena/bodies';
import { PROP_COLOR } from '../arena/draw';
import type { Collider, Rapier, RigidBody } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { createBurning } from './burning';
import { createCampfire } from './campfire';
import {
  carve,
  createField,
  dent,
  detachLoosePieces,
  FAR,
  isCoreExposed,
  raycastField,
  scorch,
  shatter,
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
  SLOT_CELLS,
  type createRangeRenderer
} from './renderer';
import { createCrateField, createHullField, createShellField, HULL_CORE } from './shapes';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/** A position and heading on the battlefield; `turret` defaults to the heading. */
export type Placement = { x: number; y: number; rotation: number; turret?: number };

/** A fixed concrete wall: a box around its center, turned by `rotation`, that stops tanks and shots. */
export type WallPlacement = { x: number; y: number; halfWidth: number; halfHeight: number; rotation?: number };

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
 * Static layout of a battlefield in pixels around the origin: a walled floor, concrete walls,
 * crates and campfires. Tanks are spawned separately with `spawnTank`.
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
 * field, on a walled floor with concrete walls. Shots chip holes, dent the armor and knock bodies
 * back; shots that meet armor at a glancing angle ricochet. Crashes dent both bodies, armor cut
 * loose falls off as debris, and a shot that reaches a tank's core, hidden until a hole opens onto
 * it, blows the tank apart. Crates come back after a few seconds; tanks only when spawned with
 * `respawn`.
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
 * @param options.random - Source of randomness in [0, 1) for damage and effects, so a test can
 *   seed it; defaults to `Math.random`.
 * @param options.onHit - Called when a shot chips, ricochets off or detonates a tank.
 * @param options.onDestroyed - Called when a tank blows up or loses all its armor, with the tank
 *   whose shot did it, if any. The tank is already out of `tanks`.
 * @param options.onShot - Called for every shot with its path: the muzzle, each ricochet and the end.
 *   A shell reports its path when it stops.
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
  const walls = createWalls(rapier, world, layout);
  const wallDraws = createWallDraws(renderer, layout.walls ?? []);
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
     * Whether a straight line from `from` to `to` is clear of walls and crates. Tanks never block
     * it, and neither do holes shot through a crate.
     */
    lineOfSight(from: Point, to: Point) {
      const length = Math.hypot(to.x - from.x, to.y - from.y);

      if (length < 1e-6) {
        return true;
      }

      const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
      return castShot(from, direction, (body) => body.tank !== undefined, length).distance >= length;
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

    /**
     * Chips `tank`'s armor where `point` lies on or in it, as a shot flying along `direction`
     * would: a hole of `blow.hole` px reaching `blow.depth` px inward, a slight dent and a knock
     * back of `blow.knockback`. Nothing happens to a destroyed tank.
     */
    chip(tank: Tank, point: Point, direction: Point, blow: Pick<ShellSpec, 'hole' | 'depth' | 'knockback'>) {
      const body = byTank.get(tank);

      if (body) {
        damage(body, point, direction, blow);
      }
    },

    /**
     * Blows `tank` up from its core, as a shot reaching the core does, throwing its pieces along
     * `direction`, and credits `killer` in `onDestroyed`. Nothing happens to a destroyed tank.
     */
    detonate(tank: Tank, direction: Point, killer?: Tank) {
      const body = byTank.get(tank);

      if (body) {
        body.lastShooter = killer;
        destroy(body, direction);
      }
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

      for (const piece of debris) {
        const alpha = Math.min((piece.life - piece.age) / DEBRIS_FADE, 1);

        if (piece.field && piece.slot !== undefined) {
          renderer.addBody({ ...fieldDraw(piece.field, piece.slot), x: piece.x, y: piece.y, angle: piece.angle, color: piece.color, alpha, height: DEBRIS_HEIGHT });
        } else {
          renderer.addBody({ ...TURRET_DRAW, x: piece.x, y: piece.y, angle: piece.angle, color: piece.color, alpha });
        }
      }

      for (const wall of wallDraws) {
        renderer.addBody(wall);
      }

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

    /** Removes every tank, crate and debris piece, cancels pending respawns and puts the layout's crates back. */
    reset() {
      for (const body of [...armored]) {
        remove(body);
      }

      for (const piece of debris.splice(0)) {
        if (piece.slot !== undefined) {
          renderer.releaseField(piece.slot);
        }
      }

      respawns.length = 0;
      shells.length = 0;
      layout.crates?.forEach((placement) => spawnCrate(placement));
    }
  };

  function spawnTank(placement: Placement, options: { color: number; team?: string; pullSpeed?: number; respawn?: boolean }) {
    const tank = createTank(rapier, world, placement, options.color, options.pullSpeed);
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
      respawn
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
    let start = muzzleOf(tank);
    let direction = { x: Math.cos(tank.turretAngle), y: Math.sin(tank.turretAngle) };
    let remaining = SHOT_RANGE;
    const path = [start];
    const passes = (body: Armored, first: boolean) => (first && body === shooter) || passesAsTeammate(shooter?.team, shooter, body);

    shooter?.body.applyImpulse({ x: -direction.x * RECOIL, y: -direction.y * RECOIL }, true);
    muzzleBlast(start, direction, shooter, castShot(start, direction, (body) => passes(body, true), SHOT_RANGE).distance);

    for (let bounce = 0; bounce <= MAX_RICOCHETS; bounce++) {
      const hit = castShot(start, direction, (body) => passes(body, bounce === 0), remaining);
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
   * met head on, or glances off armor and flies on.
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
    if (!hit.target) {
      impact(end, { x: -direction.x, y: -direction.y });
      spawnDust(end, direction, WALL_DUST);
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
      const hit = castShot(from, shell.direction, (body) => passesShell(shell, body), step);
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
    const distance = castShot({ x: shell.x, y: shell.y }, shell.direction, (body) => passesShell(shell, body), shell.remaining).distance;
    return Math.max(distance, 1);
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
   * Finds the first armor, core or wall within `maxDistance` along a ray, skipping bodies for
   * which `skip` returns true.
   */
  function castShot(start: Point, direction: Point, skip: (body: Armored) => boolean, maxDistance: number) {
    let best: { distance: number; target?: Armored; part?: 'armor' | 'core' } = { distance: maxDistance };

    for (const body of armored) {
      if (skip(body)) {
        continue;
      }

      const hit = raycastField(body.field, toLocal(body.body, start), rotateInto(body.body, direction), best.distance);

      if (hit && hit.distance < best.distance) {
        best = { distance: hit.distance, target: body, part: hit.part };
      }
    }

    const wall = world.castRay(
      new rapier.Ray(start, direction),
      best.distance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => collider.parent() === walls
    );

    return wall ? { distance: wall.timeOfImpact } : best;
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
        color: rgb(body.color)
      });
    }

    // The wreck burns where it stood until it burns out.
    burning.ignite(center, WRECK_FIRE_SPREAD, options.wreckFire ?? WRECK_FIRE_LIFE, WRECK_FIRE_LIGHT, 0.5);

    remove(body);
    scheduleRespawn(body);
    reportDestroyed(body);
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
};

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
const WRECK_FIRE_SPREAD = 10;
const WRECK_FIRE_LIFE = 12;
const WRECK_FIRE_LIGHT = 140;
const CAMPFIRE_RADIUS = 13;
const TANK_MASS = 1;
const CRATE_MASS = 10;
const SHOT_RANGE = 1000;
/**
 * A hitscan hit chips a 2.3 px hole; its impulse of 300 shoves a 1-mass hull about 10 px against
 * its damping.
 */
const HITSCAN_HIT = { hole: 2.3, depth: 0, knockback: 300 };
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
/** Walls stand as tall as the tallest shadow caster. */
const WALL_HEIGHT = 10;
const DEBRIS_HEIGHT = 2;
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
const WALL_COLOR = [0.42, 0.42, 0.43];
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

/** Creates the fixed body holding the floor's border walls, the concrete walls and the campfires' stones. */
function createWalls(rapier: Rapier, world: World, layout: CombatLayout) {
  const walls = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const thickness = 40;
  const { halfWidth, halfHeight } = layout;

  for (const [x, y, hw, hh] of [
    [0, -halfHeight - thickness, halfWidth + thickness * 2, thickness],
    [0, halfHeight + thickness, halfWidth + thickness * 2, thickness],
    [-halfWidth - thickness, 0, thickness, halfHeight],
    [halfWidth + thickness, 0, thickness, halfHeight]
  ]) {
    world.createCollider(rapier.ColliderDesc.cuboid(hw, hh).setTranslation(x, y), walls);
  }

  for (const wall of layout.walls ?? []) {
    world.createCollider(
      rapier.ColliderDesc.cuboid(wall.halfWidth, wall.halfHeight)
        .setTranslation(wall.x, wall.y)
        .setRotation(wall.rotation ?? 0),
      walls
    );
  }

  // A campfire's ring of stones stops tanks.
  for (const campfire of layout.campfires ?? []) {
    world.createCollider(rapier.ColliderDesc.ball(CAMPFIRE_RADIUS).setTranslation(campfire.x, campfire.y), walls);
  }

  return walls;
}

/**
 * Builds the drawing of every concrete wall once: a slab with an inset seam, uploaded into a
 * field slot it keeps for the renderer's life.
 */
function createWallDraws(renderer: Renderer, walls: readonly WallPlacement[]) {
  return walls.map((wall) => {
    const field = createWallField(wall.halfWidth, wall.halfHeight);
    const slot = renderer.allocateField();

    if (slot === undefined) {
      throw new Error('The battle ran out of field slots for its walls.');
    }

    renderer.uploadField(slot, field);
    return { ...fieldDraw(field, slot), x: wall.x, y: wall.y, angle: wall.rotation ?? 0, color: WALL_COLOR, height: WALL_HEIGHT };
  });
}

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

/**
 * A concrete slab of the given half size with a seam 3 px inside its edge. Cells grow in half
 * pixels until the slab fits a slot; on a slab as large as a building they grow so coarse that so
 * fine a seam would smear into the outline, so there it lies two cells in and is a little wider.
 */
function createWallField(halfWidth: number, halfHeight: number) {
  const margin = 2;
  const width = (halfWidth + margin) * 2;
  const height = (halfHeight + margin) * 2;
  let cell = 1;

  while (Math.ceil(width / cell) * Math.ceil(height / cell) > SLOT_CELLS) {
    cell += 0.5;
  }

  const inset = Math.max(3, cell * 2);
  const seamWidth = Math.max(0.4, cell * 0.3);

  return createField({ minX: -width / 2, minY: -height / 2, maxX: width / 2, maxY: height / 2 }, cell, (x, y) => {
    const armor = box(x, y, halfWidth, halfHeight);
    const seam = Math.abs(box(x, y, halfWidth - inset, halfHeight - inset)) - seamWidth;
    return [armor, seam, FAR, 0];
  });
}

/** Signed distance to an axis-aligned box of half size `halfX` x `halfY`. */
function box(x: number, y: number, halfX: number, halfY: number) {
  const qx = Math.abs(x) - halfX;
  const qy = Math.abs(y) - halfY;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
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
