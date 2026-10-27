import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createMemo, createSignal, onCleanup, onSettled, Show, untrack } from 'solid-js';
import { aimAngle } from '../arena/aim';
import {
  createCamera,
  DRAG_MARGIN,
  followTarget,
  screenToWorld,
  screenToWorldDirection,
  worldToScreen,
  zoomCamera,
  type Camera
} from '../arena/camera';
import { makeArenaInput, type Aim } from '../arena/input';
import { createLookAhead } from '../arena/lookahead';
import { createRangeRenderer } from '../damage/renderer';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { AIM_LOOK_IDS, aimLookFromAddress, aimOnScreen, AimOverlay, type AimView } from './AimOverlay';
import { ClassMenu } from './classes/ClassMenu';
import type { ClassTuning } from './classes/knobs';
import { createScope } from './classes/scope';
import { BotThoughts, KillCamOverlay, KothHud, MatchResult, RevengeBanner, RevengeMark, type HudState, type ThoughtView } from './Hud';
import { createKothI18n, KothI18nProvider } from './i18n/i18n';
import type { KothKill, KothMatch, SeatHud } from './match';
import type { Pace } from './pace';
import { calloutsOnScreen, fitCanvas, thoughtsOnScreen } from './onScreen';
import { PauseMenu, type MenuPage } from './PauseMenu';
import { RadioOverlay, type CalloutView } from './RadioOverlay';
import { loadRecording, readRecordingFile, type OpenResult } from './openRecording';
import { createRecordedMatch, matchPaceOf, newSeed, STEP, type Recording } from './recording';
import { createKillCam, type KillCamKill, type KillCamView } from './killCam';
import { createTapeRecorder, type Tape } from './tape';
import { ReplayView } from './ReplayView';
import { bestKills, type Highlight } from './highlights';
import { saveRecording, type SaveState } from './saveRecording';
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
 * Every match is recorded as it is played (see `createRecordedMatch`) and saved from the result
 * screen or the menu, and taped as it is drawn (see `createTapeRecorder`). When the player's tank
 * is destroyed, a kill-cam shows from the tape how it went, unless switched off in the menu. The
 * result screen lists the match's best kills to watch (see `bestKills`) and plays the whole match
 * again, both from its tape, and the menu's
 * recordings page opens it or another recording, of the dev server's folder or from a file, as
 * does a file dropped onto the game (see `ReplayView`). `?replay=<file>` opens one of the dev
 * server's recordings, and `&t=95` from its 95th second.
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
  const [menu, setMenu] = createSignal(!address.has('watch') && !address.has('class') && !address.has('replay'));
  const [choice, setChoice] = createSignal<{ id: TankClassId; count: number }>();
  const tuning = createTuning();
  const [paused, setPaused] = createSignal(address.has('tune'));
  const [menuPage, setMenuPage] = createSignal<MenuPage>(address.get('tune') === 'classes' ? 'classes' : 'menu');
  const [look, setLook] = createSignal(aimLookFromAddress());
  const i18n = createKothI18n();
  const [saved, setSaved] = createSignal<SaveState>();
  const [replay, setReplay] = createSignal<{ recording: Recording; tape?: Tape; start: number; follow?: number }>();
  const [notice, setNotice] = createSignal<string>();
  const [killCam, setKillCam] = createSignal(readKillCam());
  const [killCamView, setKillCamView] = createSignal<KillCamView>();
  const [revenge, setRevenge] = createSignal<{ mark: { x: number; y: number; edge: number | undefined } | undefined; at: number | undefined }>();
  let takeRecording: (() => { recording: Recording; tape: Tape }) | undefined;
  // The match's best kills, once it is won; found once, not with every frame's state.
  const winner = createMemo(() => state()?.capture.winner);
  const highlights = createMemo(() => {
    if (!winner() || !takeRecording) {
      return [];
    }

    const { chronicle } = untrack(() => takeRecording!().recording);
    const seatOf = (id: number) => {
      const member = chronicle.members.find((entry) => entry.id === id)!;
      return { name: member.name, team: member.team, seat: member.seat, player: member.human, human: member.human };
    };
    return bestKills(chronicle).map((kill) => ({ kill, killer: seatOf(kill.killer), victim: seatOf(kill.victim) }));
  });
  const { t } = i18n;

  loadPosterFont();
  openFromAddress();

  // A recording dropped anywhere on the game opens to watch.
  makeEventListener(window, 'dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
    }
  });

  makeEventListener(window, 'drop', async (event) => {
    const file = event.dataTransfer?.files[0];

    if (file) {
      event.preventDefault();
      openReplay(await readRecordingFile(file), false);
    }
  });

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([1-5])$/.exec(event.code);

    // Keys typed into a text box, as a tuning pasted into the class editor, are text; Esc still closes the menu. The replay has keys of its own.
    if (replay() || event.repeat || (event.target instanceof HTMLTextAreaElement && event.code !== 'Escape')) {
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
        <Show
          when={replay()}
          keyed
          fallback={
            <>
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
                  classes={tuning.classes()}
                  onRecorder={(take) => (takeRecording = take)}
                  paused={paused()}
                  killCam={killCam()}
                  onFrame={(frame) => {
                    setState(frame.state);
                    setThoughts(frame.thoughts);
                    setCallouts(frame.callouts);
                    setAim(frame.aim);
                    setKillCamView(frame.killCam);
                    setRevenge(frame.revenge);
                  }}
                />
              </Rapier2D>
            </GpuCanvas>
            <BotThoughts thoughts={thoughts()} />
            <RadioOverlay callouts={callouts()} />
            <KothHud state={killCamView() ? undefined : state()} watching={watching()} />
            <RevengeMark mark={killCamView() ? undefined : revenge()?.mark} />
            <RevengeBanner at={revenge()?.at} />
            <KillCamOverlay view={killCamView()} respawn={state()?.player} />
            <AimOverlay
              canvas={canvas()}
              view={aim()}
              player={state()?.player}
              look={look()}
              active={!menu() && !paused() && !watching() && !state()?.capture.winner && !killCamView()}
            />
            <MatchResult
              state={state()}
              saved={saved()}
              onSave={save}
              onRestart={restart}
              onWatch={watchThis}
              highlights={highlights()}
              onHighlight={watchHighlight}
            />
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
                saved={saved()}
                onSave={save}
                onOpenRecording={(opened, fromFolder) => openReplay(opened, fromFolder)}
                onWatchReplay={watchThis}
                killCam={killCam()}
                onKillCam={(on) => {
                  setKillCam(on);
                  keepKillCam(on);
                }}
              />
            </Show>
            </>
          }
        >
          {(opened) => <ReplayView recording={opened.recording} tape={opened.tape} start={opened.start} follow={opened.follow} onExit={exitReplay} />}
        </Show>
        <Show when={notice()}>
          {(text) => (
            <button class="tk-tag absolute top-3 left-1/2 -translate-x-1/2" onClick={() => setNotice(undefined)}>
              {text()}
            </button>
          )}
        </Show>
      </div>
    </KothI18nProvider>
  );

  /** Starts a new match and plays it. */
  function restart() {
    setSaved(undefined);
    setRestarts((count) => count + 1);
    setPaused(false);
  }

  /** Saves the match's recording so far (see `saveRecording`), once a save is not under way. */
  async function save() {
    if (!takeRecording || saved()?.kind === 'saving') {
      return;
    }

    setSaved({ kind: 'saving' });
    setSaved(await saveRecording(takeRecording().recording));
  }

  /**
   * Watches `opened` from its start, or from the second in `?t=`, leaving the match played; a
   * recording of the dev server's folder is named in the address as `?replay=`, so a reload or a
   * link opens it again. One that did not open is told of.
   */
  function openReplay(opened: OpenResult, fromFolder: boolean, start = 0, extra: { tape?: Tape; follow?: number } = {}) {
    if (opened.kind === 'failed') {
      setNotice(t('replay.failed', opened.reason));
      return;
    }

    setNotice(undefined);
    setPaused(false);
    setMenu(false);
    setReplay({ recording: opened.recording, start, ...extra });
    setAddress({ replay: fromFolder ? opened.name : undefined, t: undefined });
  }

  /** Watches the match being played from its start, from the tape it was played on. */
  function watchThis() {
    if (takeRecording) {
      const { recording, tape } = takeRecording();
      openReplay({ kind: 'opened', recording, name: '' }, false, 0, { tape });
    }
  }

  /** Watches one of the match's best kills from a few seconds before, following its killer. */
  function watchHighlight(kill: Highlight) {
    if (takeRecording) {
      const { recording, tape } = takeRecording();
      openReplay({ kind: 'opened', recording, name: '' }, false, Math.max(kill.step - HIGHLIGHT_LEAD * 60, 0), { tape, follow: kill.killer });
    }
  }

  /** Leaves the replay for a new match. */
  function exitReplay() {
    setReplay(undefined);
    setAddress({ replay: undefined, t: undefined });
  }

  /** Opens the recording `?replay=` names in the dev server's folder, from the second `?t=` gives. */
  async function openFromAddress() {
    const name = address.get('replay');

    if (name) {
      openReplay(await loadRecording(name), true, Math.max(Number(address.get('t')) || 0, 0) * 60);
    }
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

/**
 * Runs the match on the canvas's GPU: input, fixed 60 Hz physics steps, the camera and drawing,
 * and reports the display state every frame. The match is recorded as it is played (see
 * `createRecordedMatch`) and taped as it is drawn (see `createTapeRecorder`); every match, the
 * first and each restart, gets a physics world and a tape of its own and a new seed, so its
 * recording plays it again from nothing. `?seed=` in the address gives the first match that seed,
 * to play a recorded match's beginning again.
 *
 * @param restarts - Starts a new match whenever it changes after mount.
 * @param watching - The player's seat is driven by a bot and the camera shows the whole map, or follows a chosen tank.
 * @param thoughts - Reports what each bot thinks, placed on screen, with every frame.
 * @param choice - The class the player asked for last, handed to the match whenever it changes after mount.
 * @param playerClass - The player's first class, read once; anything but a class id means the Soldier.
 * @param pace - The match's pace, read every frame: the game's speed, the zoom it sets when it
 *   changes, the view's lead and slack, and what the match itself works by.
 * @param classes - The classes' tuning, handed to the match whenever it changes (see `ClassTuning`).
 * @param paused - Holds the match, its effects and the view still; the frame is drawn again as it stands.
 * @param killCam - Whether the player's tank going shows a kill-cam: `KILL_CAM_DELAY` s of the
 *   match later, a short film of how it went, from the match's tape (see `createKillCam`), while
 *   the match goes on unseen; the tank coming back, any key or click
 *   ends it. `onFrame` tells what to show over it. Whatever this says, the tank that destroyed the
 *   player's is marked for revenge until the player destroys it, which `onFrame` tells as well.
 * @param onRecorder - Receives, for every new match, the function that takes its recording and tape so far.
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
  classes: ClassTuning;
  paused: boolean;
  killCam: boolean;
  onRecorder: (take: () => { recording: Recording; tape: Tape }) => void;
  onFrame: (frame: {
    state: HudState;
    thoughts: ThoughtView[];
    callouts: CalloutView[];
    aim: AimView | undefined;
    killCam: KillCamView | undefined;
    /** The revenge mark on screen while the player has a tank, and when the player last took revenge, by `performance.now()`. */
    revenge: { mark: { x: number; y: number; edge: number | undefined } | undefined; at: number | undefined };
  }) => void;
}) {
  const canvas = untrack(() => props.canvas);
  const rapier = useRapier2D();
  const renderer = createRangeRenderer(useGpuCanvas());
  const first = untrack(() => props.playerClass);
  let recorder = createTapeRecorder(renderer);
  let killCam: KillCam | undefined;
  /** The member who last destroyed the player's tank, until the player destroys it. */
  let nemesis: KothMatch['members'][number] | undefined;
  /** When the player last destroyed its nemesis, by `performance.now()`. */
  let revengeAt: number | undefined;
  let recorded = startMatch(TANK_CLASS_IDS.find((id) => id === first) ?? 'soldier', seedFromAddress() ?? newSeed());
  let match = recorded.match;
  const input = makeArenaInput(canvas);
  const camera = createCamera(match.seat.tank?.hull.translation() ?? { x: 0, y: 0 });
  const lookAhead = createLookAhead();
  const mapBounds = {
    minX: -match.map.halfWidth,
    minY: -match.map.halfHeight,
    maxX: match.map.halfWidth,
    maxY: match.map.halfHeight
  };
  let lastTime: number | undefined;
  let pendingStep = 0;
  let seenRestarts = untrack(() => props.restarts);
  let seenChoice = untrack(() => props.choice);
  let watched: number | undefined;
  let zoom = untrack(() => props.pace.zoom);
  let overview = { zoom };
  const scope = createScope();

  camera.zoom = zoom;

  // Any key or click skips the kill-cam.
  makeEventListener(window, 'pointerdown', () => killCam?.film && endKillCam());

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([0-8])$/.exec(event.code);

    if (killCam?.film && event.code !== 'Escape') {
      endKillCam();
    }

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
  onCleanup(() => recorded.dispose());

  return null;

  /** Starts a recorded match of `playerClass` for the player, on seed `seed`, at the pace and with the classes' tuning set now. */
  function startMatch(playerClass: TankClassId, seed: number) {
    const tape = recorder.tape;
    const started = untrack(() =>
      createRecordedMatch(
        rapier,
        recorder.renderer,
        {
          seed,
          human: true,
          playerClass,
          rules: rulesFromAddress(),
          pace: matchPaceOf(props.pace),
          classes: props.classes
        },
        { onKill: noticeKill }
      )
    );
    props.onRecorder(() => ({ recording: started.recording(), tape }));
    return started;
  }

  /**
   * Readies the kill-cam when the player's own tank is destroyed, if it is on, to begin
   * `KILL_CAM_DELAY` s of the match later; marks the killer for revenge, and takes it when the
   * player destroys that member.
   */
  function noticeKill(kill: KothKill) {
    const seat = match.seat;

    if (nemesis && kill.victim === nemesis && kill.killer === seat) {
      nemesis = undefined;
      revengeAt = performance.now();
    }

    if (kill.victim !== seat || !seat.human) {
      return;
    }

    nemesis = kill.killer && kill.killer.team !== seat.team ? kill.killer : nemesis;

    if (!props.killCam) {
      return;
    }

    killCam = {
      kill: {
        death: recorded.steps,
        killer: kill.killer ? match.members.indexOf(kill.killer) : undefined,
        victim: match.members.indexOf(seat),
        at: { x: kill.at.x, y: kill.at.y },
        begin: recorded.steps + KILL_CAM_DELAY * 60
      },
      who: { killer: kill.killer && seatOf(kill.killer), tankClass: kill.killerClass },
      film: undefined
    };
  }

  /** Ends the kill-cam: the match is drawn live again, with its fields as they are now. */
  function endKillCam() {
    if (killCam?.film) {
      recorder.resume();
    }

    killCam = undefined;
    lookAhead.reset();
  }

  /** Where the revenge mark goes on screen, held inside its edge with the way to the tank when off it; none while the player has no tank. */
  function revengeMark(view: Camera, screen: { width: number; height: number }) {
    const at = nemesis?.tank?.hull.translation();

    if (!at || !match.seat.tank || props.watching) {
      return undefined;
    }

    const point = worldToScreen(view, at, screen);
    const held = {
      x: Math.min(Math.max(point.x, REVENGE_INSET), screen.width - REVENGE_INSET),
      y: Math.min(Math.max(point.y - REVENGE_ABOVE * view.zoom, REVENGE_INSET), screen.height - REVENGE_INSET)
    };
    const off = held.x !== point.x || point.y < REVENGE_INSET || point.y > screen.height - REVENGE_INSET;
    return { ...held, edge: off ? Math.atan2(point.y - screen.height / 2, point.x - screen.width / 2) : undefined };
  }

  /** The seat of `member`, as the display names it. */
  function seatOf(member: KothMatch['members'][number]): SeatHud {
    return { name: member.name, team: member.team, seat: member.index, player: member === match.seat, human: member.human };
  }

  /**
   * Drops the match, with its world and the renderer's fields, and starts a new one on a new
   * seed, the player keeping the class it has or asked for.
   */
  function restart() {
    const playerClass = match.seat.nextClass ?? match.seat.tankClass.id;
    recorded.dispose();
    renderer.releaseAllFields();
    killCam = undefined;
    nemesis = undefined;
    recorder = createTapeRecorder(renderer);
    recorded = startMatch(playerClass, newSeed());
    match = recorded.match;
    const spawn = match.seat.tank?.hull.translation();

    if (spawn) {
      camera.x = spawn.x;
      camera.y = spawn.y;
    }

    lookAhead.reset();
  }

  /** Reads input, steps the match, places the camera, draws and reports one frame. */
  function frame(time: number) {
    const pace = props.pace;
    const wall = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_TIME);
    const dt = (wall * pace.speed) / SLOW_MOTION;
    lastTime = time;

    if (props.restarts !== seenRestarts) {
      seenRestarts = props.restarts;
      restart();
    }

    if (props.choice !== seenChoice) {
      seenChoice = props.choice;

      if (seenChoice) {
        recorded.chooseClass(seenChoice.id);
      }
    }

    recorded.watch(props.watching);
    recorded.setPace(props.pace);
    recorded.setClasses(props.classes);

    const screen = fitCanvas(canvas);
    const controls = input.read();
    const player = match.player;

    // Paused, the wheel and keys read meanwhile are dropped, and the frame is drawn and reported as it stands, without shake.
    if (props.paused) {
      match.draw(camera);
      recorder.endFrame(recorded.steps, match);
      const film = killCam?.film?.frame(0, screen, BACKGROUND);

      if (!film) {
        renderer.render(camera, screen, BACKGROUND, 0);
      }

      props.onFrame({
        state: match.hud(),
        thoughts: props.thoughts && !match.capture.winner && !film ? thoughtsOnScreen(match, camera, screen) : [],
        callouts: match.capture.winner || film ? [] : calloutsOnScreen(match, camera, screen, props.watching),
        aim: undefined,
        killCam: film,
        revenge: { mark: revengeMark(camera, screen), at: revengeAt }
      });
      return;
    }

    // The player's tank is back: whatever is left of the kill-cam gives way to the match.
    if (killCam && match.seat.tank) {
      endKillCam();
    }

    // The kill-cam begins, a moment after the tank went: the match goes on, taped, while the film shows how.
    if (killCam && !killCam.film && recorded.steps >= killCam.kill.begin) {
      killCam.kill.begin = recorded.steps;
      killCam.film = createKillCam(renderer, recorder.tape, recorded.chronicle, killCam.kill, killCam.who, camera);
      recorder.mute();
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
      lookAhead.place(camera, screen, pivot, controls.aim, { share: pace.lead, dt: 0, slack: slackOf(pace), bounds: mapBounds });
    }

    const aim = player && pivot ? aimAngle(player, controls.aim, camera, screen, pivot) : undefined;
    const drive = screenToWorldDirection(camera, controls.move);
    const reach =
      player && controls.aim?.kind === 'point'
        ? distanceTo(player.hull.translation(), screenToWorld(camera, controls.aim, screen))
        : undefined;
    const alt = controls.alt && !props.watching;
    pendingStep += dt;

    while (pendingStep >= STEP) {
      pendingStep -= STEP;
      recorded.step({ drive, aim, fire: controls.fire && !props.watching, turn: alt, reach });
    }

    match.update(dt);
    placeCamera(screen, dt, controls.aim);
    match.draw(camera);
    recorder.endFrame(recorded.steps, match);

    const film = killCam?.film?.frame(wall, screen, BACKGROUND);

    if (film) {
      props.onFrame({ state: match.hud(), thoughts: [], callouts: [], aim: undefined, killCam: film, revenge: { mark: undefined, at: revengeAt } });
      return;
    }

    if (killCam?.film) {
      endKillCam();
    }

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
      aim: props.watching ? undefined : aimOnScreen(match, { angle: aim, reach }, view, screen),
      killCam: undefined,
      revenge: { mark: revengeMark(view, screen), at: revengeAt }
    });
  }

  /**
   * Leads the player's tank toward the aim (see `createLookAhead`), follows a watched tank, or
   * frames the whole map while watching. While the player's casemate gun charges a shot, the view
   * zooms out, as a sniper's scope shows more (see `createScope`), about the tank, which keeps
   * its place on the screen: the ground under a still cursor slides out along the gun's line, and
   * the gun keeps its aim. Zooming about the cursor instead threw the tank toward the cursor and
   * showed the empty ground behind it. A view with slack gives the tank the scope's wider box.
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

    scope.step(camera, screen, worldToScreen(camera, pivot, screen), scoped, dt);
    lookAhead.place(camera, screen, pivot, aim, { share: props.pace.lead, dt, slack: slackOf(props.pace), bounds: mapBounds });
  }

  /** The view's slack for `pace`, widened while the scope is open; none for a rigid view. */
  function slackOf(pace: Pace) {
    return pace.slack > 0 ? scope.followMargin(pace.slack) : 0;
  }
}

/** Zoom when watching one tank. */
const FOLLOW_ZOOM = 1.6;

/** The kill-cam: the kill and who made it, the step it begins at, and its film once it has (see `createKillCam`). */
type KillCam = {
  kill: KillCamKill;
  who: Parameters<typeof createKillCam>[4];
  film: ReturnType<typeof createKillCam> | undefined;
};

/** Seconds of the match after the player's tank went that the kill-cam begins. */
const KILL_CAM_DELAY = 1.5;
/** How far inside the screen's edges the revenge mark is held, and how far over its tank it floats, in screen and world px. */
const REVENGE_INSET = 40;
const REVENGE_ABOVE = 34;
const MAX_FRAME_TIME = 0.1;
const VIEW_TURN_SPEED = 1.5;
const KEY_ZOOM_SPEED = 1.5;
const BACKGROUND = [0.302, 0.302, 0.302];

function distanceTo(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Seconds of a best kill shown before it. */
const HIGHLIGHT_LEAD = 3;

/** Whether the kill-cam is on, as last kept; on at first. */
function readKillCam() {
  try {
    return localStorage.getItem(KILL_CAM_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Keeps whether the kill-cam is on for the next visit; a blocked storage only forgets it. */
function keepKillCam(on: boolean) {
  try {
    localStorage.setItem(KILL_CAM_KEY, on ? 'on' : 'off');
  } catch {
    // Kept for this visit only.
  }
}

const KILL_CAM_KEY = 'tanki.killCam';

/** Sets or, for `undefined`, removes the address's parameters in `changes`, without a new history entry. */
function setAddress(changes: Record<string, string | undefined>) {
  const url = new URL(window.location.href);

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }

  history.replaceState(history.state, '', url);
}

/** How many times slower than real time the game runs, from `?slow=` in the address. */
const SLOW_MOTION = Math.max(Number(new URLSearchParams(window.location.search).get('slow')) || 1, 1);

/** The seed from `?seed=` in the address, a whole number from 1 to 2147483646, if any. */
function seedFromAddress() {
  const seed = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(seed) && seed >= 1 && seed < 2147483647 ? seed : undefined;
}

/** Capture rules with the hold time from `?hold=` in the address, in seconds, for short matches. */
function rulesFromAddress() {
  const hold = Number(new URLSearchParams(window.location.search).get('hold'));
  return hold > 0 ? { ...CAPTURE_RULES, holdTime: hold } : CAPTURE_RULES;
}

