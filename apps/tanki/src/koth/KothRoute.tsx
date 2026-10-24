import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createSignal, onCleanup, onSettled, Show, untrack } from 'solid-js';
import { aimAngle } from '../arena/aim';
import { createCamera, followTarget, screenToWorld, screenToWorldDirection, worldToScreen, zoomCamera } from '../arena/camera';
import { makeArenaInput } from '../arena/input';
import { createRangeRenderer } from '../damage/renderer';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { createWorld } from '../physics/World';
import { ClassMenu } from './classes/ClassMenu';
import { BotThoughts, KothHud, MatchResult, type HudState, type ThoughtView } from './Hud';
import { createKothMatch, type KothMatch } from './match';
import { CAPTURE_RULES } from './rules';
import { TANK_CLASS_IDS, type TankClassId } from './tanks';

/**
 * King of the hill on WebGPU: red against blue, four tanks a side, the player with three bots
 * against four bots, each tank of one of five classes after Team Fortress 2. The point in the
 * middle opens 30 seconds into the match; stand on it to capture it. The first team to hold it
 * for three minutes wins. The class menu opens at the start; the class picked comes at once in
 * the player's base and otherwise with the next respawn.
 *
 * Keys: 1-5 pick a class and C opens the class menu, R restarts, B shows what the bots think, V
 * hands the player's tank to a bot and shows the whole map (1-8 follow a tank, 0 shows the whole
 * map again). The right mouse button or Shift spins a Heavy's gatling up without firing and turns
 * a Sniper's hull on the spot toward the cursor. In the address, `?watch` starts watching right
 * away, `?hold=30` shortens the hold time that wins to 30 seconds, `?class=scout` starts as
 * that class with the menu closed and `?slow=4` runs the game four times slower, to look at
 * effects frame by frame.
 */
export default function KothRoute() {
  const address = new URLSearchParams(window.location.search);
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [restarts, setRestarts] = createSignal(0);
  const [showThoughts, setShowThoughts] = createSignal(false);
  const [watching, setWatching] = createSignal(address.has('watch'));
  const [state, setState] = createSignal<HudState>();
  const [thoughts, setThoughts] = createSignal<ThoughtView[]>([]);
  const [menu, setMenu] = createSignal(!address.has('watch') && !address.has('class'));
  const [choice, setChoice] = createSignal<{ id: TankClassId; count: number }>();

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([1-5])$/.exec(event.code);

    if (event.code === 'KeyR') {
      setRestarts((count) => count + 1);
    } else if (event.code === 'KeyB') {
      setShowThoughts((shown) => !shown);
    } else if (event.code === 'KeyV') {
      setWatching((on) => !on);
      setMenu(false);
    } else if (event.code === 'KeyC' && !watching()) {
      setMenu((open) => !open);
    } else if (event.code === 'Escape') {
      setMenu(false);
    } else if (digit && !watching()) {
      choose(TANK_CLASS_IDS[Number(digit[1]) - 1]);
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
          <KothScene
            canvas={canvas()!}
            restarts={restarts()}
            watching={watching()}
            thoughts={showThoughts() || watching()}
            choice={choice()}
            playerClass={address.get('class')}
            onFrame={(frame) => {
              setState(frame.state);
              setThoughts(frame.thoughts);
            }}
          />
        </Rapier2D>
      </GpuCanvas>
      <BotThoughts thoughts={thoughts()} />
      <KothHud state={state()} watching={watching()} />
      <MatchResult state={state()} onRestart={() => setRestarts((count) => count + 1)} />
      <Show when={menu() && !watching() && state()}>
        {(shown) => (
          <ClassMenu
            current={shown().player.tankClass}
            next={shown().player.nextClass}
            color="#f0773a"
            onChoose={(id) => choose(id)}
            onClose={() => setMenu(false)}
          />
        )}
      </Show>
      <p class="pointer-events-none absolute bottom-3 left-4 m-0 text-xs text-white/60">
        WASD drive · mouse aims · click fires · right button or Shift: spin up (Heavy), turn on the spot (Sniper) · 1-5 or C class · stand on the
        point to capture it · your base mends armor · B bot thoughts · V watch the bots (1-8 follow, 0 whole map) · R restart
      </p>
    </div>
  );

  /** Asks the scene for class `id` for the player and closes the menu. */
  function choose(id: TankClassId) {
    setChoice((last) => ({ id, count: (last?.count ?? 0) + 1 }));
    setMenu(false);
  }
}

/** Rapier tolerances assume meters; Godot's Rapier plugin likewise treats 100 px as a meter. */
const PIXELS_PER_METER = 100;

/**
 * Runs the match on the canvas's GPU: input, fixed 60 Hz physics steps, the camera and drawing,
 * and reports the display state every frame. The scene owns its physics world, so remounting it
 * starts from an empty world.
 *
 * @param restarts - Starts a new match whenever it changes after mount.
 * @param watching - The player's seat is driven by a bot and the camera shows the whole map, or follows a chosen tank.
 * @param thoughts - Reports what each bot thinks, placed on screen, with every frame.
 * @param choice - The class the player asked for last, handed to the match whenever it changes after mount.
 * @param playerClass - The player's first class, read once; anything but a class id means the Soldier.
 * @param onFrame - Receives the display state after each frame.
 */
function KothScene(props: {
  canvas: HTMLCanvasElement;
  restarts: number;
  watching: boolean;
  thoughts: boolean;
  choice: { id: TankClassId; count: number } | undefined;
  playerClass: string | null;
  onFrame: (frame: { state: HudState; thoughts: ThoughtView[] }) => void;
}) {
  const canvas = untrack(() => props.canvas);
  const rapier = useRapier2D();
  const world = createWorld(rapier, { gravity: { x: 0, y: 0 }, lengthUnit: PIXELS_PER_METER });
  const renderer = createRangeRenderer(useGpuCanvas());
  const first = untrack(() => props.playerClass);
  const playerClass = TANK_CLASS_IDS.find((id) => id === first);
  const match = createKothMatch(rapier, world, renderer, { rules: rulesFromAddress(), playerClass });
  const input = makeArenaInput(canvas);
  const camera = createCamera(match.seat.tank?.hull.translation() ?? { x: 0, y: 0 });
  let lastTime: number | undefined;
  let pendingStep = 0;
  let seenRestarts = untrack(() => props.restarts);
  let seenChoice = untrack(() => props.choice);
  let watched: number | undefined;
  let overview = { zoom: START_ZOOM };
  let scope = 0;

  camera.zoom = START_ZOOM;

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([0-8])$/.exec(event.code);

    if (digit && props.watching) {
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
    const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_TIME) / SLOW_MOTION;
    lastTime = time;

    if (props.restarts !== seenRestarts) {
      seenRestarts = props.restarts;
      match.restart();
    }

    if (props.choice !== seenChoice) {
      seenChoice = props.choice;

      if (seenChoice) {
        match.chooseClass(seenChoice.id);
      }
    }

    match.spectate(props.watching);

    const screen = fitCanvas(canvas);
    const controls = input.read();
    const player = match.player;

    camera.rotation += controls.turn * VIEW_TURN_SPEED * dt;
    zoomCamera(camera, controls.zoom * Math.exp(controls.zoomKeys * KEY_ZOOM_SPEED * dt));

    const aim = player && !props.watching ? aimAngle(player, controls.aim, camera, screen) : undefined;
    const drive = screenToWorldDirection(camera, controls.move);
    const reach = player && controls.aim?.kind === 'point' ? distanceTo(player.hull.translation(), screenToWorld(camera, controls.aim, screen)) : undefined;
    const alt = controls.alt && !props.watching;
    pendingStep += dt;

    while (pendingStep >= PHYSICS_STEP) {
      pendingStep -= PHYSICS_STEP;
      match.step(PHYSICS_STEP, { drive, aim, fire: controls.fire && !props.watching, rev: alt, turn: alt, reach });
    }

    match.update(dt);
    placeCamera(screen, dt);
    match.draw(camera);
    const shake = match.shake;
    const view = { ...camera, x: camera.x + (Math.random() * 2 - 1) * shake, y: camera.y + (Math.random() * 2 - 1) * shake };
    renderer.render(view, screen, BACKGROUND, dt);
    props.onFrame({ state: match.hud(), thoughts: props.thoughts && !match.capture.winner ? thoughtsOnScreen(match, camera, screen) : [] });
  }

  /**
   * Follows the player's tank, a watched tank, or frames the whole map while watching. While the
   * player's casemate gun charges or turns, the view slides forward along the gun, as a sniper's
   * scope looks far ahead.
   */
  function placeCamera(screen: { width: number; height: number }, dt: number) {
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
    const hud = match.hud().player;
    const scoped = !props.watching && hud.weapon === 'charge' && (hud.charge !== undefined || match.seat.pivot !== undefined);
    scope += ((scoped ? 1 : 0) - scope) * Math.min(dt * SCOPE_SPEED, 1);

    if (target && match.seat.tank && scope > 0.01) {
      const angle = match.seat.tank.turretAngle;
      const ahead = (Math.min(screen.width, screen.height) / 2 / camera.zoom) * SCOPE_REACH * scope;
      const sight = { x: target.x + Math.cos(angle) * ahead, y: target.y + Math.sin(angle) * ahead };
      camera.x += (sight.x - camera.x) * Math.min(dt * SCOPE_SPEED, 1);
      camera.y += (sight.y - camera.y) * Math.min(dt * SCOPE_SPEED, 1);
      return;
    }

    if (target) {
      followTarget(camera, target, screen);
    }
  }
}

/** About 900 x 560 px of the map on a laptop screen: as far as a bot sees to either side. */
const START_ZOOM = 1.6;
/** Zoom when watching one tank. */
const FOLLOW_ZOOM = 1.6;
const PHYSICS_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;
const VIEW_TURN_SPEED = 1.5;
const KEY_ZOOM_SPEED = 1.5;
const BACKGROUND = [0.302, 0.302, 0.302];
/** How far ahead the scoped view looks, as a share of half the shorter side of the screen, and how fast it slides there per second. */
const SCOPE_REACH = 0.75;
const SCOPE_SPEED = 5;

function distanceTo(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** How many times slower than real time the game runs, from `?slow=` in the address. */
const SLOW_MOTION = Math.max(Number(new URLSearchParams(window.location.search).get('slow')) || 1, 1);

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
