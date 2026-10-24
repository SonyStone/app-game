import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import { applyAim } from '../arena/aim';
import { createCamera, followTarget, screenToWorldDirection, zoomCamera } from '../arena/camera';
import { makeArenaInput } from '../arena/input';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { createWorld } from '../physics/World';
import { createDamageRange } from './range';
import { createRangeRenderer } from './renderer';

/**
 * The damage range on WebGPU: drive into targets to dent them, shoot their armor off and hit
 * the glowing core at the rear to blow them up. R or the Reset button rebuilds the range.
 */
export default function DamageRoute() {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [resetCount, setResetCount] = createSignal(0);
  let stick!: HTMLDivElement;
  let knob!: HTMLDivElement;

  return (
    <div class="fixed inset-0 overflow-hidden select-none">
      <canvas ref={setCanvas} class="block h-full w-full touch-none" />
      <GpuCanvas
        canvas={canvas()}
        requiredBufferBytes={64 * 1024 * 1024}
        error={(error) => <p class="absolute inset-0 m-0 grid place-items-center text-white font-sans">{error.message}</p>}
      >
        <Rapier2D>
          <DamageScene canvas={canvas()!} resets={resetCount()} stick={stick} knob={knob} />
        </Rapier2D>
      </GpuCanvas>
      <div ref={(element) => (stick = element)} class="pointer-events-none absolute hidden rounded-full border-2 border-white/35" />
      <div ref={(element) => (knob = element)} class="pointer-events-none absolute hidden rounded-full bg-white/35" />
      <button
        class="absolute right-3 top-3 rounded border-0 bg-black/40 px-3 py-1.5 text-sm text-white font-sans"
        onClick={() => setResetCount((count) => count + 1)}
      >
        Reset (R)
      </button>
      <p class="pointer-events-none absolute bottom-3 left-4 m-0 text-xs text-white/60 font-sans">
        WASD drive · mouse aims · click fires · ram to dent · the core sits under the rear armor · glancing shots ricochet · wheel zooms · Q/E turn
        the view
      </p>
    </div>
  );
}

/** Rapier tolerances assume meters; Godot's Rapier plugin likewise treats 100 px as a meter. */
const PIXELS_PER_METER = 100;

/**
 * Runs the range on the canvas's GPU: input, fixed 60 Hz physics steps, damage and drawing. The
 * scene owns its physics world, so remounting it starts from an empty world.
 *
 * @param resets - Rebuilds the range whenever it changes after mount.
 * @param stick - Ring of the touch drive stick; `knob` is its handle. Both are positioned here.
 */
function DamageScene(props: { canvas: HTMLCanvasElement; resets: number; stick: HTMLDivElement; knob: HTMLDivElement }) {
  const canvas = untrack(() => props.canvas);
  const rapier = useRapier2D();
  const world = createWorld(rapier, { gravity: { x: 0, y: 0 }, lengthUnit: PIXELS_PER_METER });
  const renderer = createRangeRenderer(useGpuCanvas());
  const range = createDamageRange(rapier, world, renderer);
  const input = makeArenaInput(canvas);
  const camera = createCamera(range.player.hull.translation());
  let lastTime: number | undefined;
  let pendingStep = 0;
  let seenResets = untrack(() => props.resets);

  camera.zoom = START_ZOOM;

  makeEventListener(window, 'keydown', (event) => {
    if (event.code === 'KeyR') {
      range.reset();
    }
  });

  const [, start, stop] = createRAF((time) => {
    // A failing frame would fail the same way every frame: stop the loop and report it once.
    try {
      frame(time);
    } catch (error) {
      stop();
      throw error;
    }
  });

  onSettled(() => untrack(start));
  onCleanup(stop);

  return null;

  /** Reads input, steps physics, applies damage and draws one frame. */
  function frame(time: number) {
    const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = time;

    if (props.resets !== seenResets) {
      seenResets = props.resets;
      range.reset();
    }

    const screen = fitCanvas(canvas);
    const controls = input.read();
    const player = range.player;

    camera.rotation += controls.turn * VIEW_TURN_SPEED * dt;
    zoomCamera(camera, controls.zoom * Math.exp(controls.zoomKeys * KEY_ZOOM_SPEED * dt));
    applyAim(player, controls.aim, camera, screen);

    const drive = screenToWorldDirection(camera, controls.move);
    pendingStep += dt;

    while (pendingStep >= PHYSICS_STEP) {
      pendingStep -= PHYSICS_STEP;
      player.reload = Math.max(player.reload - PHYSICS_STEP, 0);

      if (controls.fire && player.reload === 0) {
        player.reload = RELOAD_TIME;
        range.fire(player);
        input.rumble();
      }

      range.step(PHYSICS_STEP, drive);
    }

    range.update(dt);
    followTarget(camera, range.player.hull.translation(), screen);
    range.draw(camera);
    const shake = range.shake;
    const view = { ...camera, x: camera.x + (Math.random() * 2 - 1) * shake, y: camera.y + (Math.random() * 2 - 1) * shake };
    renderer.render(view, screen, BACKGROUND, dt);
    placeStick(props.stick, props.knob, input.stick());
  }
}

const START_ZOOM = 3;
const PHYSICS_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;
const RELOAD_TIME = 0.1;
const VIEW_TURN_SPEED = 1.5;
const KEY_ZOOM_SPEED = 1.5;
const BACKGROUND = [0.302, 0.302, 0.302];

/** Sizes the canvas's drawing buffer to its CSS size times the device pixel ratio; returns the CSS size. */
function fitCanvas(canvas: HTMLCanvasElement) {
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

/** Shows the touch drive stick under the finger, or hides it. */
function placeStick(
  ring: HTMLDivElement,
  knob: HTMLDivElement,
  stick: ReturnType<ReturnType<typeof makeArenaInput>['stick']>
) {
  ring.style.display = stick ? 'block' : 'none';
  knob.style.display = stick ? 'block' : 'none';

  if (!stick) {
    return;
  }

  const knobRadius = stick.radius * 0.4;
  Object.assign(ring.style, {
    left: `${stick.origin.x - stick.radius}px`,
    top: `${stick.origin.y - stick.radius}px`,
    width: `${stick.radius * 2}px`,
    height: `${stick.radius * 2}px`
  });
  Object.assign(knob.style, {
    left: `${stick.knob.x - knobRadius}px`,
    top: `${stick.knob.y - knobRadius}px`,
    width: `${knobRadius * 2}px`,
    height: `${knobRadius * 2}px`
  });
}
