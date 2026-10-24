import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import { applyAim } from '../arena/aim';
import { createCamera, followTarget, screenToWorldDirection, worldToScreen, zoomCamera } from '../arena/camera';
import { makeArenaInput } from '../arena/input';
import { createRangeRenderer } from '../damage/renderer';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { useWorld, World } from '../physics/World';
import { BotThoughts, KothHud, MatchResult, type HudState, type ThoughtView } from './Hud';
import { createKothMatch, type KothMatch } from './match';
import { CAPTURE_RULES } from './rules';

/**
 * King of the hill on WebGPU: red against blue, four tanks a side, the player with three bots
 * against four bots. Stand on the point in the middle to capture it; the first team to hold it
 * for 90 seconds wins.
 *
 * Keys: R restarts, B shows what the bots think, V hands the player's tank to a bot and shows the
 * whole map (1-8 follow a tank, 0 shows the whole map again). In the address, `?watch` starts
 * watching right away and `?hold=30` shortens the hold time that wins to 30 seconds.
 */
export default function KothRoute() {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [restarts, setRestarts] = createSignal(0);
  const [showThoughts, setShowThoughts] = createSignal(false);
  const [watching, setWatching] = createSignal(new URLSearchParams(window.location.search).has('watch'));
  const [state, setState] = createSignal<HudState>();
  const [thoughts, setThoughts] = createSignal<ThoughtView[]>([]);

  makeEventListener(window, 'keydown', (event) => {
    if (event.code === 'KeyR') {
      setRestarts((count) => count + 1);
    } else if (event.code === 'KeyB') {
      setShowThoughts((shown) => !shown);
    } else if (event.code === 'KeyV') {
      setWatching((on) => !on);
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
          <World gravity={{ x: 0, y: 0 }} lengthUnit={PIXELS_PER_METER}>
            <KothScene
              canvas={canvas()!}
              restarts={restarts()}
              watching={watching()}
              thoughts={showThoughts() || watching()}
              onFrame={(frame) => {
                setState(frame.state);
                setThoughts(frame.thoughts);
              }}
            />
          </World>
        </Rapier2D>
      </GpuCanvas>
      <BotThoughts thoughts={thoughts()} />
      <KothHud state={state()} watching={watching()} />
      <MatchResult state={state()} onRestart={() => setRestarts((count) => count + 1)} />
      <p class="pointer-events-none absolute bottom-3 left-4 m-0 text-xs text-white/60">
        WASD drive · mouse aims · click fires · stand on the point to capture it · your base mends armor · B bot thoughts · V watch the bots (1-8
        follow, 0 whole map) · R restart
      </p>
    </div>
  );
}

/** Rapier tolerances assume meters; Godot's Rapier plugin likewise treats 100 px as a meter. */
const PIXELS_PER_METER = 100;

/**
 * Runs the match on the canvas's GPU: input, fixed 60 Hz physics steps, the camera and drawing,
 * and reports the display state every frame.
 *
 * @param restarts - Starts a new match whenever it changes after mount.
 * @param watching - The player's seat is driven by a bot and the camera shows the whole map, or follows a chosen tank.
 * @param thoughts - Reports what each bot thinks, placed on screen, with every frame.
 * @param onFrame - Receives the display state after each frame.
 */
function KothScene(props: {
  canvas: HTMLCanvasElement;
  restarts: number;
  watching: boolean;
  thoughts: boolean;
  onFrame: (frame: { state: HudState; thoughts: ThoughtView[] }) => void;
}) {
  const canvas = untrack(() => props.canvas);
  const rapier = useRapier2D();
  const world = useWorld();
  const renderer = createRangeRenderer(useGpuCanvas());
  const match = createKothMatch(rapier, world, renderer, { rules: rulesFromAddress() });
  const input = makeArenaInput(canvas);
  const camera = createCamera(match.seat.tank?.hull.translation() ?? { x: 0, y: 0 });
  let lastTime: number | undefined;
  let pendingStep = 0;
  let seenRestarts = untrack(() => props.restarts);
  let watched: number | undefined;
  let overview = { zoom: START_ZOOM };

  camera.zoom = START_ZOOM;

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([0-8])$/.exec(event.code);

    if (digit) {
      watched = digit[1] === '0' ? undefined : Number(digit[1]) - 1;
      camera.zoom = watched === undefined ? camera.zoom : FOLLOW_ZOOM;
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

  /** Reads input, steps the match, places the camera, draws and reports one frame. */
  function frame(time: number) {
    const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = time;

    if (props.restarts !== seenRestarts) {
      seenRestarts = props.restarts;
      match.restart();
    }

    match.spectate(props.watching);

    const screen = fitCanvas(canvas);
    const controls = input.read();
    const player = match.player;

    camera.rotation += controls.turn * VIEW_TURN_SPEED * dt;
    zoomCamera(camera, controls.zoom * Math.exp(controls.zoomKeys * KEY_ZOOM_SPEED * dt));

    if (player && !props.watching) {
      applyAim(player, controls.aim, camera, screen);
    }

    const drive = screenToWorldDirection(camera, controls.move);
    pendingStep += dt;

    while (pendingStep >= PHYSICS_STEP) {
      pendingStep -= PHYSICS_STEP;
      match.step(PHYSICS_STEP, { drive, fire: controls.fire && !props.watching });
    }

    match.update(dt);
    placeCamera(screen);
    match.draw(camera);
    const shake = match.shake;
    const view = { ...camera, x: camera.x + (Math.random() * 2 - 1) * shake, y: camera.y + (Math.random() * 2 - 1) * shake };
    renderer.render(view, screen, BACKGROUND, dt);
    props.onFrame({ state: match.hud(), thoughts: props.thoughts && !match.capture.winner ? thoughtsOnScreen(match, camera, screen) : [] });
  }

  /** Follows the player's tank, a watched tank, or frames the whole map while watching. */
  function placeCamera(screen: { width: number; height: number }) {
    const followed = props.watching ? (watched === undefined ? undefined : match.members[watched]) : match.seat;
    const target = followed?.tank?.hull.translation();

    if (props.watching && watched === undefined) {
      const fit = Math.min(screen.width / (match.map.halfWidth * 2 + 60), screen.height / (match.map.halfHeight * 2 + 140));

      if (overview.zoom !== fit) {
        overview = { zoom: fit };
        camera.zoom = fit;
      }

      camera.x += (match.map.point.x - camera.x) * 0.1;
      camera.y += (match.map.point.y + 20 / camera.zoom - camera.y) * 0.1;
      return;
    }

    overview = { zoom: 0 };

    if (target) {
      followTarget(camera, target, screen);
    }
  }
}

const START_ZOOM = 2;
/** Zoom when watching one tank. */
const FOLLOW_ZOOM = 1.6;
const PHYSICS_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;
const VIEW_TURN_SPEED = 1.5;
const KEY_ZOOM_SPEED = 1.5;
const BACKGROUND = [0.302, 0.302, 0.302];

/** Capture rules with the hold time from `?hold=` in the address, in seconds, for short matches. */
function rulesFromAddress() {
  const hold = Number(new URLSearchParams(window.location.search).get('hold'));
  return hold > 0 ? { ...CAPTURE_RULES, holdTime: hold } : CAPTURE_RULES;
}

/** What each bot thinks, with its label, path and target placed on screen. */
function thoughtsOnScreen(match: KothMatch, camera: ReturnType<typeof createCamera>, screen: { width: number; height: number }): ThoughtView[] {
  const toScreen = (point: { x: number; y: number }) => worldToScreen(camera, point, screen);

  return match.thoughts().map((thought) => {
    const label = toScreen(thought.position);
    const target = thought.target && match.combat.armorOf(thought.target) ? toScreen(thought.target.hull.translation()) : undefined;

    return {
      id: thought.member.id,
      team: thought.member.team,
      name: thought.member.name,
      role: thought.member.role,
      goal: thought.goal ?? '',
      action: thought.action ?? '',
      steps: thought.steps.join(' → '),
      covering: thought.covering?.name,
      x: label.x,
      y: label.y,
      path: [thought.position, ...thought.path.slice(1)]
        .map(toScreen)
        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(' '),
      target
    };
  });
}

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
