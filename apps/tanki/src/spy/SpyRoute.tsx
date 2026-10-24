import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import { createCamera, followTarget, screenToWorld, screenToWorldDirection, worldToScreen, zoomCamera } from '../arena/camera';
import { makeArenaInput, type Aim } from '../arena/input';
import { createRangeRenderer } from '../damage/renderer';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { createWorld } from '../physics/World';
import { SpyHud, type SpyHudState } from './Hud';
import { createSpySandbox, type SpySandbox } from './sandbox';
import { AXES, nextVariant, searchWithVariant, variantFromSearch, type Variant } from './variants';

/**
 * The Spy sandbox on WebGPU, for trying out the spider against tanks. Every axis of `Variant`
 * switches with a key and stays in the address: T who the player is (the spider, a tank hunted
 * by the bot spider, or nobody), V the rule by which tanks see the spider, B the spider's
 * ability, G its build, C which sight cones are drawn. P pauses and `.` then advances one frame;
 * R starts over. With `?debug` in the address the sandbox is `window.spySandbox`, for checks.
 */
export default function SpyRoute() {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [variant, setVariant] = createSignal(variantFromSearch(location.search));
  const [resets, setResets] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [hud, setHud] = createSignal<SpyHudState>();

  makeEventListener(window, 'keydown', (event) => {
    const axis = (Object.keys(AXES) as (keyof Variant)[]).find((name) => AXES[name].key === event.code);

    if (axis) {
      const next = nextVariant(variant(), axis);
      history.replaceState(history.state, '', searchWithVariant(location.search, next));
      setVariant(next);
    } else if (event.code === 'KeyR') {
      setResets((count) => count + 1);
    } else if (event.code === 'KeyP') {
      setPaused((on) => !on);
    }
  });

  return (
    <div class="fixed inset-0 overflow-hidden select-none font-sans">
      <canvas ref={setCanvas} class="block h-full w-full touch-none" />
      <GpuCanvas
        canvas={canvas()}
        requiredBufferBytes={64 * 1024 * 1024}
        error={(error) => <p class="absolute inset-0 m-0 grid place-items-center text-white">{error.message}</p>}
      >
        <Rapier2D>
          <SpyScene canvas={canvas()!} variant={variant()} resets={resets()} paused={paused()} onFrame={setHud} />
        </Rapier2D>
      </GpuCanvas>
      <SpyHud state={hud()} />
      <PausedTag paused={paused()} />
      <p class="pointer-events-none absolute bottom-3 left-4 right-4 m-0 text-xs leading-5 text-white/60">
        {hint(variant())} · T role: {variant().role} · V sight: {variant().visibility} · B ability: {variant().ability} · G gait: {variant().gait} · C
        cones: {variant().cones} · P pause, . step · R reset · wheel zooms · Q/E turn the view
      </p>
    </div>
  );
}

/** The controls of the current role. */
function hint(variant: Variant) {
  if (variant.role === 'spy') {
    return `WASD run · mouse faces · hold click behind a stern: ${variant.ability} · inside a tank: WASD, mouse, click, F jumps out`;
  }

  return variant.role === 'tank' ? 'WASD drive · mouse aims · click fires · the bot spider hunts you' : 'the bots play both sides';
}

/** A tag in the corner while the sandbox is paused. */
function PausedTag(props: { paused: boolean }) {
  return (
    <div
      class="pointer-events-none absolute left-3 top-3 rounded bg-black/55 px-2 py-0.5 text-xs font-bold text-white"
      style={{ display: props.paused ? 'block' : 'none' }}
    >
      Paused · . steps one frame
    </div>
  );
}

/** Rapier tolerances assume meters; Godot's Rapier plugin likewise treats 100 px as a meter. */
const PIXELS_PER_METER = 100;

/**
 * Runs the sandbox on the canvas's GPU: input, fixed 60 Hz physics steps, the camera and drawing,
 * and reports the display state every frame. The scene owns its physics world, so remounting it
 * starts from an empty world.
 *
 * @param variant - Applied to the sandbox whenever it changes.
 * @param resets - Starts over whenever it changes after mount.
 * @param paused - Holds the simulation; the `.` key then advances it by one physics step.
 * @param onFrame - Receives the display state after each frame.
 */
function SpyScene(props: { canvas: HTMLCanvasElement; variant: Variant; resets: number; paused: boolean; onFrame: (state: SpyHudState) => void }) {
  const canvas = untrack(() => props.canvas);
  const rapier = useRapier2D();
  const world = createWorld(rapier, { gravity: { x: 0, y: 0 }, lengthUnit: PIXELS_PER_METER });
  const renderer = createRangeRenderer(useGpuCanvas());
  const sandbox = createSpySandbox(rapier, world, renderer, { variant: untrack(() => props.variant) });
  const input = makeArenaInput(canvas);
  const camera = createCamera(sandbox.focus);
  const held = new Set<string>();
  let lastTime: number | undefined;
  let pendingStep = 0;
  let pendingFrames = 0;
  let seenResets = untrack(() => props.resets);

  camera.zoom = START_ZOOM;

  makeEventListener(window, 'keydown', (event) => {
    held.add(event.code);

    if (event.code === 'Period') {
      pendingFrames++;
    }
  });
  makeEventListener(window, 'keyup', (event) => held.delete(event.code));
  makeEventListener(window, 'blur', () => held.clear());

  if (new URLSearchParams(location.search).has('debug')) {
    const debug = window as unknown as { spySandbox?: SpySandbox };
    debug.spySandbox = sandbox;
    onCleanup(() => delete debug.spySandbox);
  }

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

  /** Reads input, steps the sandbox, places the camera, draws and reports one frame. */
  function frame(time: number) {
    let dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = time;

    if (props.resets !== seenResets) {
      seenResets = props.resets;
      sandbox.reset();
    }

    if (props.variant !== sandbox.variant) {
      sandbox.setVariant(props.variant);
    }

    const screen = fitCanvas(canvas);
    const controls = input.read();
    camera.rotation += controls.turn * VIEW_TURN_SPEED * dt;
    zoomCamera(camera, controls.zoom * Math.exp(controls.zoomKeys * KEY_ZOOM_SPEED * dt));

    if (props.paused) {
      dt = pendingFrames > 0 ? PHYSICS_STEP : 0;
      pendingFrames = Math.max(pendingFrames - 1, 0);
      pendingStep = dt;
    } else {
      pendingFrames = 0;
      pendingStep += dt;
    }

    const step = {
      move: screenToWorldDirection(camera, controls.move),
      aim: aimFrom(sandbox.playerTank?.hull.translation() ?? sandbox.focus, controls.aim, screen),
      fire: controls.fire,
      dismount: held.has('KeyF')
    };

    while (pendingStep >= PHYSICS_STEP - 1e-9) {
      pendingStep -= PHYSICS_STEP;
      sandbox.step(PHYSICS_STEP, step);
    }

    sandbox.update(dt);
    followTarget(camera, sandbox.focus, screen);
    sandbox.draw(camera);
    const shake = sandbox.shake;
    const view = { ...camera, x: camera.x + (Math.random() * 2 - 1) * shake, y: camera.y + (Math.random() * 2 - 1) * shake };
    renderer.render(view, screen, BACKGROUND, dt);

    const state = sandbox.hud();
    props.onFrame({
      ...state,
      spiderOnScreen: worldToScreen(camera, state.spider.position, screen),
      watchersOnScreen: state.watchers.map((watcher) => worldToScreen(camera, watcher.position, screen))
    });
  }

  /** The world heading from `from` toward the player's aim, as the spider faces and a turret turns. */
  function aimFrom(from: { x: number; y: number }, aim: Aim | undefined, screen: { width: number; height: number }) {
    if (aim?.kind === 'point') {
      const target = screenToWorld(camera, aim, screen);
      return Math.atan2(target.y - from.y, target.x - from.x);
    }

    return aim?.kind === 'direction' ? aim.angle - camera.rotation : undefined;
  }
}

const START_ZOOM = 2.2;
const PHYSICS_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;
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
