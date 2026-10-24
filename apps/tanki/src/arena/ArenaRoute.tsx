import { Application, Container, Graphics, Stage, useApplication } from '@app-game/solid-pixi';
import type { JSX } from '@solidjs/web';
import type { Container as PixiContainer, Graphics as PixiGraphics, Ticker } from 'pixi.js';
import { onCleanup } from 'solid-js';
import { Rapier2D, type RigidBody, useRapier2D } from '../physics/Rapier2D';
import { createWorld } from '../physics/World';
import {
  addHullBox,
  castShot,
  createArenaWalls,
  createCrate,
  createTank,
  driveTank,
  PLAYER_PULL_SPEED,
  type Tank
} from './bodies';
import { applyAim } from './aim';
import { applyCamera, createCamera, followTarget, screenToWorldDirection, zoomCamera } from './camera';
import { BACKGROUND_COLOR, drawArena, drawCrate, drawHull, drawTurret, PLAYER_COLOR, PROP_COLOR } from './draw';
import { createBlasts, createEngineSmoke, createShotSmoke, createTracks } from './effects';
import { makeArenaInput } from './input';
import { ARENA } from './level';

/**
 * The arena prototype: the player's tank among idle tanks and crates, ported from the Godot
 * project `~/1D/godot/atanki-game`. Physics runs in Rapier with Godot's pixel units.
 */
export default function ArenaRoute() {
  const canvas = (<canvas class="block h-full w-full touch-none" />) as HTMLCanvasElement;

  return (
    <div class="fixed inset-0 overflow-hidden select-none">
      <Application
        resizeTo={window}
        canvas={canvas}
        background={BACKGROUND_COLOR}
        antialias
        resolution={window.devicePixelRatio}
      >
        <Stage>
          <Rapier2D>
            <ArenaScene />
          </Rapier2D>
        </Stage>
      </Application>
      <p class="pointer-events-none absolute bottom-3 left-4 m-0 text-xs text-white/60 font-sans">
        WASD drive · mouse aims · click fires · wheel zooms · Q/E turn the view · touch: left side drives, right side
        fires
      </p>
    </div>
  );
}

/** Rapier tolerances assume meters; Godot's Rapier plugin likewise treats 100 px as a meter. */
const PIXELS_PER_METER = 100;

/**
 * Builds the arena's bodies and runs the game loop on the Pixi ticker: input, fixed 60 Hz physics
 * steps, effects and the camera. Children views sync themselves to their bodies afterward. The
 * scene owns its physics world, so remounting it starts from an empty world.
 */
function ArenaScene() {
  const app = useApplication();
  const rapier = useRapier2D();
  const world = createWorld(rapier, { gravity: { x: 0, y: 0 }, lengthUnit: PIXELS_PER_METER });
  const input = makeArenaInput(app.canvas);

  createArenaWalls(rapier, world);
  const crates = ARENA.boxes.map((placement) => createCrate(rapier, world, placement));
  const player = createTank(rapier, world, ARENA.player, PLAYER_COLOR, PLAYER_PULL_SPEED);
  const idleTanks = ARENA.tanks.map((placement) => createTank(rapier, world, placement, PROP_COLOR));
  const tanks = [player, ...idleTanks];
  tanks.forEach((tank) => addHullBox(rapier, world, tank));

  const blasts = createBlasts(rapier, world);
  const shotSmoke = createShotSmoke();
  const tracks = createTracks(tanks);
  const engineSmoke = createEngineSmoke(tanks);
  const camera = createCamera(ARENA.player);

  let worldLayer!: PixiContainer;
  let trackGraphics!: PixiGraphics;
  let shotGraphics!: PixiGraphics;
  let blastGraphics!: PixiGraphics;
  let exhaustGraphics!: PixiGraphics;
  let stickGraphics!: PixiGraphics;
  let pendingStep = 0;

  const tick = (ticker: Ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_FRAME_TIME);
    const controls = input.read();
    const screen = app.screen;

    camera.rotation += controls.turn * VIEW_TURN_SPEED * dt;
    zoomCamera(camera, controls.zoom * Math.exp(controls.zoomKeys * KEY_ZOOM_SPEED * dt));

    applyAim(player, controls.aim, camera, screen);

    const drive = screenToWorldDirection(camera, controls.move);
    pendingStep += dt;

    while (pendingStep >= PHYSICS_STEP) {
      pendingStep -= PHYSICS_STEP;
      driveTank(player, drive);
      idleTanks.forEach((tank) => driveTank(tank, STOP));
      fireWhenReady(player, controls.fire);
      blasts.step(PHYSICS_STEP);
      world.step();
      tracks.step();
    }

    shotSmoke.update(dt);
    blasts.update(dt);
    engineSmoke.update(dt);

    followTarget(camera, player.hull.translation(), screen);
    applyCamera(camera, worldLayer, screen);

    tracks.draw(trackGraphics);
    shotSmoke.draw(shotGraphics);
    blasts.draw(blastGraphics);
    engineSmoke.draw(exhaustGraphics);
    drawStick(stickGraphics, input.stick());
  };

  /** Fires one hitscan shot when the trigger is held and the 0.1 s reload has passed. */
  function fireWhenReady(tank: Tank, trigger: boolean) {
    tank.reload = Math.max(tank.reload - PHYSICS_STEP, 0);

    if (!trigger || tank.reload > 0) {
      return;
    }

    tank.reload = RELOAD_TIME;
    const shot = castShot(rapier, world, tank, blasts.canShotHit);
    shotSmoke.spawn(shot.start, shot.end);
    blasts.spawn(shot.end);
    input.rumble();
  }

  app.ticker.add(tick);
  onCleanup(() => app.ticker.remove(tick));

  return (
    <>
      <Container ref={(layer) => (worldLayer = layer)}>
        <Graphics ref={(graphics) => drawArena(graphics)} />
        <Graphics ref={(graphics) => (trackGraphics = graphics)} />
        <Graphics ref={(graphics) => (shotGraphics = graphics)} />
        <Graphics ref={(graphics) => (blastGraphics = graphics)} />
        {crates.map((crate) => (
          <BodyView body={crate}>
            <Graphics ref={(graphics) => drawCrate(graphics)} />
          </BodyView>
        ))}
        {tanks.map((tank) => (
          <TankView tank={tank} />
        ))}
        <Graphics ref={(graphics) => (exhaustGraphics = graphics)} />
      </Container>
      <Graphics ref={(graphics) => (stickGraphics = graphics)} />
    </>
  );
}

const PHYSICS_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;
const RELOAD_TIME = 0.1;
const VIEW_TURN_SPEED = 1.5;
const KEY_ZOOM_SPEED = 1.5;
const STOP = { x: 0, y: 0 };

/** Draws a tank's hull and its turret, which turns independently toward `tank.turretAngle`. */
function TankView(props: { tank: Tank }) {
  const app = useApplication();
  let turret!: PixiGraphics;

  const sync = () => {
    turret.rotation = props.tank.turretAngle - props.tank.hull.rotation();
  };

  app.ticker.add(sync);
  onCleanup(() => app.ticker.remove(sync));

  return (
    <BodyView body={props.tank.hull}>
      <Graphics ref={(graphics) => drawHull(graphics, props.tank.color)} />
      <Graphics
        ref={(graphics) => {
          turret = drawTurret(graphics, props.tank.color);
        }}
      />
    </BodyView>
  );
}

/** A container that follows `body`'s position and rotation every frame. */
function BodyView(props: { body: RigidBody; children: JSX.Element }) {
  const app = useApplication();
  let view!: PixiContainer;

  const sync = () => {
    const position = props.body.translation();
    view.position.set(position.x, position.y);
    view.rotation = props.body.rotation();
  };

  app.ticker.add(sync);
  onCleanup(() => app.ticker.remove(sync));

  return <Container ref={(container) => (view = container)}>{props.children}</Container>;
}

/** Draws the floating touch stick in screen space, or nothing when it is not held. */
function drawStick(graphics: PixiGraphics, stick: ReturnType<ReturnType<typeof makeArenaInput>['stick']>) {
  graphics.clear();

  if (!stick) {
    return;
  }

  graphics
    .circle(stick.origin.x, stick.origin.y, stick.radius)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.35 })
    .circle(stick.knob.x, stick.knob.y, stick.radius * 0.4)
    .fill({ color: 0xffffff, alpha: 0.35 });
}
