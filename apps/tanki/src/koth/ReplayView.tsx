import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createDockState, Dock } from 'solid-dock';
import { createMemo, createSignal, createStore, For, onCleanup, onSettled, Show, untrack } from 'solid-js';
import { createCamera, screenToWorld, worldToScreen, zoomCamera } from '../arena/camera';
import { createRangeRenderer } from '../damage/renderer';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { DEFAULT_LAYERS, drawDebug, reportMember, type DebugLayer, type MemberReport } from './botDebug';
import { BotPanel } from './BotPanel';
import { BotThoughts, KothHud, type HudState, type ThoughtView } from './Hud';
import { useKothI18n } from './i18n/i18n';
import { calloutsAt, fitCanvas, thoughtsOnScreen } from './onScreen';
import './poster.css';
import { RadioOverlay, type CalloutView } from './RadioOverlay';
import type { Recording } from './recording';
import { createNullRenderer } from '../damage/nullRenderer';
import { createReplayPlayer, createTapeBuilder } from './replayPlayer';
import { createTapePlayer, type Tape } from './tape';
import type { TeamId } from './rules';
import { TimelinePanel } from './TimelinePanel';
import { timelineOf } from './timeline';

/**
 * Watching a recorded match: a dock of three panels, the arena, where the match is played again
 * (see `createReplayPlayer`), its timeline below (see `TimelinePanel`) and the bot panel beside
 * them (see `BotPanel`), with tabs that drag to another side and sashes between them that resize
 * them. Over the arena, the debug view draws what the picked member and its team have in mind,
 * layer by layer as the bot panel switches them (see `drawDebug`).
 *
 * The view starts on the whole map. Clicking a tank picks it and follows it, as 1-8 do for the
 * members in the timeline's order; dragging moves the view freely and the wheel zooms about the
 * pointer; 0 or Esc shows the whole map again, F follows the tank picked again. The picked tank is
 * ringed, its bot's thoughts are shown over it and its track is lit; B shows every bot's
 * thoughts. Space plays or holds the match, the arrows go 5 s back or on, `,` and `.` a step.
 * Played to its end, the match holds, and playing it again starts it over.
 *
 * @param recording - The match; a new one needs a new view.
 * @param tape - The match's tape, if it was taped as it was played; otherwise it is built as the view opens.
 * @param start - The step to start from.
 * @param follow - The member to pick and follow from the start, if any.
 * @param onExit - Called when the player asks to go back to the game.
 */
export function ReplayView(props: { recording: Recording; tape?: Tape; start: number; follow?: number; onExit: () => void }) {
  const { t } = useKothI18n();
  const [layout, setLayout] = createStore(createDockState({ row: [{ column: [{ group: ['arena'] }, { group: ['timeline'] }], sizes: [68, 32] }, { group: ['bot'] }], sizes: [74, 26] }));
  const timeline = createMemo(() => timelineOf(props.recording.chronicle, props.recording.steps));
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [overlay, setOverlay] = createSignal<HTMLCanvasElement>();
  const [layers, setLayers] = createSignal<ReadonlySet<DebugLayer>>(new Set(DEFAULT_LAYERS));
  const [playing, setPlaying] = createSignal(true);
  const [speed, setSpeed] = createSignal(1);
  const [slowKills, setSlowKills] = createSignal(true);
  const [frame, setFrame] = createSignal<ReplayFrame>();
  const [selected, setSelected] = createSignal<number | undefined>(untrack(() => props.follow));
  const [view, setView] = createSignal<ViewMode>(untrack(() => props.follow) === undefined ? 'overview' : 'follow');
  const [allThoughts, setAllThoughts] = createSignal(false);
  let seeker: ((step: number) => void) | undefined;
  const step = () => frame()?.step ?? untrack(() => props.start);

  makeEventListener(window, 'keydown', (event) => {
    const digit = /^Digit([0-8])$/.exec(event.code);

    if (event.repeat && event.code !== 'Period' && event.code !== 'Comma') {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      play(!playing());
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      seek(step() + (event.code === 'ArrowLeft' ? -300 : 300));
    } else if (event.code === 'Comma' || event.code === 'Period') {
      setPlaying(false);
      seek(step() + (event.code === 'Comma' ? -1 : 1));
    } else if (digit && digit[1] === '0') {
      overview();
    } else if (digit) {
      const member = timeline().tracks[Number(digit[1]) - 1];

      if (member) {
        pick(member.id);
      }
    } else if (event.code === 'Escape') {
      overview();
    } else if (event.code === 'KeyF' && selected() !== undefined) {
      setView((current) => (current === 'follow' ? 'free' : 'follow'));
    } else if (event.code === 'KeyB') {
      setAllThoughts((shown) => !shown);
    }
  });

  return (
    <Dock.Root
      state={layout}
      setState={setLayout}
      minPaneSize={96}
      class="bg-[#141414] [--dock-gap:4px]"
      style={{ position: 'absolute', inset: '0' }}
      panels={
        <>
          <Dock.Panel id="arena" title={t('replay.arena')}>
            <div class="relative h-full w-full overflow-hidden bg-[#4d4d4d]">
              <canvas ref={setCanvas} class="block h-full w-full touch-none" />
              <canvas ref={setOverlay} class="pointer-events-none absolute inset-0 h-full w-full" />
              <GpuCanvas
                canvas={canvas()}
                requiredBufferBytes={64 * 1024 * 1024}
                error={(error) => <p class="absolute inset-0 m-0 grid place-items-center text-white">{error.message}</p>}
              >
                <Rapier2D>
                  <ReplayScene
                    canvas={canvas()!}
                    overlay={overlay()}
                    layers={layers()}
                    recording={props.recording}
                    tape={props.tape}
                    start={props.start}
                    playing={playing()}
                    speed={speed()}
                    slowKills={slowKills()}
                    selected={selected()}
                    view={view()}
                    allThoughts={allThoughts()}
                    onSeeker={(seek) => (seeker = seek)}
                    onView={setView}
                    onPick={(member) => (member === undefined ? setSelected(undefined) : pick(member))}
                    onFrame={(next) => {
                      setFrame(next);

                      if (next.done) {
                        setPlaying(false);
                      }
                    }}
                  />
                </Rapier2D>
              </GpuCanvas>
              <BotThoughts thoughts={frame()?.thoughts ?? []} />
              <RadioOverlay callouts={frame()?.callouts ?? []} />
              <KothHud state={frame()?.state} watching />
              <Show when={frame()?.selection}>
                {(ring) => (
                  <svg class="pointer-events-none absolute inset-0 h-full w-full">
                    <circle cx={ring().x} cy={ring().y} r={ring().radius} fill="none" stroke={TEAM_RING[ring().team]} stroke-width="3" stroke-dasharray="7 5" />
                  </svg>
                )}
              </Show>
              <Show when={frame()?.building || frame()?.syncing}>
                <div class="tk-tag pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
                  {frame()?.building ? t('replay.building', Math.floor((100 * frame()!.available) / props.recording.steps)) : t('replay.syncing')}
                </div>
              </Show>
            </div>
          </Dock.Panel>
          <Dock.Panel id="bot" title={t('debug.title')}>
            <BotPanel report={frame()?.report} layers={layers()} onLayers={setLayers} />
          </Dock.Panel>
          <Dock.Panel id="timeline" title={t('replay.timeline')}>
            <TimelinePanel
              timeline={timeline()}
              step={step()}
              available={frame()?.available ?? 0}
              diverged={frame()?.diverged}
              playing={playing()}
              speed={speed()}
              slowKills={slowKills()}
              onSlowKills={setSlowKills}
              selected={selected()}
              onPlaying={play}
              onSpeed={setSpeed}
              onSeek={seek}
              onSelect={pick}
              onExit={() => props.onExit()}
            />
          </Dock.Panel>
        </>
      }
    >
      <Dock.Windows>
        {(group) => (
          <section {...group.props} class={['tk-dock-window', { 'opacity-60': group.dragging() }]}>
            <div ref={group.tabListRef} class="tk-dock-tabs" role="tablist">
              <For each={group.panels()}>
                {(panelId) => (
                  <Dock.Tab id={panelId}>
                    {(tab) => (
                      <div {...tab.props} class={['tk-dock-tab', { 'tk-on': tab.active(), 'opacity-40': tab.dragging() }]}>
                        {tab.title()}
                      </div>
                    )}
                  </Dock.Tab>
                )}
              </For>
            </div>
            <div ref={group.contentRef} class="min-h-0 flex-1" />
          </section>
        )}
      </Dock.Windows>
      <Dock.Sashes>
        {(sash) => (
          <div
            {...sash.props}
            class={['tk-dock-sash outline-none', sash.direction() === 'row' ? 'cursor-col-resize' : 'cursor-row-resize', { 'tk-on': sash.dragging() }]}
          />
        )}
      </Dock.Sashes>
      <Dock.Panels>
        {(panel) => (
          <div style={panel.style()} class="overflow-hidden">
            {panel.content}
          </div>
        )}
      </Dock.Panels>
      <Dock.DropIndicator class="bg-[#f2c418]/25 ring-2 ring-[#f2c418] ring-inset" />
    </Dock.Root>
  );

  /** Plays the match on or holds it; played to its end, it starts over. */
  function play(on: boolean) {
    const current = frame();

    if (on && current?.done) {
      seek(0);
    }

    setPlaying(on);
  }

  function seek(target: number) {
    seeker?.(target);
  }

  /** Picks member `member` and follows its tank. */
  function pick(member: number) {
    setSelected(member);
    setView('follow');
  }

  /** Shows the whole map, nothing picked. */
  function overview() {
    setSelected(undefined);
    setView('overview');
  }
}

/** How the replay's view moves: framing the whole map, following the tank picked, or where the player put it. */
type ViewMode = 'overview' | 'follow' | 'free';

/**
 * What a frame of the replay shows, besides the arena: the step shown, the last step on the tape,
 * whether the tape is still being built, whether the match was shown to its end, the second it
 * plays differently from on this game code, if it does, and whether the second run is not at the
 * step shown yet, so the bots' minds do not show.
 */
type ReplayFrame = {
  step: number;
  available: number;
  building: boolean;
  done: boolean;
  diverged: number | undefined;
  syncing: boolean;
  state: HudState | undefined;
  thoughts: ThoughtView[];
  callouts: CalloutView[];
  /** The ring about the picked tank, on screen, while it lives. */
  selection: { x: number; y: number; radius: number; team: TeamId } | undefined;
  /** What the picked member has in mind (see `reportMember`). */
  report: MemberReport | undefined;
};

/**
 * Shows the recorded match on the canvas's GPU from its tape (see `createTapePlayer`), at any
 * moment at once and smoothly between steps; places the view and draws; and reports what the
 * frame shows. A recording opened without a tape has its tape built meanwhile (see
 * `createTapeBuilder`), and the moments not built yet wait. The bots' minds are not on the tape:
 * a second run of the match without a GPU follows the moment shown (see `createReplayPlayer`),
 * and the bots' thoughts, the radio, the debug view and the bot panel show once it is there.
 *
 * Dragging on the canvas moves the view, the wheel zooms it about the pointer, a click picks the
 * tank under it or none.
 *
 * @param overlay - A 2D canvas over the arena's, where the debug view's `layers` are drawn for the picked member (see `drawDebug`).
 * @param recording - Read once.
 * @param tape - The match's tape, if it was taped as it was played; read once.
 * @param start - The step to start from, read once.
 * @param playing - Whether the match plays on; held, it is drawn as it stands.
 * @param speed - How many times faster than real time the match plays.
 * @param slowKills - Slows the match to `KILL_SLOW` about every kill of the picked member, or of
 *   anyone with none picked, from `KILL_BEFORE` s before it to `KILL_AFTER` s after.
 * @param selected - The member picked: its tank is ringed and its bot's thoughts shown.
 * @param view - How the view moves; it turns `free` by `onView` once the player moves it.
 * @param allThoughts - Shows every bot's thoughts, not only the picked one's.
 * @param onSeeker - Receives the function that takes the match to a step, at once.
 * @param onPick - Receives the member whose tank was clicked, or `undefined` for a click beside every tank.
 */
function ReplayScene(props: {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement | undefined;
  layers: ReadonlySet<DebugLayer>;
  recording: Recording;
  tape: Tape | undefined;
  start: number;
  playing: boolean;
  speed: number;
  slowKills: boolean;
  selected: number | undefined;
  view: ViewMode;
  allThoughts: boolean;
  onSeeker: (seek: (step: number) => void) => void;
  onView: (view: ViewMode) => void;
  onPick: (member: number | undefined) => void;
  onFrame: (frame: ReplayFrame) => void;
}) {
  const canvas = untrack(() => props.canvas);
  const recording = untrack(() => props.recording);
  const rapier = useRapier2D();
  const renderer = createRangeRenderer(useGpuCanvas());
  const given = untrack(() => props.tape);
  const builder = given ? undefined : createTapeBuilder(rapier, recording);
  const tape = given ?? builder!.tape;
  const shower = createTapePlayer(renderer, tape);
  const thinker = createReplayPlayer(rapier, createNullRenderer(), recording, untrack(() => props.start));
  const camera = createCamera({ x: 0, y: 0 });
  let time = untrack(() => props.start);
  let movedAt = -Infinity;
  let members: ({ x: number; y: number } | undefined)[] = [];
  let screen = fitCanvas(canvas);
  let lastTime: number | undefined;
  let lastView: ViewMode | undefined;
  let press: { x: number; y: number; camera: { x: number; y: number }; moved: boolean } | undefined;

  props.onSeeker((step) => {
    time = Math.min(Math.max(step, 0), available());
    movedAt = performance.now();
  });
  onCleanup(() => {
    builder?.dispose();
    thinker.dispose();
  });

  makeEventListener(canvas, 'pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    press = { x: event.offsetX, y: event.offsetY, camera: { x: camera.x, y: camera.y }, moved: false };
  });

  makeEventListener(canvas, 'pointermove', (event) => {
    if (!press) {
      return;
    }

    const dx = event.offsetX - press.x;
    const dy = event.offsetY - press.y;
    press.moved ||= Math.hypot(dx, dy) > CLICK_SLOP;

    if (press.moved) {
      camera.x = press.camera.x - dx / camera.zoom;
      camera.y = press.camera.y - dy / camera.zoom;
      props.onView('free');
    }
  });

  makeEventListener(canvas, 'pointerup', (event) => {
    if (press && !press.moved) {
      props.onPick(memberAt({ x: event.offsetX, y: event.offsetY }));
    }

    press = undefined;
  });

  makeEventListener(canvas, 'pointercancel', () => (press = undefined));

  makeEventListener(
    canvas,
    'wheel',
    (event) => {
      event.preventDefault();
      const cursor = { x: event.offsetX, y: event.offsetY };
      const under = screenToWorld(camera, cursor, screen);
      zoomCamera(camera, Math.exp(-event.deltaY * WHEEL_ZOOM));

      // Following, the view keeps the tank; otherwise the ground under the pointer stays under it.
      if (props.view !== 'follow') {
        const moved = worldToScreen(camera, under, screen);
        camera.x += (moved.x - cursor.x) / camera.zoom;
        camera.y += (moved.y - cursor.y) / camera.zoom;
        props.onView('free');
      }
    },
    { passive: false }
  );

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

  /** The last step the tape has, or the whole match once built. */
  function available() {
    return builder?.done ? recording.steps : Math.min(tape.end ?? 0, recording.steps);
  }

  /** Shows the moment the replay is at, moves it on by a frame and reports the frame. */
  function frame(now: number) {
    const dt = lastTime === undefined ? 0 : Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = now;
    builder?.work(BUILD_BUDGET);
    const end = available();
    const pace = props.playing ? props.speed * (props.slowKills && nearKill(time) ? KILL_SLOW : 1) : 0;
    time = Math.min(time + dt * 60 * pace, end);
    screen = fitCanvas(canvas);
    const shown = shower.show(time);
    members = shown?.members ?? [];
    placeCamera(dt);
    renderer.render(camera, screen, BACKGROUND, shown?.age ?? 0);
    const step = Math.floor(time);
    const synced = follow(step);
    const match = thinker.match;
    drawOverlay(synced);

    const index = tape.members.findIndex((member) => member.id === props.selected);
    const at = members[index];
    const ring = at && worldToScreen(camera, at, screen);
    const team = recording.chronicle.members.find((member) => member.id === props.selected)?.team;

    props.onFrame({
      step,
      available: end,
      building: builder !== undefined && !builder.done,
      done: time >= recording.steps,
      diverged: builder?.diverged ?? thinker.diverged,
      syncing: !synced,
      state: shown?.hud,
      thoughts: synced ? thoughtsOnScreen(match, camera, screen).filter((thought) => props.allThoughts || thought.id === props.selected).map(onTape) : [],
      callouts: calloutsAt(recording.chronicle, time, positionOf, camera, screen),
      selection: ring && team && { ...ring, radius: RING_RADIUS * camera.zoom, team },
      report: synced && props.selected !== undefined ? reportMember(match, props.selected) : undefined
    });
  }

  /**
   * Takes the second run to step `step`, within its budget for the frame: on at once, back once
   * the moment shown has stayed put a moment, as going back plays it again from the start.
   * Whether it is there.
   */
  function follow(step: number) {
    if (thinker.step !== step && thinker.sought !== step && (step > thinker.step || performance.now() - movedAt > SETTLE)) {
      thinker.seek(step);
    }

    thinker.frame(0, 0);
    return thinker.step === step && thinker.sought === undefined;
  }

  /** Whether `time` is near a kill that `slowKills` slows down for. */
  function nearKill(at: number) {
    return recording.chronicle.kills.some(
      (kill) =>
        at >= kill.step - KILL_BEFORE * 60 &&
        at <= kill.step + KILL_AFTER * 60 &&
        (props.selected === undefined || kill.victim === props.selected || kill.killer === props.selected)
    );
  }

  /** Draws the debug view's layers over the arena, on a canvas of the arena's size, while the second run is at the moment shown. */
  function drawOverlay(synced: boolean) {
    const overlay = props.overlay;
    const context = overlay?.getContext('2d');

    if (!overlay || !context) {
      return;
    }

    if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
      overlay.width = canvas.width;
      overlay.height = canvas.height;
    }

    drawDebug(context, camera, screen, thinker.match, synced ? props.selected : undefined, props.layers);
  }

  /** Where member `id`'s tank is as the tape draws it now, between steps too; `undefined` while it waits to respawn. */
  function positionOf(id: number) {
    return members[tape.members.findIndex((member) => member.id === id)];
  }

  /** A bot's thought, its label over its tank as the tape draws it, between steps too, rather than at the step the second run is on. */
  function onTape(thought: ThoughtView): ThoughtView {
    const at = positionOf(thought.id);
    return at ? { ...thought, ...worldToScreen(camera, at, screen) } : thought;
  }

  /** Frames the whole map, follows the picked tank, or leaves the view where the player put it. */
  function placeCamera(dt: number) {
    const map = thinker.match.map;
    const entered = props.view !== lastView;
    lastView = props.view;

    if (props.view === 'overview') {
      const fit = Math.min(screen.width / (map.halfWidth * 2 + 60), screen.height / (map.halfHeight * 2 + 140));
      camera.zoom += (fit - camera.zoom) * Math.min(dt * EASE, 1);
      camera.x += (map.point.x - camera.x) * Math.min(dt * EASE, 1);
      camera.y += (map.point.y - camera.y) * Math.min(dt * EASE, 1);
      return;
    }

    const target = props.view === 'follow' ? members[tape.members.findIndex((member) => member.id === props.selected)] : undefined;

    if (entered && props.view === 'follow') {
      camera.zoom = Math.max(camera.zoom, FOLLOW_ZOOM);
    }

    if (target) {
      camera.x += (target.x - camera.x) * Math.min(dt * EASE, 1);
      camera.y += (target.y - camera.y) * Math.min(dt * EASE, 1);
    }
  }

  /** The member whose tank is at `point` on screen, if any, as the tape shows them. */
  function memberAt(point: { x: number; y: number }) {
    const at = screenToWorld(camera, point, screen);
    const reach = Math.max(PICK_REACH, PICK_REACH_ON_SCREEN / camera.zoom);
    let nearest: { id: number; distance: number } | undefined;

    members.forEach((position, index) => {
      const distance = position ? Math.hypot(position.x - at.x, position.y - at.y) : Infinity;

      if (distance < reach && (!nearest || distance < nearest.distance)) {
        nearest = { id: tape.members[index].id, distance };
      }
    });

    return nearest?.id;
  }
}

const BACKGROUND = [0.302, 0.302, 0.302];
const MAX_FRAME_TIME = 0.1;
/** Zoom when a tank is picked to follow, at least. */
const FOLLOW_ZOOM = 1.6;
/** How quickly the view eases to where it goes, per second. */
const EASE = 6;
const WHEEL_ZOOM = 0.0015;
/** Pixels the pointer may move between press and release for a click. */
const CLICK_SLOP = 4;
/** How far from a tank's middle a click picks it, in world pixels, and at least in screen pixels. */
const PICK_REACH = 34;
const PICK_REACH_ON_SCREEN = 16;
/** The picked tank's ring, in world pixels. */
const RING_RADIUS = 36;
const TEAM_RING: Record<TeamId, string> = { red: '#ff8a7a', blue: '#8ab4ff' };
/** Milliseconds a frame spends building the tape of a recording opened without one. */
const BUILD_BUDGET = 8;
/** Milliseconds the moment shown stays put before the second run plays the match again to go back to it. */
const SETTLE = 250;
/** How much `slowKills` slows the match, and the seconds before and after a kill it does. */
const KILL_SLOW = 0.25;
const KILL_BEFORE = 0.7;
const KILL_AFTER = 0.4;
