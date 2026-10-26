import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createSignal, onCleanup, onSettled, Show, untrack } from 'solid-js';
import { aimAngle } from '../arena/aim';
import {
  createCamera,
  DRAG_MARGIN,
  followTarget,
  screenToWorld,
  screenToWorldDirection,
  worldToScreen,
  zoomCamera
} from '../arena/camera';
import { makeArenaInput, type Aim } from '../arena/input';
import { createLookAhead } from '../arena/lookahead';
import { createRangeRenderer } from '../damage/renderer';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { createWorld } from '../physics/World';
import { AIM_LOOK_IDS, aimLookFromAddress, aimOnScreen, AimOverlay, type AimView } from './AimOverlay';
import { ClassMenu } from './classes/ClassMenu';
import { createScope } from './classes/scope';
import { BotThoughts, KothHud, MatchResult, type HudState, type ThoughtView } from './Hud';
import { createKothI18n, KothI18nProvider } from './i18n/i18n';
import { createKothMatch, type KothMatch } from './match';
import type { Pace } from './pace';
import { PauseMenu, type MenuPage } from './PauseMenu';
import { BUBBLE_TIME } from './radio';
import { RadioOverlay, type CalloutView } from './RadioOverlay';
import { CAPTURE_RULES } from './rules';
import { TANK_CLASS_IDS, type TankClassId } from './tanks';
import { createTuning } from './tuning';

/**
 * King of the hill on WebGPU: red against blue, four tanks a side, the player with three bots
 * against four bots, each tank of one of five classes after Team Fortress 2. The point in the
 * middle opens 30 seconds into the match; stand on it to capture it. The first team to hold it
 * for three minutes wins. The class menu opens at the start; the class picked comes at once in
 * the player's base and otherwise with the next respawn. Shots and blasts break walls of wood,
 * brick and concrete, and a ram breaks a fence, harder the heavier the tank. Destroyed tanks leave
 * wrecks of their class that are cover and pieces that stay on the ground. Repair kits on the map
 * mend part of a tank's damage, more on the side of the hull that touches them; only the base
 * makes a tank whole.
 *
 * The player aims with a crosshair of the game's own instead of the cursor; a line from the gun
 * shows where the next shot goes and what it will hit (see `AimOverlay`). The view looks ahead
 * toward the aim: it leads the tank by a share of the cursor's offset from the screen's center, so
 * the screen shows what lies ahead of the gun rather than behind the tank, and holds still while
 * the tank and its lead keep within a box about the screen's center, so the picture does not
 * slide under the aim while the tank drives about (see `createLookAhead`). Every gun fires at a
 * steady cadence for as long as the button is held, with no clip and no reload to keep track of.
 *
 * Esc pauses the match and opens the menu (see `PauseMenu`), which holds the actions of the
 * keys below, the pace knobs, the game's speed, the tanks' and shells' speeds, the damage, the
 * bots' reaction and how far they see, the zoom and the view's lead and slack, which take effect
 * at once and are kept for the next visit, and what every key does. Its second page is the class editor,
 * which changes each class's numbers, kept for the next visit too, and shares the whole tuning as
 * JSON or a link (see `createTuning`). Keys: 1-5 pick a class and C opens the
 * class menu, R restarts, B shows what the bots think, V hands the player's tank to a bot and
 * shows the whole map (1-8 follow a tank, 0 shows the whole map again), X switches the look of
 * the aim. The right mouse button or Shift turns a Sniper's hull on the spot toward the cursor,
 * which it also does by itself when the player stops driving and aims outside its gun's arc.
 * While a Sniper charges its shot, the view widens about the tank, which keeps the gun's aim, the
 * cores of the enemies in sight are marked and the crosshair tells when the rail would blow one
 * up; letting go fires the rail, which hits at once along the gun. In the address, `?watch`
 * starts watching right away, `?hold=30` shortens the hold time that wins to 30 seconds,
 * `?class=scout` starts as that class with the menu closed, `?aim=line` picks the aim's look,
 * `?tune` starts paused in the menu, `?tune=classes` on its class editor, `?tuning=` sets a shared
 * tuning, and `?slow=4` runs the game four times slower, to look at effects frame by frame.
 *
 * The interface is drawn as constructivist posters (see `poster.css`) and speaks English, Russian,
 * Japanese or Serbian, picked in the menu and kept for the next visit; `?lang=ja` picks one for a
 * visit, and the address always names the language shown, so a copied link keeps it (see
 * `createKothI18n`).
 */
export default function KothRoute() {
  const address = new URLSearchParams(window.location.search);
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [restarts, setRestarts] = createSignal(0);
  const [showThoughts, setShowThoughts] = createSignal(false);
  const [watching, setWatching] = createSignal(address.has('watch'));
  const [state, setState] = createSignal<HudState>();
  const [thoughts, setThoughts] = createSignal<ThoughtView[]>([]);
  const [callouts, setCallouts] = createSignal<CalloutView[]>([]);
  const [aim, setAim] = createSignal<AimView>();
  const [menu, setMenu] = createSignal(!address.has('watch') && !address.has('class'));
  const [choice, setChoice] = createSignal<{ id: TankClassId; count: number }>();
  const tuning = createTuning();
  const [paused, setPaused] = createSignal(address.has('tune'));
  const [menuPage, setMenuPage] = createSignal<MenuPage>(address.get('tune') === 'classes' ? 'classes' : 'menu');
  const [look, setLook] = createSignal(aimLookFromAddress());
  const i18n = createKothI18n();
  const { t } = i18n;

  loadPosterFont();

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([1-5])$/.exec(event.code);

    // Keys typed into a text box, as a tuning pasted into the class editor, are text; Esc still closes the menu.
    if (event.repeat || (event.target instanceof HTMLTextAreaElement && event.code !== 'Escape')) {
      return;
    }

    if (event.code === 'Escape') {
      // Esc closes the class menu first, as it always has; otherwise it pauses or resumes.
      if (menu() && !paused()) {
        setMenu(false);
      } else {
        setPaused((on) => !on);
      }
    } else if (event.code === 'KeyR') {
      restart();
    } else if (event.code === 'KeyB') {
      setShowThoughts((shown) => !shown);
    } else if (event.code === 'KeyX') {
      setLook((current) => AIM_LOOK_IDS[(AIM_LOOK_IDS.indexOf(current) + 1) % AIM_LOOK_IDS.length]);
    } else if (event.code === 'KeyV') {
      toggleWatching();
    } else if (event.code === 'KeyC' && !watching()) {
      setPaused(false);
      setMenu((open) => !open);
    } else if (digit && !watching() && !paused()) {
      choose(TANK_CLASS_IDS[Number(digit[1]) - 1]);
    }
  });

  return (
    <KothI18nProvider value={i18n}>
      <div class="tk-ui fixed inset-0 overflow-hidden select-none" lang={i18n.language()}>
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
              pace={tuning.pace()}
              paused={paused()}
              onFrame={(frame) => {
                setState(frame.state);
                setThoughts(frame.thoughts);
                setCallouts(frame.callouts);
                setAim(frame.aim);
              }}
            />
          </Rapier2D>
        </GpuCanvas>
        <BotThoughts thoughts={thoughts()} />
        <RadioOverlay callouts={callouts()} />
        <KothHud state={state()} watching={watching()} />
        <AimOverlay
          canvas={canvas()}
          view={aim()}
          player={state()?.player}
          look={look()}
          active={!menu() && !paused() && !watching() && !state()?.capture.winner}
        />
        <MatchResult state={state()} onRestart={restart} />
        <Show when={menu() && !paused() && !watching() && state()}>
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
        <Show when={!paused()}>
          <button class="tk-plaque absolute bottom-3 left-3" onClick={() => setPaused(true)}>
            {t('menu.open')}
          </button>
        </Show>
        <Show when={paused()}>
          <PauseMenu
            tuning={tuning}
            page={menuPage()}
            onPage={setMenuPage}
            playerClass={state()?.player.tankClass}
            look={look()}
            onLook={setLook}
            thoughts={showThoughts()}
            onThoughts={setShowThoughts}
            watching={watching()}
            onResume={() => setPaused(false)}
            onRestart={restart}
            onClass={() => {
              setPaused(false);
              setMenu(true);
            }}
            onWatch={toggleWatching}
          />
        </Show>
      </div>
    </KothI18nProvider>
  );

  /** Starts a new match and plays it. */
  function restart() {
    setRestarts((count) => count + 1);
    setPaused(false);
  }

  /** Hands the player's tank to a bot to watch the match, or takes it back, and plays on. */
  function toggleWatching() {
    setWatching((on) => !on);
    setMenu(false);
    setPaused(false);
  }

  /** Asks the scene for class `id` for the player and closes the menu. */
  function choose(id: TankClassId) {
    setChoice((last) => ({ id, count: (last?.count ?? 0) + 1 }));
    setMenu(false);
  }
}

/**
 * Adds the interface's condensed typeface, Oswald, with its Latin and Cyrillic letters, to the
 * page once. Without the network the interface falls back to the system's narrow faces, and
 * Japanese is always set in the system's gothic (see `poster.css`).
 */
function loadPosterFont() {
  if (document.getElementById(FONT_LINK_ID)) {
    return;
  }

  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;700&display=swap';
  document.head.append(link);
}

const FONT_LINK_ID = 'tanki-poster-font';

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
 * @param pace - The match's pace, read every frame: the game's speed, the zoom it sets when it
 *   changes, the view's lead and slack, and what the match itself works by.
 * @param paused - Holds the match, its effects and the view still; the frame is drawn again as it stands.
 * @param onFrame - Receives the display state after each frame, with the player's aim on screen.
 */
function KothScene(props: {
  canvas: HTMLCanvasElement;
  restarts: number;
  watching: boolean;
  thoughts: boolean;
  choice: { id: TankClassId; count: number } | undefined;
  playerClass: string | null;
  pace: Pace;
  paused: boolean;
  onFrame: (frame: { state: HudState; thoughts: ThoughtView[]; callouts: CalloutView[]; aim: AimView | undefined }) => void;
}) {
  const canvas = untrack(() => props.canvas);
  const rapier = useRapier2D();
  const world = createWorld(rapier, { gravity: { x: 0, y: 0 }, lengthUnit: PIXELS_PER_METER });
  const renderer = createRangeRenderer(useGpuCanvas());
  const first = untrack(() => props.playerClass);
  const playerClass = TANK_CLASS_IDS.find((id) => id === first);
  const match = createKothMatch(rapier, world, renderer, {
    rules: rulesFromAddress(),
    playerClass,
    pace: () => props.pace
  });
  const input = makeArenaInput(canvas);
  const camera = createCamera(match.seat.tank?.hull.translation() ?? { x: 0, y: 0 });
  const lookAhead = createLookAhead();
  let lastTime: number | undefined;
  let pendingStep = 0;
  let seenRestarts = untrack(() => props.restarts);
  let seenChoice = untrack(() => props.choice);
  let watched: number | undefined;
  let zoom = untrack(() => props.pace.zoom);
  let overview = { zoom };
  const scope = createScope();

  camera.zoom = zoom;

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([0-8])$/.exec(event.code);

    if (digit && props.watching && !props.paused) {
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
    const pace = props.pace;
    const dt =
      lastTime === undefined ? 0 : (Math.min((time - lastTime) / 1000, MAX_FRAME_TIME) * pace.speed) / SLOW_MOTION;
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

    // Paused, the wheel and keys read meanwhile are dropped, and the frame is drawn and reported as it stands, without shake.
    if (props.paused) {
      match.draw(camera);
      renderer.render(camera, screen, BACKGROUND, 0);
      props.onFrame({
        state: match.hud(),
        thoughts: props.thoughts && !match.capture.winner ? thoughtsOnScreen(match, camera, screen) : [],
        callouts: match.capture.winner ? [] : calloutsOnScreen(match, camera, screen, props.watching),
        aim: undefined
      });
      return;
    }

    // A new zoom on the pace panel takes over the view; the wheel and +/- zoom on from it.
    if (pace.zoom !== zoom) {
      zoom = pace.zoom;
      camera.zoom = props.watching ? camera.zoom : zoom;
    }

    camera.rotation += controls.turn * VIEW_TURN_SPEED * dt;
    zoomCamera(camera, controls.zoom * Math.exp(controls.zoomKeys * KEY_ZOOM_SPEED * dt));
    const pivot = player && !props.watching ? match.combat.gunPivotOf(player) : undefined;

    // The view goes onto the tank as it stands for the cursor as it is, so the gun aims at the ground the frame shows under the cursor.
    if (pivot) {
      lookAhead.place(camera, screen, pivot, controls.aim, { share: pace.lead, dt: 0, slack: slackOf(pace) });
    }

    const aim = player && pivot ? aimAngle(player, controls.aim, camera, screen, pivot) : undefined;
    const drive = screenToWorldDirection(camera, controls.move);
    const reach =
      player && controls.aim?.kind === 'point'
        ? distanceTo(player.hull.translation(), screenToWorld(camera, controls.aim, screen))
        : undefined;
    const alt = controls.alt && !props.watching;
    pendingStep += dt;

    while (pendingStep >= PHYSICS_STEP) {
      pendingStep -= PHYSICS_STEP;
      match.step(PHYSICS_STEP, { drive, aim, fire: controls.fire && !props.watching, turn: alt, reach });
    }

    match.update(dt);
    placeCamera(screen, dt, controls.aim);
    match.draw(camera);
    const shake = match.shake;
    const view = {
      ...camera,
      x: camera.x + (Math.random() * 2 - 1) * shake,
      y: camera.y + (Math.random() * 2 - 1) * shake
    };
    renderer.render(view, screen, BACKGROUND, dt);
    props.onFrame({
      state: match.hud(),
      thoughts: props.thoughts && !match.capture.winner ? thoughtsOnScreen(match, camera, screen) : [],
      callouts: match.capture.winner ? [] : calloutsOnScreen(match, camera, screen, props.watching),
      aim: props.watching ? undefined : aimOnScreen(match, { angle: aim, reach }, view, screen)
    });
  }

  /**
   * Leads the player's tank toward the aim (see `createLookAhead`), follows a watched tank, or
   * frames the whole map while watching. While the player's casemate gun charges a shot, the view
   * zooms out, as a sniper's scope shows more (see `createScope`). A view with slack zooms about
   * the cursor and gives the tank the scope's wider box, so the ground under a still cursor stays
   * put; a rigid view zooms about the tank, which the lead keeps where it is on the screen, and the
   * ground under a still cursor slides out along the gun's line. Either way the gun keeps its aim.
   */
  function placeCamera(screen: { width: number; height: number }, dt: number, aim: Aim | undefined) {
    const followed = props.watching ? (watched === undefined ? undefined : match.members[watched]) : match.seat;
    const target = followed?.tank?.hull.translation();

    if (props.watching && watched === undefined) {
      scope.reset();
      const fit = Math.min(
        screen.width / (match.map.halfWidth * 2 + 60),
        screen.height / (match.map.halfHeight * 2 + 140)
      );

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
    const scoped = !props.watching && hud.weapon === 'charge' && hud.charge !== undefined;
    const pivot = !props.watching && followed?.tank ? match.combat.gunPivotOf(followed.tank) : undefined;

    // Watching one tank, or waiting to respawn: the view follows as it always has, and the lead starts afresh with the next tank.
    if (!pivot) {
      lookAhead.reset();
      scope.step(
        camera,
        screen,
        target ? worldToScreen(camera, target, screen) : { x: screen.width / 2, y: screen.height / 2 },
        scoped,
        dt
      );

      if (target) {
        followTarget(camera, target, screen, scope.followMargin(DRAG_MARGIN));
      }

      return;
    }

    const anchor = props.pace.slack > 0 && aim?.kind === 'point' ? aim : worldToScreen(camera, pivot, screen);
    scope.step(camera, screen, anchor, scoped, dt);
    lookAhead.place(camera, screen, pivot, aim, { share: props.pace.lead, dt, slack: slackOf(props.pace) });
  }

  /** The view's slack for `pace`, widened while the scope is open; none for a rigid view. */
  function slackOf(pace: Pace) {
    return pace.slack > 0 ? scope.followMargin(pace.slack) : 0;
  }
}

/** Zoom when watching one tank. */
const FOLLOW_ZOOM = 1.6;
const PHYSICS_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;
const VIEW_TURN_SPEED = 1.5;
const KEY_ZOOM_SPEED = 1.5;
const BACKGROUND = [0.302, 0.302, 0.302];

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
function thoughtsOnScreen(
  match: KothMatch,
  camera: ReturnType<typeof createCamera>,
  screen: { width: number; height: number }
): ThoughtView[] {
  const toScreen = (point: { x: number; y: number }) => worldToScreen(camera, point, screen);

  return match.thoughts().map((thought) => {
    const label = toScreen(thought.position);
    const target =
      thought.target && match.combat.armorOf(thought.target) ? toScreen(thought.target.hull.translation()) : undefined;

    return {
      id: thought.member.id,
      team: thought.member.team,
      name: thought.member.name,
      role: thought.member.role,
      goal: thought.goal ?? '',
      action: thought.breach
        ? `${thought.action ?? ''} · breach: ${thought.breach.method} ${thought.breach.phase}`
        : (thought.action ?? ''),
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

/**
 * What the bots say on the radio, placed on screen: the player's team's lines, or both teams'
 * while watching. A bubble fades over its last `BUBBLE_FADE` s and a marker over its last
 * `MARKER_FADE` s; a marker off the screen is held `EDGE_INSET` px inside its edge.
 */
function calloutsOnScreen(
  match: KothMatch,
  camera: ReturnType<typeof createCamera>,
  screen: { width: number; height: number },
  watching: boolean
): CalloutView[] {
  const now = match.time;
  const team = match.seat.team;

  return match
    .callouts()
    .filter((callout) => watching || callout.team === team)
    .map((callout) => {
      const said = now - callout.at;
      const speaker = callout.speaker && said < BUBBLE_TIME ? worldToScreen(camera, callout.speaker, screen) : undefined;
      const marker = callout.marker && worldToScreen(camera, callout.marker, screen);
      const held = marker && {
        x: Math.min(Math.max(marker.x, EDGE_INSET), screen.width - EDGE_INSET),
        y: Math.min(Math.max(marker.y, EDGE_INSET), screen.height - EDGE_INSET)
      };
      const off = marker && held && (held.x !== marker.x || held.y !== marker.y);

      return {
        id: callout.id,
        team: callout.team,
        line: callout.line,
        seat: callout.seat,
        tankClass: callout.tankClass,
        ally: callout.ally,
        lane: callout.lane,
        seconds: callout.seconds,
        bubble: speaker && { x: speaker.x, y: speaker.y, opacity: Math.min((BUBBLE_TIME - said) / BUBBLE_FADE, 1) },
        marker:
          callout.marker && held
            ? {
                ...held,
                kind: callout.marker.kind,
                opacity: Math.min((callout.until - now) / MARKER_FADE, 1),
                edge: off ? Math.atan2(marker.y - screen.height / 2, marker.x - screen.width / 2) : undefined
              }
            : undefined
      };
    });
}

const BUBBLE_FADE = 0.4;
const MARKER_FADE = 0.8;
const EDGE_INSET = 28;

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
