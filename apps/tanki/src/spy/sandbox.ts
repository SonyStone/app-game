import { DEFAULT_PULL_SPEED, muzzleOf, PLAYER_PULL_SPEED, type Tank } from '../arena/bodies';
import { createCombat, type Shot } from '../damage/combat';
import { PARTICLE_DUST, PARTICLE_FIRE, PARTICLE_SPARK, PARTICLE_SMOKE, type createRangeRenderer } from '../damage/renderer';
import type { Collider, Rapier } from '../physics/Rapier2D';
import { TANK_CLASSES } from '../koth/classes/classes';
import { createWeapon, type Trigger, type Weapon } from '../koth/classes/weapon';
import { MEDIUM_TANK, type TankClass } from '../koth/tanks';
import type { World } from '../physics/World';
import { createObstacles, SPY_ARENA, type Patrol, type SpyArena } from './arena';
import { createConeDraw } from './cones';
import { createNavGrid, type MovingBox } from './navgrid';
import { createPatrolBot, SWEEP_ANGLE, type PatrolBot, type PatrolSenses } from './patrol';
import { canGrab, createSpider, sternOf } from './spider';
import { createSpiderDraw } from './spiderDraw';
import { createHijacker } from './hijack';
import { createStalker, type AttemptFailure, type Prey } from './stalker';
import type { Ability, Variant } from './variants';
import { angleBetween, sees, sightFan, VIEW } from './visibility';

type Point = { x: number; y: number };
type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * The Spy sandbox: a town quarter of buildings, crates and low obstacles with a patrol of tanks
 * and one spider, on the battle core of `createCombat`. The variant decides who the player is, by what
 * rule the tanks see the spider and what the spider does from a stern (see `Variant`); it can
 * change at any time.
 *
 * - The spider grabs a tank's stern from behind while the ability key is held, and keeps
 *   holding for the ability's time: `infect` then hides it inside the tank, which it drives for
 *   `INFECT_TIME` seconds (the tank's team takes it for a friend until it fires) before it jumps
 *   out, scratching the hull and leaving the tank stunned and alert; `backstab` drills into the
 *   core, which blows the tank up; `jam` plants a charge that stops the tank for `JAM_TIME`
 *   seconds, after which it turns on whatever was behind it. A tank is immune for a while after
 *   an ability. Letting go early drops the spider off.
 * - Tanks see the spider by the variant's rule; under `hidden` grabbing, jumping off, a blast or
 *   a charge shows it for `VIEW.revealTime` seconds. Shots that pass through the spider hurt it;
 *   after `SPIDER_HP` hits it dies and comes back at its start.
 * - Bots drive every tank but the player's and, unless the player is the spider, the spider.
 *   The bot spider's attempts on sterns are tallied per variant in `tally`.
 *
 * The sandbox owns its Rapier bodies and renderer field slots; `reset` starts over.
 *
 * @param options.random - Source of randomness in [0, 1), so tests and measurements can seed it.
 * @param options.tankBots - Whether bots drive the tanks; tests turn them off to keep tanks still.
 */
export function createSpySandbox(
  rapier: Rapier,
  world: World,
  renderer: Renderer,
  options: { variant: Variant; arena?: SpyArena; random?: () => number; tankBots?: boolean }
) {
  const arena = options.arena ?? SPY_ARENA;
  const random = options.random ?? Math.random;
  const tankBots = options.tankBots ?? true;
  let variant = options.variant;
  const combat = createCombat(rapier, world, renderer, arena, {
    random,
    wreckFire: 6,
    onShot: (shooter, path) => shotPassed(shooter, path),
    onHit: (target, shooter) => tankHit(target, shooter),
    onDestroyed: (victim, killer) => tankDestroyed(victim, killer)
  });
  const obstacles = createObstacles(rapier, world, renderer, arena.obstacles);
  const spiderDraw = createSpiderDraw(renderer);
  const cones = createConeDraw(renderer, arena.patrols.length);
  const tallies = new Map<string, Tally>();
  const lights: { at: Point; radius: number; color: readonly number[]; life: number; age: number; height: number }[] = [];
  let spider = createSpider(rapier, world, variant.gait, arena.spiderStart, obstacles.heightAt);
  const hijacker = createHijacker(createNavGrid(arena, 'tank', TANK_CLEARANCE));
  let stalker = makeStalker();
  let units = arena.patrols.map((patrol, index) => spawnUnit(patrol, index));
  let spy = freshSpy();
  let attempt: { started: number; target: Tank } | undefined;

  return {
    /** The variant in play. */
    get variant() {
      return variant;
    },

    /** Seconds of simulated time since creation. */
    get clock() {
      return combat.clock;
    },

    /** The battle core underneath, for its tanks, armor and line of sight. */
    combat,

    /** The spider. Replaced when the gait changes. */
    get spider() {
      return spider;
    },

    /** The bot spider's mind, which runs whenever the player is not the spider. */
    get stalker() {
      return stalker;
    },

    /** The tank of each patrol, in the order of `arena.patrols`; `undefined` while it waits to respawn. */
    get tanks() {
      return units.map((unit) => unit.tank);
    },

    /** The tank the player drives as the tank, or as the spider while it is inside one. */
    get playerTank() {
      return variant.role === 'tank' ? units[PLAYER_UNIT].tank : variant.role === 'spy' ? spy.infection?.unit.tank : undefined;
    },

    /** The tank the spider is inside, if it infected one. */
    get infected() {
      return spy.infection?.unit.tank;
    },

    /** Whether `tank` is jammed right now. */
    isJammed(tank: Tank) {
      return units.some((unit) => unit.tank === tank && unit.jammedUntil > combat.clock);
    },

    /** Where the camera should look: what the player controls, or the spider while watching. */
    get focus() {
      if (variant.role === 'tank') {
        return units[PLAYER_UNIT].tank?.hull.translation() ?? arena.patrols[PLAYER_UNIT].start;
      }

      return spy.infection?.unit.tank?.hull.translation() ?? spider.position;
    },

    /** Camera shake in world pixels, from shots and explosions. */
    get shake() {
      return combat.shake;
    },

    /** Attempts of the bot spider on sterns under the current visibility, ability and gait. */
    get tally() {
      return tallyOf(variant);
    },

    /** Attempts of the bot spider under every variant tried so far, by variant key `visibility/ability/gait`. */
    get tallies(): ReadonlyMap<string, Readonly<Tally>> {
      return tallies;
    },

    /**
     * Switches to `next`. A new role starts the sandbox over; a new gait swaps the spider in place;
     * the other axes take effect at once.
     */
    setVariant(next: Variant) {
      const previous = variant;
      variant = next;

      if (next.role !== previous.role) {
        this.reset();
      } else if (next.gait !== previous.gait) {
        swapSpider();
      }
    },

    /**
     * Advances one fixed physics step: the player's input, the bots, the spider's ability, the
     * tanks and Rapier.
     *
     * @param input.move - The player's run or drive direction in world axes, length up to 1.
     * @param input.aim - World heading the player aims at; the spider faces it, a turret turns to it.
     * @param input.fire - The fire or ability key is held.
     * @param input.dismount - The key that makes the spider jump out of a tank it infected is held.
     */
    step(dt: number, input: SandboxInput) {
      const clock = combat.clock;
      respawn(clock);
      const revealed = clock < spy.revealUntil;

      for (const unit of units) {
        unit.sees = unit.tank !== undefined && spiderExposed() && sees(variant.visibility, watcherOf(unit.tank), spider.position, revealed, combat.lineOfSight);
      }

      const intent = spiderIntent(dt, input);
      useAbility(dt, intent, input);
      spider.steer(dt, intent.move, intent.face);
      driveTanks(dt, input);
      combat.step(dt);
      spider.update(dt);
    },

    /** Moves debris and fires and fades lights over a frame of `dt` seconds. */
    update(dt: number) {
      combat.update(dt);

      for (let index = lights.length - 1; index >= 0; index--) {
        lights[index].age += dt;

        if (lights[index].age >= lights[index].life) {
          lights.splice(index, 1);
        }
      }

      for (const unit of units) {
        if (unit.tank && unit.jammedUntil > combat.clock && random() < dt * JAM_SPARKS) {
          const at = sternOf(unit.tank);
          const angle = random() * Math.PI * 2;
          const speed = 60 + random() * 120;
          renderer.spawn(PARTICLE_SPARK, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.1 + random() * 0.15, 1.6, JAM_SPARK_COLOR);
        }
      }
    },

    /**
     * Queues the yard, the tanks, the spider and the sight cones for drawing. Playing a tank, the
     * spider is drawn only while the player's tank sees it.
     *
     * @param view - Point on the ground under the camera.
     */
    draw(view: Point) {
      combat.draw(view, () => {
        obstacles.draw();
        drawCones(view);
      });

      const shown = spiderShown();

      if (shown) {
        spiderDraw.draw(spider, shown.ghost ? GHOST_COLOR : SPIDER_COLOR);
      }

      for (const unit of units) {
        if (unit.tank && unit.jammedUntil > combat.clock) {
          const at = sternOf(unit.tank);
          renderer.addLight(at.x, at.y, JAM_LIGHT, 0.45 + 0.25 * Math.sin(combat.clock * 30), [0.45, 0.75, 1], 9);
        }
      }

      const infected = spy.infection?.unit.tank;

      if (infected && variant.role !== 'tank') {
        const at = sternOf(infected);
        renderer.addLight(at.x, at.y, HIJACK_LIGHT, 0.4 + 0.2 * Math.sin(combat.clock * 6), [0.85, 0.35, 1], 9);
      }

      for (const light of lights) {
        const fade = 1 - light.age / light.life;
        renderer.addLight(light.at.x, light.at.y, light.radius, fade * fade, light.color, light.height);
      }
    },

    /** What the heads-up display shows this frame. */
    hud() {
      const clock = combat.clock;
      const latch = spy.latch;
      const infection = spy.infection;
      const player = units[PLAYER_UNIT];
      const grabbable = spiderInPlay() && !spider.holding && units.some((unit) => unit.tank && grabbableFor(unit) && canGrab(unit.tank, spider.position));

      return {
        variant,
        spider: {
          alive: !spy.dead,
          hp: spy.hp,
          respawnIn: Math.max(spy.deadUntil - clock, 0),
          inside: infection !== undefined,
          grabbable,
          holding: latch ? latch.held / HOLD_TIME[variant.ability] : undefined,
          infection: infection ? { left: infection.left, exposed: infection.exposed } : undefined,
          revealLeft: Math.max(spy.revealUntil - clock, 0),
          position: spider.position,
          phase: stalker.phase,
          /** The bot spider's planned way, from where it is. */
          path: variant.role === 'spy' ? [] : [spider.position, ...stalker.path]
        },
        watchers: units.flatMap((unit) =>
          unit.tank ? [{ index: unit.index, position: unit.tank.hull.translation(), suspicion: unit.bot.suspicion, sees: unit.sees, alerted: unit.bot.alerted, mode: unit.bot.mode }] : []
        ),
        player: {
          alive: player.tank !== undefined,
          armor: player.tank ? combat.armorLeft(player.tank) : 0,
          respawnIn: Math.max(player.respawnAt - clock, 0),
          jammedLeft: Math.max(player.jammedUntil - clock, 0),
          hijackedLeft: infection?.unit === player ? infection.left : 0
        },
        tally: tallyOf(variant)
      };
    },

    /** Removes every tank and debris piece and starts over, keeping the tallies. */
    reset() {
      endHold();
      combat.reset();
      spider.place(arena.spiderStart);
      units = arena.patrols.map((patrol, index) => spawnUnit(patrol, index));
      spy = freshSpy();
      stalker = makeStalker();
      attempt = undefined;
    },

    /** Puts the spider at `place` at once, standing, letting go of any tank; for tests and checks. */
    placeSpider(place: Point & { rotation: number }) {
      endHold();
      spider.place(place);
    },

    /** Puts tank `index` at `place` at once; for tests and checks. */
    placeTank(index: number, place: Point & { rotation: number; turret?: number }) {
      const tank = units[index].tank;

      if (!tank) {
        return;
      }

      tank.hull.setTranslation(place, true);
      tank.hull.setRotation(place.rotation, true);
      tank.hull.setLinvel({ x: 0, y: 0 }, true);
      tank.pull.setTranslation({ x: place.x + Math.cos(place.rotation) * 15, y: place.y + Math.sin(place.rotation) * 15 }, true);
      tank.pull.setLinvel({ x: 0, y: 0 }, true);
      tank.turretAngle = place.turret ?? place.rotation;
    }
  };

  /** What the spider means to do this step: the player's input as the spider, or the bot's. */
  function spiderIntent(dt: number, input: SandboxInput) {
    if (!spiderInPlay() || spy.infection) {
      return { move: STOP, face: undefined, hold: false };
    }

    if (variant.role === 'spy') {
      return { move: input.move, face: input.aim, hold: input.fire };
    }

    return stalker.think(dt, spider, {
      clock: combat.clock,
      rule: variant.visibility,
      prey: units.flatMap((unit) => (unit.tank ? [preyOf(unit, unit.tank)] : [])),
      quarry: variant.role === 'tank' ? units[PLAYER_UNIT].tank : undefined,
      hunted: units.some((unit) => unit.tank && unit.bot.alerted && unit.sees),
      boxes: movingBoxes(),
      lineOfSight: combat.lineOfSight
    });
  }

  /**
   * Grabs a stern, keeps holding it until the ability works, and runs an infection: its timer, the
   * hijacked tank's controls and the jump out at its end.
   */
  function useAbility(dt: number, intent: ReturnType<typeof spiderIntent>, input: SandboxInput) {
    if (spy.infection) {
      const infection = spy.infection;
      infection.left -= dt;
      infection.armed ||= !input.fire;

      if (infection.left <= 0 || (variant.role === 'spy' && input.dismount)) {
        endInfection();
      }

      return;
    }

    const latch = spy.latch;

    if (latch) {
      if (!intent.hold || !latch.unit.tank) {
        letGo(LET_GO_SPEED);
        stalker.interrupted('knocked off');
        return;
      }

      latch.held += dt;

      if (variant.ability === 'backstab' && latch.held >= latch.drilled * DRILL_EVERY) {
        latch.drilled++;
        drill(latch.unit.tank);
      }

      if (latch.held >= HOLD_TIME[variant.ability]) {
        complete(latch.unit, variant.ability);
      }

      return;
    }

    if (!intent.hold || spider.airborne || !spiderInPlay()) {
      return;
    }

    const prey = units.find((unit) => unit.tank && grabbableFor(unit) && canGrab(unit.tank, spider.position));

    if (prey?.tank) {
      spider.grab(prey.tank);
      spy.latch = { unit: prey, held: 0, drilled: 0 };
      reveal();
    }
  }

  /** The ability worked: the tank is infected, blown up or jammed. */
  function complete(unit: Unit, ability: Ability) {
    const tank = unit.tank!;
    spy.latch = undefined;
    recordSuccess();

    if (ability === 'infect') {
      // Inside, the spider works the tank's own gun, a fresh clip of its class's weapon.
      spy.infection = { unit, left: INFECT_TIME, exposed: false, armed: false, weapon: createWeapon(unit.tankClass, random) };
      // The spider's mind replaces the crew's: whatever the crew saw or feared is gone.
      unit.bot = createPatrolBot(unit.patrol, random);
      stalker.succeeded(true);
      return;
    }

    stalker.succeeded(false);
    const angle = tank.hull.rotation();
    const center = tank.hull.translation();

    if (ability === 'backstab') {
      combat.detonate(tank, { x: Math.cos(angle), y: Math.sin(angle) });
      letGo(BLAST_JUMP_SPEED);
    } else {
      unit.jammedUntil = combat.clock + JAM_TIME;
      unit.immuneUntil = unit.jammedUntil + IMMUNITY;
      unit.alarmAt = unit.jammedUntil;
      flash(sternOf(tank), 60, [0.45, 0.75, 1], 0.3, 9);
      letGo(LET_GO_SPEED * 1.5);
    }

    reveal();
    noise(center, ACT_NOISE);
  }

  /** The spider jumps out of the tank it infected, scratching the hull; the tank is stunned and turns on it. */
  function endInfection() {
    const infection = spy.infection;

    if (!infection) {
      return;
    }

    spy.infection = undefined;
    const tank = infection.unit.tank;
    spider.jumpOff();
    reveal();

    if (!tank) {
      return;
    }

    const angle = tank.hull.rotation();
    combat.chip(tank, sternOf(tank), { x: Math.cos(angle), y: Math.sin(angle) }, EXIT_SCRATCH);
    infection.unit.stunnedUntil = combat.clock + EXIT_STUN;
    infection.unit.immuneUntil = combat.clock + IMMUNITY;
    infection.unit.bot.startle(behind(tank, 50));
  }

  /** The spider lets go of the stern it holds and drops off behind it. */
  function letGo(speed: number) {
    spy.latch = undefined;
    spider.jumpOff(speed);
  }

  /** Ends any hold or infection without its effects, as when starting over. */
  function endHold() {
    spy.latch = undefined;
    spy.infection = undefined;
    spider.jumpOff(0);
  }

  /** One turn of the drill into the core: a chip through the rear armor toward it. */
  function drill(tank: Tank) {
    const angle = tank.hull.rotation();
    const stern = sternOf(tank);
    combat.chip(tank, stern, { x: Math.cos(angle), y: Math.sin(angle) }, DRILL_CHIP);
  }

  /** Drives every tank: the player's by input, a hijacked one by its rider, the rest by their bots. */
  function driveTanks(dt: number, input: SandboxInput) {
    const clock = combat.clock;
    const hijacked = spy.infection?.unit;

    for (const unit of units) {
      const tank = unit.tank;

      if (!tank) {
        continue;
      }

      unit.reload = Math.max(unit.reload - dt, 0);
      const jammed = unit.jammedUntil > clock;

      if (unit.alarmAt !== undefined && clock >= unit.alarmAt) {
        unit.alarmAt = undefined;
        unit.bot.startle(behind(tank, 50));
      }

      if (unit === hijacked) {
        driveHijacked(dt, unit, tank, input);
      } else if (jammed) {
        combat.drive(tank, STOP);
      } else if (variant.role === 'tank' && unit.index === PLAYER_UNIT) {
        combat.drive(tank, input.move);
        tank.turretAngle = input.aim ?? tank.turretAngle;

        if (input.fire && unit.reload === 0) {
          fireTank(unit, tank);
        }
      } else if (tankBots) {
        const { move, fire } = unit.bot.think(dt, tank, sensesOf(unit, tank), { jammed, stunned: unit.stunnedUntil > clock });
        combat.drive(tank, move);

        if (fire && unit.reload === 0) {
          fireTank(unit, tank);
        }
      } else {
        combat.drive(tank, STOP);
      }
    }
  }

  /**
   * The spider drives the tank it is inside: the player's controls, or the bot's attack on the
   * tank's own team. It fires the tank's own weapon, of the tank's class, with its clip and reloads,
   * not the patrol's quick gun: a Soldier's tank fires rockets.
   */
  function driveHijacked(dt: number, unit: Unit, tank: Tank, input: SandboxInput) {
    const infection = spy.infection!;

    if (variant.role === 'spy') {
      combat.drive(tank, input.move);
      tank.turretAngle = input.aim ?? tank.turretAngle;
      fireWeapon(unit, tank, infection.weapon, dt, input.fire && infection.armed);
      return;
    }

    const victims = units.flatMap((other) => (other !== unit && other.tank ? [other.tank] : []));
    const controls = hijacker.drive(combat.clock, tank, victims, movingBoxes(tank), combat.lineOfSight);

    // With no one in sight the hijacked tank drives its usual patrol, as its team expects.
    if (!controls) {
      const senses = { ...sensesOf(unit, tank), spider: undefined, enemy: undefined };
      combat.drive(tank, unit.bot.think(dt, tank, senses, { jammed: false, stunned: false }).move);
      fireWeapon(unit, tank, infection.weapon, dt, false);
      return;
    }

    combat.drive(tank, controls.move);
    const error = angleBetween(tank.turretAngle, controls.aim);
    tank.turretAngle += Math.sign(error) * Math.min(Math.abs(error), HIJACK_TURRET_SPEED * dt);
    fireWeapon(unit, tank, infection.weapon, dt, controls.fire);
  }

  /**
   * Works a class's weapon for `dt` seconds and fires what it gives along the turret: `wants` pulls
   * the trigger, a gatling spun up while it does, a charged shot held until full and let go.
   */
  function fireWeapon(unit: Unit, tank: Tank, weapon: Weapon, dt: number, wants: boolean) {
    for (const shot of weapon.step(dt, pullFor(weapon, wants))) {
      fireTank(unit, tank, { ...shot, angle: tank.turretAngle + (shot.angle ?? 0) });
    }
  }

  /**
   * Fires `tank`'s gun: the patrol's quick hitscan gun, or `shot` of the tank's class's weapon,
   * which a hijacked tank fires; either way the shot makes noise and gives a hijacked tank away.
   */
  function fireTank(unit: Unit, tank: Tank, shot?: Shot) {
    unit.reload = variant.role === 'tank' && unit.index === PLAYER_UNIT ? PLAYER_RELOAD : BOT_RELOAD;
    combat.fire(tank, shot);

    if (spy.infection?.unit === unit) {
      spy.infection.exposed = true;
    }

    noise(tank.hull.translation(), SHOT_NOISE, unit);
  }

  /** What `unit`'s bot knows this step. */
  function sensesOf(unit: Unit, tank: Tank): PatrolSenses {
    const position = tank.hull.translation();
    const hijacked = spy.infection;
    let enemy: PatrolSenses['enemy'];

    if (hijacked?.exposed && hijacked.unit !== unit && hijacked.unit.tank) {
      const at = hijacked.unit.tank.hull.translation();

      if (Math.hypot(at.x - position.x, at.y - position.y) < ENEMY_SIGHT && combat.lineOfSight(position, at)) {
        enemy = { position: at };
      }
    }

    return {
      spider: spiderExposed() ? { position: spider.position, visible: unit.sees } : undefined,
      enemy,
      clearShot: (target) => clearShot(unit, tank, target),
      others: units.flatMap((other) => (other !== unit && other.tank ? [other.tank.hull.translation()] : []))
    };
  }

  /** Whether a shot from `tank` at `target` passes no other tank of its team on the way. */
  function clearShot(unit: Unit, tank: Tank, target: Point) {
    const start = muzzleOf(tank);
    const length = Math.hypot(target.x - start.x, target.y - start.y);

    return units.every((other) => {
      if (other === unit || !other.tank || other === spy.infection?.unit) {
        return true;
      }

      const at = other.tank.hull.translation();
      const t = Math.min(Math.max(((at.x - start.x) * (target.x - start.x) + (at.y - start.y) * (target.y - start.y)) / (length * length || 1), 0), 1);
      const gap = Math.hypot(start.x + (target.x - start.x) * t - at.x, start.y + (target.y - start.y) * t - at.y);
      return gap > TEAMMATE_CLEARANCE || t >= 1;
    });
  }

  /**
   * A shot hurts the spider if it passes within the spider's reach anywhere from the shooter's
   * turret on: along the barrel, whose blast catches a spider right behind the muzzle such as one
   * on the shooter's own stern, and along each segment of its flight.
   */
  function shotPassed(shooter: Tank, path: readonly Point[]) {
    if (!spiderInPlay() || spy.infection) {
      return;
    }

    const center = spider.position;
    const reach = spider.build.radius + SHOT_SLACK;
    const points = [shooter.hull.translation(), ...path];

    for (let index = 1; index < points.length; index++) {
      if (segmentDistance(center, points[index - 1], points[index]) < reach) {
        hurtSpider();
        return;
      }
    }
  }

  function hurtSpider() {
    spy.hp -= 1;
    const at = spider.position;

    for (let index = 0; index < 6; index++) {
      const angle = random() * Math.PI * 2;
      const speed = 40 + random() * 100;
      renderer.spawn(PARTICLE_DUST, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.4 + random() * 0.4, 1.2, SPIDER_DUST);
    }

    if (spy.latch) {
      letGo(LET_GO_SPEED);
      stalker.interrupted('knocked off');
    }

    if (spy.hp > 0) {
      return;
    }

    stalker.interrupted('killed');

    for (let index = 0; index < 18; index++) {
      const angle = random() * Math.PI * 2;
      const speed = 60 + random() * 200;
      renderer.spawn(PARTICLE_SPARK, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.15 + random() * 0.3, 2, [1, 0.85, 0.5, 1]);
    }

    for (let index = 0; index < 8; index++) {
      const angle = random() * Math.PI * 2;
      const speed = 10 + random() * 50;
      renderer.spawn(PARTICLE_FIRE, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.3 + random() * 0.3, 3 + random() * 2, [0, 0, 0, 0]);
      renderer.spawn(PARTICLE_SMOKE, at.x, at.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.6 + random() * 0.5, 2.5 + random() * 2, [0, 0, 0, 0]);
    }

    flash(at, 90, [1, 0.6, 0.3], 0.35, 10);
    tallyOf(variant).deaths += variant.role === 'spy' ? 0 : 1;
    spy.dead = true;
    spy.deadUntil = combat.clock + SPIDER_RESPAWN;
    spider.place(arena.spiderStart);
  }

  /** Tallies the hits a hijacked tank lands on its old team and takes from it. */
  function tankHit(target: Tank, shooter: Tank | undefined) {
    const hijacked = spy.infection?.unit.tank;

    if (!hijacked || variant.role === 'spy' || target === shooter) {
      return;
    }

    if (shooter === hijacked) {
      tallyOf(variant).hijackHits++;
    } else if (target === hijacked) {
      tallyOf(variant).hitsTaken++;
    }
  }

  /** A tank blew up or fell apart: it waits to respawn, and the spider falls off or out of it. */
  function tankDestroyed(victim: Tank, killer: Tank | undefined) {
    const unit = units.find((item) => item.tank === victim);

    if (!unit) {
      return;
    }

    if (killer && killer === spy.infection?.unit.tank && variant.role !== 'spy') {
      tallyOf(variant).hijackKills++;
    }

    unit.tank = undefined;
    unit.respawnAt = combat.clock + TANK_RESPAWN;

    if (spy.latch?.unit === unit) {
      letGo(BLAST_JUMP_SPEED);
      stalker.interrupted('knocked off');
    }

    if (spy.infection?.unit === unit) {
      spy.infection = undefined;
      spider.jumpOff(BLAST_JUMP_SPEED);
      reveal();
    }
  }

  /** Brings back tanks whose wait is over, and the spider. */
  function respawn(clock: number) {
    for (const unit of units) {
      if (!unit.tank && clock >= unit.respawnAt) {
        unit.tank = spawnTank(unit.patrol, unit.index, unit.tankClass);
        unit.bot = createPatrolBot(unit.patrol, random);
        unit.jammedUntil = 0;
        unit.stunnedUntil = 0;
        unit.immuneUntil = 0;
        unit.alarmAt = undefined;
      }
    }

    if (spy.dead && clock >= spy.deadUntil) {
      spy = { ...freshSpy(), revealUntil: spy.revealUntil };
      spider.place(arena.spiderStart);
    }
  }

  function spawnUnit(patrol: Patrol, index: number): Unit {
    const tankClass = TANK_CLASSES[patrol.tankClass ?? MEDIUM_TANK.id];

    return {
      index,
      patrol,
      tankClass,
      tank: spawnTank(patrol, index, tankClass),
      bot: createPatrolBot(patrol, random),
      respawnAt: 0,
      jammedUntil: 0,
      stunnedUntil: 0,
      immuneUntil: 0,
      alarmAt: undefined,
      reload: 0,
      sees: false
    };
  }

  /** Spawns the patrol's tank of `tankClass`, with its hull, mass and look, at the sandbox's speeds scaled by the class's. */
  function spawnTank(patrol: Patrol, index: number, tankClass: TankClass) {
    const player = variant.role === 'tank' && index === PLAYER_UNIT;

    return combat.spawnTank(patrol.start, {
      color: player ? PLAYER_TANK_COLOR : TANK_COLOR,
      team: 'tanks',
      pullSpeed: ((player ? PLAYER_PULL_SPEED : DEFAULT_PULL_SPEED) * tankClass.speed) / MEDIUM_TANK.speed,
      hull: tankClass.hull,
      mass: tankClass.mass,
      look: tankClass.look
    });
  }

  function swapSpider() {
    const place = { ...spider.position, rotation: spider.facing };
    endHold();
    spider.remove();
    spider = createSpider(rapier, world, variant.gait, place, obstacles.heightAt);
    stalker = makeStalker();
  }

  function makeStalker() {
    const grid = createNavGrid(arena, variant.gait, spider.build.radius + 3);

    return createStalker(grid, random, {
      start(target) {
        attempt = { started: combat.clock, target };
        tallyOf(variant).attempts++;
      },
      fail(reason) {
        recordFailure(reason);
      }
    });
  }

  function recordSuccess() {
    if (variant.role === 'spy' || !attempt) {
      return;
    }

    const tally = tallyOf(variant);
    tally.successes++;
    tally.times.push(combat.clock - attempt.started);
    attempt = undefined;
  }

  function recordFailure(reason: AttemptFailure) {
    if (!attempt) {
      return;
    }

    tallyOf(variant).failures[reason]++;
    attempt = undefined;
  }

  function tallyOf(of: Variant) {
    const key = `${of.visibility}/${of.ability}/${of.gait}`;
    let tally = tallies.get(key);

    if (!tally) {
      tally = { attempts: 0, successes: 0, times: [], failures: { spotted: 0, timeout: 0, 'lost target': 0, killed: 0, 'knocked off': 0 }, deaths: 0, hijackKills: 0, hijackHits: 0, hitsTaken: 0 };
      tallies.set(key, tally);
    }

    return tally;
  }

  /** Whether `unit`'s tank can be grabbed for the current ability. */
  function grabbableFor(unit: Unit) {
    const clock = combat.clock;
    return unit.immuneUntil <= clock && unit !== spy.infection?.unit;
  }

  function preyOf(unit: Unit, tank: Tank): Prey {
    let fan: ReturnType<typeof sightFan> | null = null;
    let sweep: ReturnType<typeof sightFan> | null = null;
    const revealed = combat.clock < spy.revealUntil;
    const at = tank.hull.translation();

    return {
      tank,
      grabbable: grabbableFor(unit),
      fan: () => {
        const reach = sightReach();
        fan ??= sightFan(variant.visibility, watcherOf(tank), revealed, (angle, limit) => reach(at, angle, limit), 24, DANGER_WIDEN);
        return fan;
      },
      sweep: () => {
        const reach = sightReach();
        const heading = { ...at, facing: tank.hull.rotation() };
        sweep ??= sightFan(variant.visibility, heading, revealed, (angle, limit) => reach(at, angle, limit), 32, SWEEP_ANGLE);
        return sweep;
      }
    };
  }

  /** Crates and tanks but `except` as boxes, for the bots' plans; tanks only cost, as they move. */
  function movingBoxes(except?: Tank): MovingBox[] {
    const crates = combat.crates.map((crate) => ({ ...crate, halfWidth: 22, halfHeight: 47 }));
    const tanks = units.flatMap((unit) => {
      const tank = unit.tank;
      return tank && tank !== except ? [{ ...tank.hull.translation(), rotation: tank.hull.rotation(), halfWidth: 21, halfHeight: 13, cost: TANK_CELL_COST }] : [];
    });

    return [...crates, ...tanks];
  }

  /**
   * Measures sight as things stand now: returns the distance along a world heading from a point
   * to the first wall or crate, at most `limit`. Tanks, the spider and the low obstacles do not
   * block sight.
   */
  function sightReach() {
    const skip = new Set(units.flatMap((unit) => (unit.tank ? [unit.tank.hull.handle] : [])));
    skip.add(spider.body.handle);
    skip.add(obstacles.body.handle);
    const blocks = (collider: Collider) => {
      const parent = collider.parent();
      return parent === null || !skip.has(parent.handle);
    };

    return (from: Point, angle: number, limit: number) => {
      const ray = new rapier.Ray(from, { x: Math.cos(angle), y: Math.sin(angle) });
      return world.castRay(ray, limit, true, undefined, undefined, undefined, undefined, blocks)?.timeOfImpact ?? limit;
    };
  }

  /** Draws the cones the variant asks for, warm only where the player is not a tank. */
  function drawCones(view: Point) {
    if (variant.cones === 'off') {
      return;
    }

    const near = variant.role === 'tank' ? view : spy.infection?.unit.tank?.hull.translation() ?? spider.position;
    const revealed = combat.clock < spy.revealUntil;
    const reach = sightReach();

    for (const unit of units) {
      const tank = unit.tank;

      if (!tank || unit === spy.infection?.unit) {
        continue;
      }

      const at = tank.hull.translation();

      if (variant.cones === 'near' && Math.hypot(at.x - near.x, at.y - near.y) > NEAR_CONES) {
        continue;
      }

      const fan = sightFan(variant.visibility, watcherOf(tank), revealed, (angle, limit) => reach(at, angle, limit));

      if (fan) {
        const warm = variant.role !== 'tank';
        cones.draw(unit.index, fan, warm ? unit.bot.suspicion : 0, warm && unit.sees);
      }
    }
  }

  /**
   * Whether and how to draw the spider: always for the spider's player and the watcher, pale as
   * a ghost while no tank sees it; for a tank's player only while that tank sees it.
   */
  function spiderShown() {
    if (!spiderInPlay() || spy.infection) {
      return undefined;
    }

    if (variant.role === 'tank') {
      return units[PLAYER_UNIT].sees ? { ghost: false } : undefined;
    }

    return { ghost: !units.some((unit) => unit.sees) };
  }

  function spiderInPlay() {
    return !spy.dead;
  }

  /** The spider is in play and out in the open, not inside a tank it infected. */
  function spiderExposed() {
    return !spy.dead && !spy.infection;
  }

  function reveal() {
    if (variant.visibility === 'hidden') {
      spy.revealUntil = combat.clock + VIEW.revealTime;
    }
  }

  /** Makes the tanks within `range` of `at` look there, except `source`. */
  function noise(at: Point, range: number, source?: Unit) {
    for (const unit of units) {
      const tank = unit.tank;

      if (tank && unit !== source && unit !== spy.infection?.unit) {
        const position = tank.hull.translation();

        if (Math.hypot(position.x - at.x, position.y - at.y) < range) {
          unit.bot.hear(at);
        }
      }
    }
  }

  function flash(at: Point, radius: number, color: readonly number[], life: number, height: number) {
    lights.push({ at: { ...at }, radius, color, life, age: 0, height });
  }
}

/** The sandbox from `createSpySandbox`. */
export type SpySandbox = ReturnType<typeof createSpySandbox>;

/** The player's input for one physics step, in world axes; see `SpySandbox['step']`. */
export type SandboxInput = { move: Point; aim: number | undefined; fire: boolean; dismount: boolean };

/** The bot spider's attempts on sterns under one variant. */
export type Tally = {
  attempts: number;
  successes: number;
  /** Seconds from setting out to the ability working, for every success. */
  times: number[];
  failures: Record<AttemptFailure, number>;
  /** Times the bot spider died, in an attempt or not. */
  deaths: number;
  /** Tanks destroyed by tanks the bot spider hijacked. */
  hijackKills: number;
  /** Hits hijacked tanks landed on their own team, and took from it. */
  hijackHits: number;
  hitsTaken: number;
};

/** How long each ability must be held on a stern, in seconds. */
export const HOLD_TIME: Record<Ability, number> = { infect: 1.3, backstab: 1, jam: 0.5 };

/** Seconds the spider drives a tank it infected. */
export const INFECT_TIME = 8;

/** Seconds a charge keeps a tank from driving, turning its turret and firing. */
export const JAM_TIME = 2.5;

/** Hits that kill the spider. */
export const SPIDER_HP = 2;

/** The patrol whose tank the player drives as the tank. */
const PLAYER_UNIT = 0;

/** A patrolling tank: its patrol, its tank while in play and its bot. */
type Unit = {
  index: number;
  patrol: Patrol;
  /** Class of the patrol's tank, the Soldier's unless the patrol says otherwise. */
  tankClass: TankClass;
  tank: Tank | undefined;
  bot: PatrolBot;
  respawnAt: number;
  jammedUntil: number;
  stunnedUntil: number;
  /** Until then the spider cannot use an ability on the tank again. */
  immuneUntil: number;
  /** When a jammed tank comes to and turns on whatever jammed it from behind. */
  alarmAt: number | undefined;
  reload: number;
  /** The tank sees the spider this step. */
  sees: boolean;
};

const STOP = { x: 0, y: 0 };
const TANK_COLOR = 0x3b73c9;
const PLAYER_TANK_COLOR = 0x5fb3e8;
const SPIDER_COLOR = [0.79, 0.28, 0.23];
/** The spider's color while no tank sees it, faded most of the way into the floor. */
const GHOST_COLOR = [0.62, 0.52, 0.52];
const SPIDER_DUST = [0.4, 0.13, 0.1, 1];
const PLAYER_RELOAD = 0.6;
const BOT_RELOAD = 0.9;
const HIJACK_TURRET_SPEED = 3;
const SPIDER_RESPAWN = 3;
const TANK_RESPAWN = 5;
/** Tanks fight a hijacked tank that fired within this distance, whichever way they look. */
const ENEMY_SIGHT = 700;
/** How far past its radius a shot still hurts the spider: its legs. */
const SHOT_SLACK = 2;
const TEAMMATE_CLEARANCE = 20;
const LET_GO_SPEED = 60;
const BLAST_JUMP_SPEED = 220;
/** Seconds between chips of the drill, which takes four turns to reach the core. */
const DRILL_EVERY = 0.24;
const DRILL_CHIP = { hole: 2.6, depth: 2, knockback: 30 };
const EXIT_SCRATCH = { hole: 3, depth: 1.5, knockback: 120 };
const EXIT_STUN = 0.8;
const IMMUNITY = 8;
/** How far the sounds of the abilities and of shots carry, in pixels. */
const ACT_NOISE = 420;
const SHOT_NOISE = 300;
/** How far from walls and rubble a tank's planning cells keep its center: half its length. */
const TANK_CLEARANCE = 22;
/** Extra cost, in pixels of detour, of a planning cell beside a tank. */
const TANK_CELL_COST = 250;
/** Radians a tank's cone is widened by for the bot spider's caution. */
const DANGER_WIDEN = 0.3;
const NEAR_CONES = 650;
const JAM_SPARKS = 30;
const JAM_SPARK_COLOR = [0.55, 0.85, 1, 1];
const JAM_LIGHT = 34;
const HIJACK_LIGHT = 24;

/** The point `distance` pixels behind `tank`'s stern. */
function behind(tank: Tank, distance: number) {
  const stern = sternOf(tank);
  const angle = tank.hull.rotation();
  return { x: stern.x - Math.cos(angle) * distance, y: stern.y - Math.sin(angle) * distance };
}

/** A tank's position and the way its barrel points, as `sees` takes them. */
function watcherOf(tank: Tank) {
  const position = tank.hull.translation();
  return { x: position.x, y: position.y, facing: tank.turretAngle };
}

function freshSpy() {
  return {
    hp: SPIDER_HP,
    dead: false,
    deadUntil: 0,
    revealUntil: -Infinity,
    latch: undefined as { unit: Unit; held: number; drilled: number } | undefined,
    infection: undefined as { unit: Unit; left: number; exposed: boolean; armed: boolean; weapon: Weapon } | undefined
  };
}

/** How to work the trigger of `weapon` for a shot when `wants`: a gatling spins while wanted, a charged shot is held until full. */
function pullFor(weapon: Weapon, wants: boolean): Trigger {
  const spec = weapon.tankClass.weapon;

  if (spec.kind === 'spin') {
    return { fire: wants, rev: wants };
  }

  if (spec.kind === 'charge') {
    return { fire: !(wants && (weapon.charge ?? 0) >= 1) && (wants || weapon.charge !== undefined) };
  }

  return { fire: wants };
}

/** Distance from `point` to the segment from `a` to `b`. */
function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(Math.max(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0), 1);
  return Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y);
}
