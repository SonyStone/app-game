import { GpuCanvas, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createDockState, Dock } from 'solid-dock';
import { createMemo, createSignal, createStore, For, onCleanup, onSettled, Show, untrack } from 'solid-js';
import { createCamera, screenToWorld, worldToScreen, zoomCamera } from '../arena/camera';
import { createRangeRenderer } from '../damage/renderer';
import { Rapier2D, useRapier2D } from '../physics/Rapier2D';
import { BotThoughts, KothHud, type HudState, type ThoughtView } from './Hud';
import { useKothI18n } from './i18n/i18n';
import { calloutsOnScreen, fitCanvas, thoughtsOnScreen } from './onScreen';
import './poster.css';
import { RadioOverlay, type CalloutView } from './RadioOverlay';
import type { Recording } from './recording';
import { createReplayPlayer } from './replayPlayer';
import type { TeamId } from './rules';
import { clock, TimelinePanel } from './TimelinePanel';
import { timelineOf } from './timeline';

/**
 * Watching a recorded match: a dock of two panels, the arena, where the match is played again
 * (see `createReplayPlayer`), and its timeline below (see `TimelinePanel`), which take tabs that
 * drag to another side and a sash between them that resizes them.
 *
 * The view starts on the whole map. Clicking a tank picks it and follows it, as 1-8 do for the
 * members in the timeline's order; dragging moves the view freely and the wheel zooms about the
 * pointer; 0 or Esc shows the whole map again, F follows the tank picked again. The picked tank is
 * ringed, its bot's thoughts are shown over it and its track is lit; B shows every bot's
 * thoughts. Space plays or holds the match, the arrows go 5 s back or on, `,` and `.` a step.
 * Played to its end, the match holds, and playing it again starts it over.
 *
 * @param recording - The match; a new one needs a new view.
 * @param start - The step to start from.
 * @param onExit - Called when the player asks to go back to the game.
 */
export function ReplayView(props: { recording: Recording; start: number; onExit: () => void }) {
  const { t } = useKothI18n();
  const [layout, setLayout] = createStore(createDockState({ column: [{ group: ['arena'] }, { group: ['timeline'] }], sizes: [68, 32] }));
  const timeline = createMemo(() => timelineOf(props.recording.chronicle, props.recording.steps));
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [playing, setPlaying] = createSignal(true);
  const [speed, setSpeed] = createSignal(1);
  const [frame, setFrame] = createSignal<ReplayFrame>();
  const [selected, setSelected] = createSignal<number>();
  const [view, setView] = createSignal<ViewMode>('overview');
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
              <GpuCanvas
                canvas={canvas()}
                requiredBufferBytes={64 * 1024 * 1024}
                error={(error) => <p class="absolute inset-0 m-0 grid place-items-center text-white">{error.message}</p>}
              >
                <Rapier2D>
                  <ReplayScene
                    canvas={canvas()!}
                    recording={props.recording}
                    start={props.start}
                    playing={playing()}
                    speed={speed()}
                    selected={selected()}
                    view={view()}
                    allThoughts={allThoughts()}
                    onSeeker={(seek) => (seeker = seek)}
                    onView={setView}
                    onPick={(member) => (member === undefined ? setSelected(undefined) : pick(member))}
                    onFrame={(next) => {
                      setFrame(next);

                      if (next.done && next.sought === undefined) {
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
              <Show when={frame()?.sought}>
                {(sought) => <div class="tk-tag pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">{t('replay.seeking', clock(sought() / 60))}</div>}
              </Show>
            </div>
          </Dock.Panel>
          <Dock.Panel id="timeline" title={t('replay.timeline')}>
            <TimelinePanel
              timeline={timeline()}
              step={step()}
              sought={frame()?.sought}
              diverged={frame()?.diverged}
              playing={playing()}
              speed={speed()}
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

/** What a frame of the replay shows, besides the arena. */
type ReplayFrame = {
  step: number;
  sought: number | undefined;
  done: boolean;
  diverged: number | undefined;
  state: HudState;
  thoughts: ThoughtView[];
  callouts: CalloutView[];
  /** The ring about the picked tank, on screen, while it lives. */
  selection: { x: number; y: number; radius: number; team: TeamId } | undefined;
};

/**
 * Plays the recorded match on the canvas's GPU (see `createReplayPlayer`), places the view and
 * draws, and reports what the frame shows. Dragging on the canvas moves the view, the wheel
 * zooms it about the pointer, a click picks the tank under it or none.
 *
 * @param recording - Read once.
 * @param start - The step to start from, read once.
 * @param playing - Whether the match plays on; held, it is drawn as it stands.
 * @param speed - How many times faster than real time the match plays.
 * @param selected - The member picked: its tank is ringed and its bot's thoughts shown.
 * @param view - How the view moves; it turns `free` by `onView` once the player moves it.
 * @param allThoughts - Shows every bot's thoughts, not only the picked one's.
 * @param onSeeker - Receives the function that takes the match to a step.
 * @param onPick - Receives the member whose tank was clicked, or `undefined` for a click beside every tank.
 */
function ReplayScene(props: {
  canvas: HTMLCanvasElement;
  recording: Recording;
  start: number;
  playing: boolean;
  speed: number;
  selected: number | undefined;
  view: ViewMode;
  allThoughts: boolean;
  onSeeker: (seek: (step: number) => void) => void;
  onView: (view: ViewMode) => void;
  onPick: (member: number | undefined) => void;
  onFrame: (frame: ReplayFrame) => void;
}) {
  const canvas = untrack(() => props.canvas);
  const rapier = useRapier2D();
  const renderer = createRangeRenderer(useGpuCanvas());
  const player = createReplayPlayer(rapier, renderer, untrack(() => props.recording), untrack(() => props.start));
  const camera = createCamera(player.match.map.point);
  let screen = fitCanvas(canvas);
  let lastTime: number | undefined;
  let lastView: ViewMode | undefined;
  let press: { x: number; y: number; camera: { x: number; y: number }; moved: boolean } | undefined;

  props.onSeeker((step) => player.seek(step));
  onCleanup(() => player.dispose());

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

  /** Plays the match on, places the view, draws and reports one frame. */
  function frame(time: number) {
    const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_TIME);
    const speed = props.playing ? props.speed : 0;
    lastTime = time;
    screen = fitCanvas(canvas);
    player.frame(dt, speed);
    const match = player.match;
    placeCamera(dt);
    match.draw(camera);
    renderer.render(camera, screen, BACKGROUND, dt * speed);

    const picked = match.members.find((member) => member.id === props.selected);
    const tank = picked?.tank;
    const ring = tank && worldToScreen(camera, tank.hull.translation(), screen);

    props.onFrame({
      step: player.step,
      sought: player.sought,
      done: player.done,
      diverged: player.diverged,
      state: match.hud(),
      thoughts: thoughtsOnScreen(match, camera, screen).filter((thought) => props.allThoughts || thought.id === props.selected),
      callouts: calloutsOnScreen(match, camera, screen, true),
      selection: ring && picked && { ...ring, radius: RING_RADIUS * camera.zoom, team: picked.team }
    });
  }

  /** Frames the whole map, follows the picked tank, or leaves the view where the player put it. */
  function placeCamera(dt: number) {
    const match = player.match;
    const entered = props.view !== lastView;
    lastView = props.view;

    if (props.view === 'overview') {
      const fit = Math.min(screen.width / (match.map.halfWidth * 2 + 60), screen.height / (match.map.halfHeight * 2 + 140));
      camera.zoom += (fit - camera.zoom) * Math.min(dt * EASE, 1);
      camera.x += (match.map.point.x - camera.x) * Math.min(dt * EASE, 1);
      camera.y += (match.map.point.y - camera.y) * Math.min(dt * EASE, 1);
      return;
    }

    const target = props.view === 'follow' ? match.members.find((member) => member.id === props.selected)?.tank?.hull.translation() : undefined;

    if (entered && props.view === 'follow') {
      camera.zoom = Math.max(camera.zoom, FOLLOW_ZOOM);
    }

    if (target) {
      camera.x += (target.x - camera.x) * Math.min(dt * EASE, 1);
      camera.y += (target.y - camera.y) * Math.min(dt * EASE, 1);
    }
  }

  /** The member whose tank is at `point` on screen, if any. */
  function memberAt(point: { x: number; y: number }) {
    const at = screenToWorld(camera, point, screen);
    const reach = Math.max(PICK_REACH, PICK_REACH_ON_SCREEN / camera.zoom);
    let nearest: { id: number; distance: number } | undefined;

    for (const member of player.match.members) {
      const tank = member.tank?.hull.translation();
      const distance = tank ? Math.hypot(tank.x - at.x, tank.y - at.y) : Infinity;

      if (distance < reach && (!nearest || distance < nearest.distance)) {
        nearest = { id: member.id, distance };
      }
    }

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
