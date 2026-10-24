import { createTank, driveTank, muzzleOf, PLAYER_PULL_SPEED, type Tank } from '../arena/bodies';
import { PLAYER_COLOR, PROP_COLOR } from '../arena/draw';
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
  PARTICLE_SOOT,
  PARTICLE_SPARK,
  type createRangeRenderer
} from './renderer';
import { createCrateField, createHullField, HULL_CORE } from './shapes';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/**
 * The damage range: the player's tank among target tanks and crates whose armor is a distance
 * field. Shots chip holes, dent the armor and knock bodies back; shots that meet armor at a
 * glancing angle ricochet. Crashes dent both bodies, armor cut loose falls off as debris, and a
 * shot that reaches a tank's core, hidden until a hole opens onto it, blows the tank apart.
 * Destroyed targets come back after a few seconds.
 *
 * The range owns its Rapier bodies and renderer field slots; `reset` rebuilds everything.
 */
export function createDamageRange(rapier: Rapier, world: World, renderer: Renderer) {
  const events = new rapier.EventQueue(true);
  const owners = new Map<number, Armored>();
  const armored: Armored[] = [];
  const debris: Debris[] = [];
  const respawns: { at: number; spawn: () => void }[] = [];
  const walls = createWalls(rapier, world);
  const burning = createBurning(renderer);
  const campfire = createCampfire(renderer, burning, RANGE.campfire);
  let player = spawnTank(RANGE.player, PLAYER_COLOR, PLAYER_PULL_SPEED);
  let clock = 0;
  let shake = 0;
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

  RANGE.targets.forEach((placement) => spawnTarget(placement));
  RANGE.crates.forEach((placement) => spawnCrate(placement));

  return {
    /** The player's tank, replaced on reset. */
    get player() {
      return player.tank!;
    },

    /** Camera shake in world pixels, from shots and explosions; decays by itself. */
    get shake() {
      return shake;
    },

    /** The armor field of `tank`, live; `undefined` once the tank is destroyed. */
    armorOf(tank: Tank) {
      return armored.find((body) => body.tank === tank)?.field;
    },

    /** Every tank in play, the player's included. */
    get tanks() {
      return armored.flatMap((body) => (body.tank ? [body.tank] : []));
    },

    /**
     * Advances physics by one fixed step: drives the player, steps Rapier, dents bodies that
     * crashed into something and refreshes changed shapes.
     *
     * @param drive - Player's drive direction in world axes, length up to 1.
     */
    step(dt: number, drive: Point) {
      clock += dt;

      for (const body of armored) {
        if (body.tank) {
          driveTank(body.tank, body === player ? drive : STOP);
        }

        body.before = { velocity: body.body.linvel(), spin: body.body.angvel() };
      }

      world.step(events);
      events.drainCollisionEvents((first, second, started) => {
        if (started) {
          crash(first, second);
        }
      });

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
     * Fires `tank`'s gun: a hitscan shot with recoil. It chips the first armor it meets, knocking
     * the body back, or detonates a core; at a glancing angle it ricochets and flies on.
     */
    fire(tank: Tank) {
      const shooter = armored.find((body) => body.tank === tank);
      let start = muzzleOf(tank);
      let direction = { x: Math.cos(tank.turretAngle), y: Math.sin(tank.turretAngle) };
      let remaining = SHOT_RANGE;

      shooter?.body.applyImpulse({ x: -direction.x * RECOIL, y: -direction.y * RECOIL }, true);
      muzzleBlast(start, direction, shooter);

      for (let bounce = 0; bounce <= MAX_RICOCHETS; bounce++) {
        const hit = castShot(start, direction, bounce === 0 ? shooter : undefined, remaining);
        const end = { x: start.x + direction.x * hit.distance, y: start.y + direction.y * hit.distance };
        smokeTrail(start, end);

        if (hit.distance >= remaining) {
          return;
        }

        if (!hit.target) {
          impact(end, { x: -direction.x, y: -direction.y });
          spawnDust(end, direction, WALL_DUST);
          return;
        }

        if (hit.part === 'core') {
          destroy(hit.target, direction);
          return;
        }

        const normal = worldNormal(hit.target, end);

        if (!normal || -(direction.x * normal.x + direction.y * normal.y) > RICOCHET_COS) {
          impact(end, { x: -direction.x, y: -direction.y });
          damage(hit.target, end, direction);
          return;
        }

        const along = direction.x * normal.x + direction.y * normal.y;
        direction = { x: direction.x - 2 * along * normal.x, y: direction.y - 2 * along * normal.y };
        ricochet(hit.target, end, normal, direction);
        start = { x: end.x + normal.x * 0.5, y: end.y + normal.y * 0.5 };
        remaining -= hit.distance;
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
            renderer.spawn(PARTICLE_SOOT, at.x, at.y, random(-6, 6), random(-6, 6), 1.5, random(1.2, 2.2), NO_COLOR);
          }
        }
      }
    },

    /**
     * Queues every body, turret, debris piece, smoke column and light for drawing, bottom to top.
     *
     * @param view - Point on the ground under the camera, for the parallax of rising smoke.
     */
    draw(view: Point) {
      renderer.beginBodies();
      renderer.addBody({
        kind: KIND_RECT,
        x: 0,
        y: 0,
        angle: 0,
        originX: -RANGE.halfWidth + 0.5,
        originY: -RANGE.halfHeight + 0.5,
        cell: 1,
        cols: RANGE.halfWidth * 2,
        rows: RANGE.halfHeight * 2,
        color: FLOOR_COLOR
      });
      campfire.draw();

      for (const piece of debris) {
        const alpha = Math.min((piece.life - piece.age) / DEBRIS_FADE, 1);

        if (piece.field && piece.slot !== undefined) {
          renderer.addBody({ ...fieldDraw(piece.field, piece.slot), x: piece.x, y: piece.y, angle: piece.angle, color: piece.color, alpha, height: DEBRIS_HEIGHT });
        } else {
          renderer.addBody({ ...TURRET_DRAW, x: piece.x, y: piece.y, angle: piece.angle, color: piece.color, alpha });
        }
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

      burning.draw(view);

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

    /** Removes every body and debris piece and builds the range again. */
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
      player = spawnTank(RANGE.player, PLAYER_COLOR, PLAYER_PULL_SPEED);
      RANGE.targets.forEach((placement) => spawnTarget(placement));
      RANGE.crates.forEach((placement) => spawnCrate(placement));
    }
  };

  function spawnTank(placement: Placement, color: number, pullSpeed?: number, respawn?: (placement: Placement) => void) {
    const tank = createTank(rapier, world, placement, color, pullSpeed);
    tank.turretAngle = placement.turret ?? placement.rotation;
    return register(tank.hull, createHullField(), color, TANK_MASS, placement, respawn, tank);
  }

  function spawnTarget(placement: Placement) {
    spawnTank(placement, PROP_COLOR, undefined, spawnTarget);
  }

  function spawnCrate(placement: Placement) {
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(placement.x, placement.y)
        .setRotation(placement.rotation)
        .setLinearDamping(50)
        .setAngularDamping(25)
    );

    return register(body, createCrateField(), PROP_COLOR, CRATE_MASS, placement, spawnCrate);
  }

  /**
   * Gives a body its armor: a field slot, colliders built from the field and an entry in the lookups.
   *
   * @param respawn - Brings the body back at `spawn` after it is destroyed; the player has none.
   */
  function register(
    body: RigidBody,
    field: DamageField,
    color: number,
    mass: number,
    spawn: Placement,
    respawn: ((placement: Placement) => void) | undefined,
    tank?: Tank
  ): Armored {
    const slot = renderer.allocateField();

    if (slot === undefined) {
      throw new Error('The damage range ran out of field slots.');
    }

    const entry: Armored = {
      body,
      field,
      slot,
      color,
      tank,
      density: mass / solidBoxes(field, blockCells(field)).area,
      colliders: [],
      coreOpen: false,
      barrelKick: 0,
      changed: true,
      flash: 0,
      exhaust: Math.random(),
      before: { velocity: { x: 0, y: 0 }, spin: 0 },
      spawn,
      respawn
    };
    armored.push(entry);
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

    const { boxes } = solidBoxes(body.field, blockCells(body.field));

    if (boxes.length === 0) {
      remove(body);
      scheduleRespawn(body);
      return;
    }

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
      const angle = Math.atan2(normal.y, normal.x) + Math.PI / 2 + random(-0.6, 0.6) + (index % 2) * Math.PI;
      const sparkSpeed = random(80, 220);
      renderer.spawn(PARTICLE_SPARK, point.x, point.y, Math.cos(angle) * sparkSpeed, Math.sin(angle) * sparkSpeed, random(0.1, 0.25), 2, SPARK_COLOR);
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

  /** Finds the first armor, core or wall within `maxDistance` along a shot, ignoring `shooter`. */
  function castShot(start: Point, direction: Point, shooter: Armored | undefined, maxDistance: number) {
    let best: { distance: number; target?: Armored; part?: 'armor' | 'core' } = { distance: maxDistance };

    for (const body of armored) {
      if (body === shooter) {
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

  /** Chips the armor where a shot hit, dents it slightly and knocks the body back. */
  function damage(body: Armored, point: Point, direction: Point) {
    const local = toLocal(body.body, point);
    const inward = rotateInto(body.body, direction);
    carve(body.field, { x: local.x + inward.x * 0.6, y: local.y + inward.y * 0.6 }, SHOT_HOLE, 0.35, Math.random() * 1000);
    dent(body.field, local, inward, 0.9, 4.5);
    body.body.applyImpulse({ x: direction.x * KNOCKBACK, y: direction.y * KNOCKBACK }, true);
    body.body.applyImpulseAtPoint({ x: direction.x * KNOCKBACK_SPIN, y: direction.y * KNOCKBACK_SPIN }, point, true);
    body.flash = 1;
    body.changed = true;

    const color = rgb(body.color);
    spawnDust(point, direction, [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55]);
  }

  /** Chips of material bouncing back toward the shooter. */
  function spawnDust(point: Point, direction: Point, color: readonly number[]) {
    for (let index = 0; index < 5; index++) {
      const angle = Math.atan2(-direction.y, -direction.x) + random(-1.1, 1.1);
      const speed = random(40, 140);
      renderer.spawn(PARTICLE_DUST, point.x, point.y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(0.4, 0.9), random(1, 1.5), [...color, 1]);
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
      const angle = random(0, Math.PI * 2);
      const drift = index === 0 ? 0 : random(1, 10);
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
   * sparks. The barrel kicks back and the camera shakes.
   */
  function muzzleBlast(at: Point, direction: Point, shooter: Armored | undefined) {
    const across = { x: -direction.y, y: direction.x };
    // A brief flash at the muzzle lights the tank itself, so its turret shades the hull.
    flash(at.x + direction.x * 2, at.y + direction.y * 2, MUZZLE_GLARE, 0.07, 1, [1, 0.8, 0.5], MUZZLE_HEIGHT);

    // The main light rides out of the barrel after the shot, up to where the shot first stops, fading as it goes.
    const reach = castShot(at, direction, shooter, SHOT_RANGE).distance;
    flash(at.x + direction.x * 3, at.y + direction.y * 3, MUZZLE_LIGHT, MUZZLE_LIGHT_LIFE, 1, [1, 0.72, 0.38], MUZZLE_HEIGHT, {
      x: direction.x * MUZZLE_LIGHT_SPEED,
      y: direction.y * MUZZLE_LIGHT_SPEED,
      distance: Math.max(reach - 3, 0)
    });

    for (let index = 0; index < 10; index++) {
      const angle = Math.atan2(direction.y, direction.x) + random(-0.3, 0.3);
      const speed = random(80, 280);
      const ahead = random(2, 10);
      renderer.spawn(PARTICLE_FIRE, at.x + direction.x * ahead, at.y + direction.y * ahead, Math.cos(angle) * speed, Math.sin(angle) * speed, random(0.1, 0.18), random(3.5, 6), NO_COLOR);
    }

    for (const side of [-1, 1]) {
      const speed = random(60, 120);
      const vx = (across.x * side * 0.9 + direction.x * 0.4) * speed;
      const vy = (across.y * side * 0.9 + direction.y * 0.4) * speed;
      renderer.spawn(PARTICLE_FIRE, at.x, at.y, vx, vy, random(0.06, 0.1), random(1.5, 2.2), NO_COLOR);
    }

    for (let index = 0; index < 6; index++) {
      const angle = Math.atan2(direction.y, direction.x) + random(-0.7, 0.7);
      const speed = random(15, 70);
      const ahead = random(4, 14);
      renderer.spawn(PARTICLE_SMOKE, at.x + direction.x * ahead, at.y + direction.y * ahead, Math.cos(angle) * speed, Math.sin(angle) * speed, random(0.5, 0.9), random(2, 3.5), NO_COLOR);
    }

    for (let index = 0; index < 4; index++) {
      const angle = Math.atan2(direction.y, direction.x) + random(-0.25, 0.25);
      const speed = random(300, 550);
      renderer.spawn(PARTICLE_SPARK, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(0.08, 0.18), 2, SPARK_COLOR);
    }

    if (shooter) {
      shooter.barrelKick = BARREL_KICK;
    }

    shake = Math.max(shake, MUZZLE_SHAKE);
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
    renderer.spawn(PARTICLE_FIRE, point.x, point.y, toward.x * 40, toward.y * 40, random(0.06, 0.1), random(1.5, 2.5), NO_COLOR);

    for (let index = 0; index < 8; index++) {
      const angle = Math.atan2(toward.y, toward.x) + random(-1.1, 1.1);
      const speed = random(150, 420);
      renderer.spawn(PARTICLE_SPARK, point.x, point.y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(0.1, 0.3), 2.5, SPARK_COLOR);
    }
  }

  /** Blows a body apart from its core: light, fire, smoke, the whole armor as debris, and a wreck fire left burning. */
  function destroy(body: Armored, direction: Point) {
    const center = body.body.translation();
    const velocity = body.body.linvel();

    flash(center.x, center.y, EXPLOSION_LIGHT, 0.45, 1, [1, 0.6, 0.28], EXPLOSION_HEIGHT);
    flash(center.x, center.y, EXPLOSION_LIGHT * 0.5, 0.15, 1, [1, 0.95, 0.8], EXPLOSION_HEIGHT);
    shake = Math.max(shake, EXPLOSION_SHAKE);

    for (let index = 0; index < 40; index++) {
      const angle = random(0, Math.PI * 2);
      const speed = random(150, 480);
      renderer.spawn(PARTICLE_SPARK, center.x, center.y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(0.15, 0.45), 2.5, SPARK_COLOR);
    }

    for (let index = 0; index < 24; index++) {
      const angle = random(0, Math.PI * 2);
      const speed = random(20, 130);
      renderer.spawn(PARTICLE_FIRE, center.x, center.y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(0.4, 0.8), random(4, 7), NO_COLOR);
    }

    for (let index = 0; index < 30; index++) {
      const angle = random(0, Math.PI * 2);
      const speed = random(10, 70);
      renderer.spawn(PARTICLE_SOOT, center.x + random(-8, 8), center.y + random(-8, 8), Math.cos(angle) * speed, Math.sin(angle) * speed, random(1.5, 3.5), random(5, 9), NO_COLOR);
    }

    for (const fragment of shatter(body.field, 7, MIN_FRAGMENT_CELLS)) {
      launchFragment(body, fragment, toWorld(body.body, { x: fragment.centerX, y: fragment.centerY }), 260, direction);
    }

    if (body.tank) {
      const angle = random(0, Math.PI * 2);
      debris.push({
        x: center.x,
        y: center.y,
        angle: body.tank.turretAngle,
        vx: velocity.x + Math.cos(angle) * 90 + direction.x * 60,
        vy: velocity.y + Math.sin(angle) * 90 + direction.y * 60,
        spin: random(-12, 12),
        age: 0,
        life: random(3, 4.5),
        color: rgb(body.color)
      });
    }

    // The wreck burns where it stood until it burns out.
    burning.ignite(center, WRECK_FIRE_SPREAD, WRECK_FIRE_LIFE, WRECK_FIRE_LIGHT, 0.5);

    remove(body);
    scheduleRespawn(body);
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
    const kick = random(0.4, 1) * speed;
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
      spin: random(-8, 8),
      age: 0,
      life: random(2.5, 4),
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
      world.removeRigidBody(body.tank.pull);
    }

    world.removeRigidBody(body.body);
    renderer.releaseField(body.slot);
  }

  function scheduleRespawn(body: Armored) {
    const respawn = body.respawn;

    if (respawn) {
      respawns.push({ at: clock + RESPAWN_DELAY, spawn: () => respawn(body.spawn) });
    }
  }
}

/** A body with destructible armor. */
type Armored = {
  body: RigidBody;
  field: DamageField;
  slot: number;
  color: number;
  tank: Tank | undefined;
  /** Mass per square pixel of armor, so chipped armor weighs less. */
  density: number;
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
  spawn: Placement;
  respawn: ((placement: Placement) => void) | undefined;
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

type Placement = { x: number; y: number; rotation: number; turret?: number };

/** Layout of the range, in pixels around the origin. */
const RANGE = {
  halfWidth: 480,
  halfHeight: 320,
  player: { x: -300, y: 0, rotation: 0 },
  targets: [
    { x: 60, y: -150, rotation: 0.3, turret: 2.6 },
    { x: 180, y: 40, rotation: Math.PI, turret: Math.PI - 0.4 },
    { x: 20, y: 190, rotation: -Math.PI / 2, turret: -2 },
    { x: 330, y: -80, rotation: Math.PI / 2, turret: 2.2 },
    { x: -120, y: -40, rotation: 0.8, turret: -0.6 }
  ] satisfies Placement[],
  crates: [
    { x: -60, y: -220, rotation: 0.4 },
    { x: -150, y: 170, rotation: 0 },
    { x: 300, y: 200, rotation: 1.2 }
  ] satisfies Placement[],
  /** A campfire between the player's start and the nearest target, to try lights and shadows on. */
  campfire: { x: -210, y: -140 }
};

const STOP = { x: 0, y: 0 };
const WRECK_FIRE_SPREAD = 10;
const WRECK_FIRE_LIFE = 12;
const WRECK_FIRE_LIGHT = 140;
const CAMPFIRE_RADIUS = 13;
const TANK_MASS = 1;
const CRATE_MASS = 10;
const SHOT_RANGE = 1000;
const SHOT_HOLE = 2.3;
/** Linear impulse of a penetrating hit, which shoves a 1-mass hull about 10 px against its damping. */
const KNOCKBACK = 300;
/** Extra impulse at the hit point, which turns the body a little. */
const KNOCKBACK_SPIN = 20;
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
/** Puffs take their colors from their layer. */
const NO_COLOR = [0, 0, 0, 0];

/** Draw fields of a turret: a quad from (-11, -11) to (31, 11) in turret coordinates. */
const TURRET_DRAW = { kind: KIND_TURRET, originX: -10.5, originY: -10.5, cell: 1, cols: 42, rows: 22 };

function createWalls(rapier: Rapier, world: World) {
  const walls = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const thickness = 40;
  const { halfWidth, halfHeight } = RANGE;

  for (const [x, y, hw, hh] of [
    [0, -halfHeight - thickness, halfWidth + thickness * 2, thickness],
    [0, halfHeight + thickness, halfWidth + thickness * 2, thickness],
    [-halfWidth - thickness, 0, thickness, halfHeight],
    [halfWidth + thickness, 0, thickness, halfHeight]
  ]) {
    world.createCollider(rapier.ColliderDesc.cuboid(hw, hh).setTranslation(x, y), walls);
  }

  // The campfire's ring of stones stops tanks.
  world.createCollider(rapier.ColliderDesc.ball(CAMPFIRE_RADIUS).setTranslation(RANGE.campfire.x, RANGE.campfire.y), walls);

  return walls;
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

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}
