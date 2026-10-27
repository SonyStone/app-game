import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal, flush, For, Show } from 'solid-js';
import { seatName } from './Hud';
import { useKothI18n } from './i18n/i18n';
import './poster.css';
import type { Lane, RadioLine } from './radio';
import type { TeamId } from './rules';
import type { TankClassId } from './tanks';
import { ACTION_KINDS, type ActionKind, type Timeline, type TimelineMarker, type Track } from './timeline';

/**
 * The replay's timeline, a panel of its dock: the controls of the playing above, the match along
 * its time below, a track for every member and one for the point's owner.
 *
 * A member's track shows its lives, colored by what its bot did (see `ACTION_KINDS`; the player's
 * own driving is orange), and its markers: kills it made (a black dot), its death (a cross), radio
 * lines it said (a yellow flag), a new target (a tick below) and a new class (a diamond). Pointing
 * at any of them tells what it is; clicking a marker jumps to `MARKER_LEAD` s before it and picks
 * its member, clicking a member's name picks it. Clicking or dragging along the tracks shows the
 * moment under the pointer at once, from the match's tape. The wheel zooms the time about the
 * pointer, Shift and the wheel or a sideways swipe scroll it; while playing, the view keeps the
 * playhead in sight. A switch slows the match down about kills.
 *
 * @param step - The step the match stands at.
 * @param available - The last step on the tape; the rest, still being built, is shaded.
 * @param diverged - The second from which this game code plays the match differently, shaded on the ruler.
 * @param selected - The member picked, whose track is lit.
 */
export function TimelinePanel(props: {
  timeline: Timeline;
  step: number;
  available: number;
  diverged: number | undefined;
  playing: boolean;
  speed: number;
  slowKills: boolean;
  selected: number | undefined;
  onPlaying: (playing: boolean) => void;
  onSpeed: (speed: number) => void;
  onSlowKills: (on: boolean) => void;
  onSeek: (step: number) => void;
  onSelect: (member: number) => void;
  onExit: () => void;
}) {
  const { t } = useKothI18n();
  const [scroller, setScroller] = createSignal<HTMLDivElement>();
  const size = createElementSize(scroller);
  const [zoom, setZoom] = createSignal(1);
  const [scrub, setScrub] = createSignal<number>();
  const end = () => props.timeline.end;
  const width = () => Math.max((size.width ?? 800) - LABELS - PAD * 2, 100) * zoom();
  const x = (step: number) => PAD + (step / end()) * width();
  const height = () => RULER + (props.timeline.tracks.length + 1) * ROW;
  const ticks = createMemo(() => {
    const seconds = end() / 60;
    const every = TICK_SECONDS.find((interval) => (interval / seconds) * width() >= 56) ?? 300;
    return Array.from({ length: Math.floor(seconds / every) + 1 }, (_, index) => index * every);
  });
  const nameOf = (id: number | undefined) => {
    const track = props.timeline.tracks.find((entry) => entry.id === id);
    return track ? seatName(t, seatOf(track)) : '—';
  };
  const className = (id: TankClassId | undefined) => (id ? t(`tankClass.${id}`) : '—');

  // While playing, the view scrolls on to keep the playhead in sight.
  createEffect(
    () => ({ at: x(props.step), element: scroller(), scrubbing: scrub() !== undefined }),
    ({ at, element, scrubbing }) => {
      if (!element || scrubbing) {
        return;
      }

      const visible = element.clientWidth - LABELS;

      if (at < element.scrollLeft || at > element.scrollLeft + visible - PAD) {
        element.scrollLeft = Math.max(at - visible * 0.15, 0);
      }
    }
  );

  return (
    <div class="tk-timeline flex h-full flex-col">
      <div class="tk-timeline-bar">
        <button class="tk-small-button w-9" title={props.playing ? t('replay.pause') : t('replay.play')} onClick={() => props.onPlaying(!props.playing)}>
          {props.playing ? '❚❚' : '▶'}
        </button>
        <button class="tk-small-button" title={t('replay.back')} onClick={() => props.onSeek(props.step - 300)}>
          −5
        </button>
        <button class="tk-small-button" title={t('replay.forward')} onClick={() => props.onSeek(props.step + 300)}>
          +5
        </button>
        <div class="tk-segments tk-timeline-speeds">
          <For each={SPEEDS}>
            {(speed) => (
              <button class={['tk-segment', { 'tk-on': props.speed === speed.value }]} onClick={() => props.onSpeed(speed.value)}>
                {speed.label}
              </button>
            )}
          </For>
        </div>
        <span class="tk-timeline-clock">
          {clock(props.step / 60)} / {clock(end() / 60)}
        </span>
        <button
          class={['tk-segments tk-switch tk-timeline-switch', { 'tk-on': props.slowKills }]}
          title={t('replay.slowKillsHint')}
          onClick={() => props.onSlowKills(!props.slowKills)}
        >
          <span class={{ 'tk-on': props.slowKills }}>{t('replay.slowKills')}</span>
        </button>
        <div class="tk-timeline-legend" title={t('replay.keys')}>
          <For each={Object.keys(ACTION_KINDS) as ActionKind[]}>
            {(kind) => (
              <span>
                <i style={{ background: KIND_COLORS[kind] }} />
                {t(`replay.kinds.${kind}`)}
              </span>
            )}
          </For>
        </div>
        <button class="tk-small-button ml-auto whitespace-nowrap" onClick={() => props.onExit()}>
          {t('replay.exit')}
        </button>
      </div>
      <Show when={props.diverged}>
        {(second) => <div class="tk-timeline-warning">{t('replay.diverged', clock(second()))}</div>}
      </Show>
      <div
        ref={setScroller}
        class="relative min-h-0 flex-1 overflow-auto"
        onWheel={(event) => {
          if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            return;
          }

          event.preventDefault();
          const element = event.currentTarget;
          const offset = event.clientX - element.getBoundingClientRect().left - LABELS;
          const step = ((element.scrollLeft + offset - PAD) / width()) * end();
          setZoom((current) => Math.min(Math.max(current * Math.exp(-event.deltaY * 0.002), 1), MAX_ZOOM));
          flush();
          element.scrollLeft = x(step) - offset;
        }}
      >
        <div class="relative" style={{ width: `${LABELS + width() + PAD * 2}px`, height: `${height()}px` }}>
          <div class="tk-timeline-labels" style={{ width: `${LABELS}px`, height: `${height()}px` }}>
            <div class="tk-timeline-label" style={{ top: `${RULER}px`, height: `${ROW}px` }}>
              {t('replay.point')}
            </div>
            <For each={props.timeline.tracks}>
              {(track, index) => (
                <button
                  class={['tk-timeline-label', { 'tk-on': props.selected === track.id }]}
                  style={{ top: `${RULER + (index() + 1) * ROW}px`, height: `${ROW}px`, '--team': TEAM_CSS[track.team] }}
                  onClick={() => props.onSelect(track.id)}
                >
                  {seatName(t, seatOf(track))}
                </button>
              )}
            </For>
          </div>
          <svg
            class="absolute top-0 touch-none"
            style={{ left: `${LABELS}px` }}
            width={width() + PAD * 2}
            height={height()}
            onPointerDown={(event) => {
              const step = stepAtPointer(event);
              event.currentTarget.setPointerCapture(event.pointerId);
              setScrub(step);
              props.onSeek(step);
            }}
            onPointerMove={(event) => {
              if (scrub() !== undefined) {
                const step = stepAtPointer(event);
                setScrub(step);
                props.onSeek(step);
              }
            }}
            onPointerUp={() => setScrub(undefined)}
            onPointerCancel={() => setScrub(undefined)}
          >
            <rect class="tk-timeline-ruler" x="0" y="0" width={width() + PAD * 2} height={RULER} />
            <Show when={props.diverged}>
              {(second) => <rect class="tk-timeline-diverged" x={x(second() * 60)} y="0" width={Math.max(x(end()) - x(second() * 60), 0)} height={height()} />}
            </Show>
            <For each={ticks()}>
              {(tick) => (
                <>
                  <line x1={x(tick * 60)} x2={x(tick * 60)} y1={RULER - 6} y2={height()} class="tk-timeline-tick" />
                  <text x={x(tick * 60) + 3} y={RULER - 8} class="tk-timeline-time">
                    {clock(tick)}
                  </text>
                </>
              )}
            </For>
            <For each={props.timeline.capture}>
              {(span) => (
                <Show when={span.owner}>
                  {(owner) => (
                    <rect x={x(span.from)} y={RULER + 4} width={Math.max(x(span.to) - x(span.from), 1)} height={ROW - 8} fill={TEAM_CSS[owner()]}>
                      <title>
                        {t(`result.team.${owner()}`)} · {clock(span.from / 60)}–{clock(span.to / 60)}
                      </title>
                    </rect>
                  )}
                </Show>
              )}
            </For>
            <For each={props.timeline.tracks}>
              {(track, index) => {
                const top = () => RULER + (index() + 1) * ROW;
                return (
                  <g>
                    <Show when={props.selected === track.id}>
                      <rect class="tk-timeline-selected" x="0" y={top()} width={width() + PAD * 2} height={ROW} />
                    </Show>
                    <For each={track.lives}>
                      {(life) => (
                        <rect x={x(life.from)} y={top() + 3} width={Math.max(x(life.to) - x(life.from), 1)} height={ROW - 6} fill={KIND_COLORS[track.human ? 'player' : 'idle']}>
                          <title>
                            {className(life.tankClass)} · {clock(life.from / 60)}–{clock(life.to / 60)}
                          </title>
                        </rect>
                      )}
                    </For>
                    <For each={track.segments}>
                      {(segment) => (
                        <rect x={x(segment.from)} y={top() + 3} width={Math.max(x(segment.to) - x(segment.from), 1)} height={ROW - 6} fill={KIND_COLORS[segment.kind]}>
                          <title>
                            {segment.goal ?? '—'} → {segment.action ?? '—'} · {clock(segment.from / 60)}–{clock(segment.to / 60)}
                          </title>
                        </rect>
                      )}
                    </For>
                    <For each={track.markers}>
                      {(marker) => (
                        <MarkerShape
                          marker={marker}
                          x={x(marker.step)}
                          top={top()}
                          title={`${clock(marker.step / 60)} · ${markerText(marker)}`}
                          onPick={() => {
                            props.onSelect(track.id);
                            props.onSeek(marker.step - MARKER_LEAD * 60);
                          }}
                        />
                      )}
                    </For>
                  </g>
                );
              }}
            </For>
            <Show when={props.available < end()}>
              <rect class="tk-timeline-unbuilt" x={x(props.available)} y="0" width={Math.max(x(end()) - x(props.available), 0)} height={height()} />
            </Show>
            <line class="tk-timeline-playhead" x1={x(props.step)} x2={x(props.step)} y1="0" y2={height()} />
            <path class="tk-timeline-playhead-head" d={`M ${x(props.step) - 5} 0 h 10 l -5 7 z`} />
          </svg>
        </div>
      </div>
    </div>
  );

  /** The step under the pointer of `event`, on the tracks' time. */
  function stepAtPointer(event: PointerEvent & { currentTarget: SVGSVGElement }) {
    const left = event.currentTarget.getBoundingClientRect().left;
    return Math.min(Math.max(((event.clientX - left - PAD) / width()) * end(), 0), end());
  }

  /** What `marker` stands for, in the display's language. */
  function markerText(marker: TimelineMarker) {
    switch (marker.kind) {
      case 'kill':
        return t('replay.marker.kill', nameOf(marker.victim), className(marker.victimClass));
      case 'death':
        return marker.killer === undefined ? t('replay.marker.lost') : t('replay.marker.death', nameOf(marker.killer), className(marker.killerClass));
      case 'radio':
        return radioText(marker.callout);
      case 'target':
        return t('replay.marker.target', nameOf(marker.target));
      case 'class':
        return t('replay.marker.class', className(marker.was), className(marker.tankClass));
    }
  }

  /** A radio line as the radio overlay says it. */
  function radioText(callout: Extract<TimelineMarker, { kind: 'radio' }>['callout']) {
    const words = {
      tankClass: callout.tankClass ? t(`tankClass.${callout.tankClass}`) : '',
      name: callout.ally === undefined ? '' : nameOf(callout.ally),
      lane: callout.lane ? t(`lane.${callout.lane as Lane}`) : '',
      seconds: callout.seconds ?? 0
    };
    const line = t(`radio.${callout.line as RadioLine}`, words);
    return typeof line === 'string' ? `«${line}»` : callout.line;
  }
}

/**
 * A marker on a track at `x`, `top` being the track's top, with `title` shown on pointing at it;
 * a click on it calls `onPick` instead of seeking where it is.
 */
function MarkerShape(props: { marker: TimelineMarker; x: number; top: number; title: string; onPick: () => void }) {
  const middle = () => props.top + ROW / 2;

  return (
    <g
      class={`tk-timeline-marker tk-timeline-${props.marker.kind}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        props.onPick();
      }}
    >
      <title>{props.title}</title>
      <circle class="tk-timeline-hit" cx={props.x} cy={middle()} r="6" />
      {(() => {
        switch (props.marker.kind) {
          case 'kill':
            return <circle cx={props.x} cy={middle()} r="3.5" />;
          case 'death':
            return <path d={`M ${props.x - 3.5} ${middle() - 3.5} l 7 7 m 0 -7 l -7 7`} />;
          case 'radio':
            return <path d={`M ${props.x} ${props.top + 1} v 7 M ${props.x} ${props.top + 1} h 4.5 l -1.5 2 l 1.5 2 h -4.5`} />;
          case 'target':
            return <line x1={props.x} x2={props.x} y1={props.top + ROW - 5} y2={props.top + ROW} />;
          case 'class':
            return <path d={`M ${props.x} ${middle() - 4.5} l 4.5 4.5 l -4.5 4.5 l -4.5 -4.5 z`} />;
        }
      })()}
    </g>
  );
}

/** A track's member as the seat names of `seatName` take it. */
function seatOf(track: Track) {
  return { name: track.name, team: track.team, seat: track.seat, player: track.human, human: track.human };
}

/** Seconds as m:ss. */
export function clock(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The speeds the replay plays at. */
const SPEEDS = [
  { value: 0.25, label: '¼' },
  { value: 0.5, label: '½' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
  { value: 8, label: '8×' }
];

/** The colors of `ActionKind`s. */
const KIND_COLORS: Record<ActionKind, string> = {
  move: '#7f9cc4',
  point: '#f2c418',
  attack: '#e0321e',
  cover: '#8a6bb8',
  repair: '#4f9a5a',
  breach: '#a86a32',
  idle: '#c9c0ad',
  player: '#f0773a'
};

const TEAM_CSS: Record<TeamId, string> = { red: '#c9473b', blue: '#3b73c9' };

/** Seconds a click on a marker jumps before it, to see it come. */
const MARKER_LEAD = 2;

/** Widths and heights in CSS pixels: the names' column, the margin at both ends of the time, the ruler and a track. */
const LABELS = 112;
const PAD = 8;
const RULER = 22;
const ROW = 18;

/** How far the time zooms in, as a multiple of the whole match fitting the panel. */
const MAX_ZOOM = 40;

/** Spacings of the ruler's ticks, in seconds; the closest that leaves room for a label is used. */
const TICK_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120];
