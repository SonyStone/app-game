import { createMemo, createSignal, Index, onCleanup, Show, type ComponentProps, type JSX } from 'solid-js';
import type { TimelineAction, TimelineDefinition, TimelinePointerDefinition, TimelineTrackSegment } from '../timeline';
import ChevronDownIcon from './icons/chevron-down.svg';
import EyeIcon from './icons/eye.svg';
import LockIcon from './icons/lock.svg';
import PauseIcon from './icons/pause.svg';
import PlayIcon from './icons/play.svg';
import SkipEndIcon from './icons/skip-end.svg';
import SkipStartIcon from './icons/skip-start.svg';
import ZoomInIcon from './icons/zoom-in.svg';
import ZoomOutIcon from './icons/zoom-out.svg';

const HEADER_HEIGHT = 24;
const ROW_HEIGHT = 24;
const RULER_HEIGHT = 28;
const TIMELINE_MIN_WIDTH = 860;
const DEFAULT_ZOOM_LEVEL = 0.18;
const MAX_PIXELS_PER_SECOND = 980;
const MIN_PIXELS_PER_SECOND = 140;
const ZOOM_BUTTON_STEP = 0.12;
const DEFAULT_SCROLLBAR_HEIGHT = 16;
const KEYFRAME_COLOR = '#f39a96';
const KEYFRAME_SIZE = 8;
const MONO_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const POINTER_COLORS = ['#0891b2', '#e11d48', '#7c3aed', '#16a34a', '#ea580c'] as const;
const RULER_STEPS_MS = [50, 100, 200, 500, 1000, 2000, 5000] as const;

const decorativeIconProps = {
  'aria-hidden': 'true'
} satisfies Pick<ComponentProps<'svg'>, 'aria-hidden'>;

type TimelineEditorGroup = {
  readonly actions: readonly TimelineAction[];
  readonly color: string;
  readonly endMs: number;
  readonly pointer: TimelinePointerDefinition;
  readonly segments: readonly TimelineTrackSegment[];
  readonly startMs: number;
};

type RulerTick = {
  readonly label: string;
  readonly ms: number;
  readonly x: number;
};

type RulerMinorTick = {
  readonly isMajor: boolean;
  readonly x: number;
};

export function TimelineEditor(props: {
  readonly elapsedMs: number;
  readonly isPlaying: boolean;
  readonly onPause: () => void;
  readonly onPlay: () => void;
  readonly onSeek: (elapsedMs: number) => void;
  readonly onSkipToEnd: () => void;
  readonly onSkipToStart: () => void;
  readonly timeline?: TimelineDefinition;
}) {
  const [isScrubbing, setIsScrubbing] = createSignal(false);
  const [scrollbarHeight, setScrollbarHeight] = createSignal(DEFAULT_SCROLLBAR_HEIGHT);
  const [zoomLevel, setZoomLevel] = createSignal(DEFAULT_ZOOM_LEVEL);
  let timelineScrollbar: HTMLDivElement | undefined;
  let timelineViewport: HTMLDivElement | undefined;
  let scrubPointerId: number | undefined;

  const durationMs = createMemo(() => props.timeline?.durationMs ?? 0);
  const pixelsPerSecond = createMemo(() => zoomToPixelsPerSecond(zoomLevel()));
  const timelineWidth = createMemo(() => timelineWidthForZoom(zoomLevel()));
  const groups = createMemo((): readonly TimelineEditorGroup[] => {
    const timeline = props.timeline;

    if (!timeline) {
      return [];
    }

    return timeline.pointers.map((pointer, index) => {
      const actions = timeline.actions.filter((action) => action.pointerId === pointer.id);
      const segments = timeline.tracks.find((track) => track.pointerId === pointer.id)?.segments ?? [];
      const segmentBounds = segments.flatMap((segment) => [segment.startMs, segment.startMs + segment.durationMs]);
      const actionBounds = actions.map((action) => action.atMs);
      const bounds = [...segmentBounds, ...actionBounds];

      return {
        actions,
        color: pointerColor(index),
        endMs: bounds.length > 0 ? Math.max(...bounds) : timeline.durationMs,
        pointer,
        segments,
        startMs: bounds.length > 0 ? Math.min(...bounds) : 0
      };
    });
  });
  const contentHeight = createMemo(() => groups().length * (HEADER_HEIGHT + ROW_HEIGHT * 2));
  const playheadX = createMemo(() => timeToX(props.elapsedMs));
  const rulerPixelsPerSecond = createMemo(() => {
    const duration = durationMs();

    return duration <= 0 ? pixelsPerSecond() : timelineWidth() / (duration / 1000);
  });
  const rulerTicks = createMemo((): readonly RulerTick[] => {
    const duration = durationMs();

    if (duration <= 0) {
      return [];
    }

    const stepMs = rulerStepMs(rulerPixelsPerSecond());
    const ticks: RulerTick[] = [];

    for (let ms = 0; ms <= duration; ms += stepMs) {
      ticks.push({
        label: formatTick(ms),
        ms,
        x: timeToX(ms)
      });
    }

    if (ticks[ticks.length - 1]?.ms !== duration) {
      ticks.push({
        label: formatTick(duration),
        ms: duration,
        x: timeToX(duration)
      });
    }

    return ticks;
  });
  const rulerMinorTicks = createMemo((): readonly RulerMinorTick[] => {
    const duration = durationMs();

    if (duration <= 0) {
      return [];
    }

    const stepMs = rulerStepMs(rulerPixelsPerSecond());
    const minorStepMs = Math.max(10, stepMs / 5);
    const ticks: RulerMinorTick[] = [];

    for (let ms = 0; ms <= duration; ms += minorStepMs) {
      const tickMs = Math.min(duration, Math.round(ms));

      ticks.push({
        isMajor: tickMs % stepMs === 0 || tickMs === duration,
        x: timeToX(tickMs)
      });
    }

    return ticks;
  });

  function timeToX(ms: number): number {
    const duration = durationMs();

    if (duration <= 0) {
      return 0;
    }

    return (Math.min(Math.max(ms, 0), duration) / duration) * timelineWidth();
  }

  function widthBetween(startMs: number, endMs: number): number {
    return Math.max(8, timeToX(endMs) - timeToX(startMs));
  }

  function timelineWidthForZoom(nextZoomLevel: number): number {
    return Math.max(TIMELINE_MIN_WIDTH, Math.ceil((durationMs() / 1000) * zoomToPixelsPerSecond(nextZoomLevel)));
  }

  function updateScrollbarHeight(): void {
    const scrollbar = timelineScrollbar;

    if (!scrollbar) {
      return;
    }

    const measuredHeight = scrollbar.offsetHeight - scrollbar.clientHeight;

    if (measuredHeight >= 8 && Math.abs(measuredHeight - scrollbarHeight()) >= 0.5) {
      setScrollbarHeight(measuredHeight);
    }
  }

  function scheduleScrollbarHeightUpdate(): void {
    requestAnimationFrame(updateScrollbarHeight);
  }

  function syncTimelineScrollLeft(scrollLeft: number): void {
    if (timelineViewport && timelineViewport.scrollLeft !== scrollLeft) {
      timelineViewport.scrollLeft = scrollLeft;
    }

    if (timelineScrollbar && timelineScrollbar.scrollLeft !== scrollLeft) {
      timelineScrollbar.scrollLeft = scrollLeft;
    }
  }

  function updateZoom(nextZoomLevel: number, anchorClientX?: number): void {
    const nextLevel = clampZoomLevel(nextZoomLevel);
    const viewport = timelineViewport;

    if (!viewport) {
      setZoomLevel(nextLevel);
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const anchorOffset =
      anchorClientX === undefined ? bounds.width / 2 : Math.min(Math.max(anchorClientX - bounds.left, 0), bounds.width);
    const currentWidth = timelineWidth();
    const anchorRatio = currentWidth <= 0 ? 0 : (viewport.scrollLeft + anchorOffset) / currentWidth;
    const nextWidth = timelineWidthForZoom(nextLevel);

    setZoomLevel(nextLevel);
    requestAnimationFrame(() => {
      syncTimelineScrollLeft(Math.max(0, anchorRatio * nextWidth - anchorOffset));
      updateScrollbarHeight();
    });
  }

  function updateZoomFromInput(event: InputEvent & { readonly currentTarget: HTMLInputElement }): void {
    updateZoom(Number(event.currentTarget.value));
  }

  function handleTimelineScrollbarScroll(event: Event & { readonly currentTarget: HTMLDivElement }): void {
    syncTimelineScrollLeft(event.currentTarget.scrollLeft);
  }

  function handleTimelineWheel(event: WheelEvent): void {
    const viewport = timelineViewport;
    const scrollbar = timelineScrollbar;

    if (!viewport || !scrollbar) {
      return;
    }

    const maxScrollLeft = Math.max(0, scrollbar.scrollWidth - scrollbar.clientWidth);

    if (maxScrollLeft <= 0) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const nextScrollLeft = Math.min(Math.max(scrollbar.scrollLeft + delta, 0), maxScrollLeft);

    if (nextScrollLeft === scrollbar.scrollLeft) {
      return;
    }

    event.preventDefault();
    syncTimelineScrollLeft(nextScrollLeft);
  }

  function seekFromClientX(clientX: number): void {
    const viewport = timelineViewport;
    const duration = durationMs();

    if (!viewport || duration <= 0) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const x = clientX - bounds.left + viewport.scrollLeft;
    const ratio = Math.min(Math.max(x / timelineWidth(), 0), 1);

    props.onSeek(ratio * duration);
  }

  function handleScrubStart(event: PointerEvent): void {
    if (!props.timeline || event.button !== 0) {
      return;
    }

    event.preventDefault();
    cancelScrub();
    scrubPointerId = event.pointerId;
    setIsScrubbing(true);
    seekFromClientX(event.clientX);

    window.addEventListener('pointermove', handleScrubMove);
    window.addEventListener('pointerup', handleScrubEnd);
    window.addEventListener('pointercancel', handleScrubEnd);
    window.addEventListener('blur', cancelScrub);
  }

  function handleScrubMove(event: PointerEvent): void {
    if (event.pointerId !== scrubPointerId) {
      return;
    }

    event.preventDefault();
    seekFromClientX(event.clientX);
  }

  function handleScrubEnd(event: PointerEvent): void {
    if (event.pointerId !== scrubPointerId) {
      return;
    }

    cancelScrub();
  }

  function cancelScrub(): void {
    scrubPointerId = undefined;
    setIsScrubbing(false);
    window.removeEventListener('pointermove', handleScrubMove);
    window.removeEventListener('pointerup', handleScrubEnd);
    window.removeEventListener('pointercancel', handleScrubEnd);
    window.removeEventListener('blur', cancelScrub);
  }

  onCleanup(cancelScrub);

  return (
    <section class="absolute right-0 bottom-0 left-0 z-50 border-t border-[#c8cdd2] bg-[#f2f3f4] text-[#26323a] shadow-[0_-2px_10px_rgb(0_0_0/0.16)] select-none">
      <style>
        {`
          .timeline-editor-scrollbar {
            scrollbar-color: #7f8a8f #edf2f2;
            scrollbar-width: auto;
          }
        `}
      </style>
      <div class="grid h-10 grid-cols-[12rem_1fr_12rem] items-center border-b border-[#cfd4d8] bg-[#f7f7f7] px-3">
        <div class="flex items-center">
          <div class="inline-flex overflow-hidden rounded-[3px] border border-[#c9cdd2] shadow-[0_1px_1px_rgb(0_0_0/0.08)]">
            <TransportButton label="Go to start" onClick={props.onSkipToStart}>
              <SkipStartIcon {...decorativeIconProps} class="h-4 w-4" />
            </TransportButton>
            <Show
              fallback={
                <TransportButton label="Play timeline" onClick={props.onPlay}>
                  <PlayIcon {...decorativeIconProps} class="h-4 w-4" />
                </TransportButton>
              }
              when={props.isPlaying}
            >
              <TransportButton label="Pause timeline" onClick={props.onPause}>
                <PauseIcon {...decorativeIconProps} class="h-4 w-4" />
              </TransportButton>
            </Show>
            <TransportButton label="Go to end" onClick={props.onSkipToEnd}>
              <SkipEndIcon {...decorativeIconProps} class="h-4 w-4" />
            </TransportButton>
          </div>
        </div>

        <div
          data-timeline-elapsed
          class="justify-self-center rounded-[4px] border border-[#c8ced4] bg-white px-3 py-0.5 font-mono text-lg leading-none text-[#34495e] shadow-[inset_0_1px_0_rgb(255_255_255/0.85)]"
        >
          {formatTimelineTime(props.elapsedMs)}
        </div>

        <div data-timeline-duration class="justify-self-end font-mono text-xs text-[#6d7780]">
          {formatTimelineTime(durationMs())}
        </div>
      </div>

      <div class="grid max-h-72 grid-cols-[12rem_minmax(0,1fr)] overflow-hidden">
        <div class="border-r border-[#c7cdd2] bg-[#f6f6f6]">
          <div class="h-7 border-b border-[#c8ced4] bg-[#f2f2f2]" />

          <Show
            fallback={<div class="px-4 py-5 text-sm text-zinc-500">No timeline loaded</div>}
            when={groups().length > 0}
          >
            <Index each={groups()}>
              {(group) => (
                <div>
                  <div
                    class="flex h-6 items-center gap-1 border-b border-[#c5d1dc] bg-[#cfe3ff] px-1.5 text-[0.75rem] font-semibold text-[#1f3550]"
                    title={`${group().pointer.id} (${group().pointer.pointerType})`}
                  >
                    <ChevronDownIcon {...decorativeIconProps} class="h-3.5 w-3.5 shrink-0 text-[#2b4c68]" />
                    <span class="min-w-0 truncate">{group().pointer.id}</span>
                    <span class="ml-auto flex items-center gap-1 text-[#6c7782]">
                      <EyeIcon {...decorativeIconProps} class="h-3.5 w-3.5 shrink-0" />
                      <LockIcon {...decorativeIconProps} class="h-3.5 w-3.5 shrink-0" />
                    </span>
                  </div>
                  <TimelineLabelRow label="Motion" />
                  <TimelineLabelRow label="Actions" />
                </div>
              )}
            </Index>
          </Show>
        </div>

        <div
          ref={(element) => {
            timelineViewport = element;
          }}
          aria-label="Timeline scrubber"
          class={`touch-none overflow-x-hidden overflow-y-hidden bg-[#eaf1f1] ${
            isScrubbing() ? 'cursor-ew-resize' : 'cursor-col-resize'
          }`}
          data-scrubbing={isScrubbing() ? 'true' : 'false'}
          data-timeline-scrubber
          onPointerDown={handleScrubStart}
          onWheel={handleTimelineWheel}
        >
          <TimelineSvgSurface
            groups={groups()}
            hasTimeline={props.timeline !== undefined}
            height={RULER_HEIGHT + contentHeight()}
            isScrubbing={isScrubbing()}
            onWidthBetween={widthBetween}
            onXForTime={timeToX}
            playheadX={playheadX()}
            rulerMinorTicks={rulerMinorTicks()}
            rulerTicks={rulerTicks()}
            width={timelineWidth()}
          />
        </div>
      </div>

      <div class="grid h-3.5 grid-cols-[12rem_minmax(0,1fr)] items-center border-t border-[#cfd4d8] bg-[#f1f1f1]">
        <div class="flex h-full items-end bg-[#edf2f2] px-3">
          <div class="flex w-full items-center gap-2" style={{ height: `${scrollbarHeight()}px` }}>
            <ZoomButton label="Zoom out timeline" onClick={() => updateZoom(zoomLevel() - ZOOM_BUTTON_STEP)}>
              <ZoomOutIcon {...decorativeIconProps} class="h-3.5 w-3.5" />
            </ZoomButton>
            <input
              aria-label="Timeline zoom"
              class="h-full min-w-0 flex-1 accent-[#8c9499]"
              data-timeline-zoom
              max="1"
              min="0"
              onInput={updateZoomFromInput}
              step="0.01"
              type="range"
              value={zoomLevel()}
            />
            <ZoomButton label="Zoom in timeline" onClick={() => updateZoom(zoomLevel() + ZOOM_BUTTON_STEP)}>
              <ZoomInIcon {...decorativeIconProps} class="h-3.5 w-3.5" />
            </ZoomButton>
          </div>
        </div>

        <div
          class="relative h-full border-l border-[#ccd4d7] bg-[#edf2f2]"
          data-timeline-zoom-level={zoomLevel().toFixed(2)}
        >
          <div
            ref={(element) => {
              timelineScrollbar = element;
              scheduleScrollbarHeightUpdate();
            }}
            aria-label="Timeline horizontal scroll"
            class="timeline-editor-scrollbar absolute right-0 bottom-0 left-0 overflow-x-auto overflow-y-hidden"
            data-timeline-scrollbar
            onScroll={handleTimelineScrollbarScroll}
            style={{ height: `${scrollbarHeight()}px` }}
            tabIndex={0}
          >
            <div class="h-px" style={{ width: `${timelineWidth()}px` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineSvgSurface(props: {
  readonly groups: readonly TimelineEditorGroup[];
  readonly hasTimeline: boolean;
  readonly height: number;
  readonly isScrubbing: boolean;
  readonly onWidthBetween: (startMs: number, endMs: number) => number;
  readonly onXForTime: (ms: number) => number;
  readonly playheadX: number;
  readonly rulerMinorTicks: readonly RulerMinorTick[];
  readonly rulerTicks: readonly RulerTick[];
  readonly width: number;
}) {
  return (
    <svg
      aria-label="Timeline drawing surface"
      class="block bg-[#eaf1f1]"
      data-timeline-svg
      height={props.height}
      role="img"
      viewBox={`0 0 ${props.width} ${props.height}`}
      width={props.width}
    >
      <rect fill="#eaf1f1" height={props.height} width={props.width} x="0" y="0" />
      <rect fill="transparent" height={props.height} pointer-events="all" width={props.width} x="0" y="0" />
      <rect fill="#f7f7f7" height={RULER_HEIGHT} width={props.width} x="0" y="0" />
      <line stroke="#c6ccd0" x1="0" x2={props.width} y1={RULER_HEIGHT - 0.5} y2={RULER_HEIGHT - 0.5} />

      <g transform={`translate(0 ${RULER_HEIGHT})`}>
        <Index each={props.groups}>
          {(_, groupIndex) => <TimelineSvgGroupLanes groupIndex={groupIndex} width={props.width} />}
        </Index>
      </g>

      <Index each={props.rulerTicks}>
        {(tick) => <line opacity="0.7" stroke="#cbd4d7" x1={tick().x} x2={tick().x} y1="0" y2={props.height} />}
      </Index>

      <Index each={props.rulerMinorTicks}>
        {(tick) => (
          <line
            stroke={tick().isMajor ? '#c9d0d5' : '#aeb8bf'}
            x1={tick().x}
            x2={tick().x}
            y1="0"
            y2={tick().isMajor ? RULER_HEIGHT : 6}
          />
        )}
      </Index>

      <Index each={props.rulerTicks}>
        {(tick) => (
          <text fill="#65717a" font-family={MONO_FONT_FAMILY} font-size="10" x={tick().x + 4} y="17">
            {tick().label}
          </text>
        )}
      </Index>

      <g transform={`translate(0 ${RULER_HEIGHT})`}>
        <Index each={props.groups}>
          {(group, groupIndex) => (
            <TimelineSvgGroupMarks
              group={group()}
              groupIndex={groupIndex}
              onWidthBetween={props.onWidthBetween}
              onXForTime={props.onXForTime}
              width={props.width}
            />
          )}
        </Index>
      </g>

      <Show when={props.hasTimeline}>
        <g pointer-events="none">
          <line
            stroke={props.isScrubbing ? '#dc2626' : '#ef4444'}
            x1={props.playheadX}
            x2={props.playheadX}
            y1="0"
            y2={props.height}
          />
          <path d={`M ${props.playheadX - 7} 0 L ${props.playheadX + 7} 0 L ${props.playheadX} 8 Z`} fill="#ef4444" />
        </g>
      </Show>
    </svg>
  );
}

function TimelineSvgGroupLanes(props: { readonly groupIndex: number; readonly width: number }) {
  const top = () => props.groupIndex * (HEADER_HEIGHT + ROW_HEIGHT * 2);
  const motionTop = () => top() + HEADER_HEIGHT;
  const actionTop = () => motionTop() + ROW_HEIGHT;

  return (
    <>
      <TimelineSvgLane height={HEADER_HEIGHT} tone="header" width={props.width} y={top()} />
      <TimelineSvgLane height={ROW_HEIGHT} tone="row" width={props.width} y={motionTop()} />
      <TimelineSvgLane height={ROW_HEIGHT} tone="alt" width={props.width} y={actionTop()} />
    </>
  );
}

function TimelineSvgGroupMarks(props: {
  readonly group: TimelineEditorGroup;
  readonly groupIndex: number;
  readonly onWidthBetween: (startMs: number, endMs: number) => number;
  readonly onXForTime: (ms: number) => number;
  readonly width: number;
}) {
  const top = () => props.groupIndex * (HEADER_HEIGHT + ROW_HEIGHT * 2);
  const motionTop = () => top() + HEADER_HEIGHT;
  const actionTop = () => motionTop() + ROW_HEIGHT;
  const groupSpanWidth = () => props.onWidthBetween(props.group.startMs, props.group.endMs);

  return (
    <>
      <Show when={props.group.endMs > props.group.startMs}>
        <rect
          fill={props.group.color}
          height="12"
          opacity="0.42"
          rx="2"
          stroke="rgba(255,255,255,0.4)"
          width={groupSpanWidth()}
          x={props.onXForTime(props.group.startMs)}
          y={top() + 6}
        />
      </Show>

      <Index each={props.group.segments}>
        {(segment) => {
          const startX = () => props.onXForTime(segment().startMs);
          const endX = () => props.onXForTime(segment().startMs + segment().durationMs);
          const y = () => motionTop() + 12;

          return (
            <g>
              <title>
                {segment().phase ?? 'Motion'} {formatTimelineTime(segment().startMs)}-
                {formatTimelineTime(segment().startMs + segment().durationMs)}
              </title>
              <line stroke={KEYFRAME_COLOR} x1={startX()} x2={endX()} y1={y()} y2={y()} />
              <TimelineSvgDiamond color={KEYFRAME_COLOR} viewportWidth={props.width} x={startX()} y={y()} />
              <TimelineSvgDiamond color={KEYFRAME_COLOR} viewportWidth={props.width} x={endX()} y={y()} />
            </g>
          );
        }}
      </Index>

      <Index each={props.group.actions}>
        {(action) => (
          <TimelineSvgDiamond
            color={KEYFRAME_COLOR}
            title={`${action().kind} ${formatTimelineTime(action().atMs)}`}
            viewportWidth={props.width}
            x={props.onXForTime(action().atMs)}
            y={actionTop() + 12}
          />
        )}
      </Index>
    </>
  );
}

function TimelineSvgLane(props: {
  readonly height: number;
  readonly tone: 'alt' | 'header' | 'row';
  readonly width: number;
  readonly y: number;
}) {
  return (
    <>
      <rect fill={timelineLaneFill(props.tone)} height={props.height} width={props.width} x="0" y={props.y} />
      <line stroke="#dce4e6" x1="0" x2={props.width} y1={props.y + props.height} y2={props.y + props.height} />
    </>
  );
}

function TimelineSvgDiamond(props: {
  readonly color: string;
  readonly title?: string;
  readonly viewportWidth: number;
  readonly x: number;
  readonly y: number;
}) {
  const half = KEYFRAME_SIZE / 2;
  const x = () => Math.min(Math.max(props.x, half), Math.max(half, props.viewportWidth - half));

  return (
    <rect
      fill={props.color}
      height={KEYFRAME_SIZE}
      stroke="#f4b6b1"
      transform={`rotate(45 ${x()} ${props.y})`}
      width={KEYFRAME_SIZE}
      x={x() - half}
      y={props.y - half}
    >
      <Show when={props.title}>{(title) => <title>{title()}</title>}</Show>
    </rect>
  );
}

function timelineLaneFill(tone: 'alt' | 'header' | 'row'): string {
  switch (tone) {
    case 'alt':
      return '#e8efef';
    case 'header':
      return '#dce9ec';
    case 'row':
      return '#eef4f4';
    default: {
      const exhaustive: never = tone;
      throw new Error(`Unhandled lane tone: ${exhaustive}`);
    }
  }
}

function TimelineLabelRow(props: { readonly label: string }) {
  return (
    <div class="flex h-6 items-center border-b border-[#e2e6e9] bg-[#f7f8f9] px-8 text-[0.69rem] text-[#4b5b65]">
      <span class="truncate">{props.label}</span>
    </div>
  );
}

function TransportButton(props: {
  readonly children: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      class="grid h-7 w-9 place-items-center border-r border-[#c9cdd2] bg-gradient-to-b from-white to-[#edf0f2] text-[#334155] transition last:border-r-0 hover:from-white hover:to-[#e1e7eb]"
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}

function ZoomButton(props: { readonly children: JSX.Element; readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      aria-label={props.label}
      class="grid h-full w-5 shrink-0 place-items-center text-[#6f7b83] transition hover:text-[#24313a]"
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}

function formatTick(ms: number): string {
  const seconds = ms / 1000;

  if (ms % 1000 === 0) {
    return String(seconds);
  }

  return seconds.toFixed(1);
}

function clampZoomLevel(zoomLevel: number): number {
  return Math.min(Math.max(zoomLevel, 0), 1);
}

function pointerColor(index: number): string {
  return POINTER_COLORS[index % POINTER_COLORS.length] ?? POINTER_COLORS[0];
}

function rulerStepMs(pixelsPerSecond: number): number {
  const targetSpacingPx = 82;

  return RULER_STEPS_MS.find((stepMs) => (stepMs / 1000) * pixelsPerSecond >= targetSpacingPx) ?? 5000;
}

function zoomToPixelsPerSecond(zoomLevel: number): number {
  return MIN_PIXELS_PER_SECOND + clampZoomLevel(zoomLevel) * (MAX_PIXELS_PER_SECOND - MIN_PIXELS_PER_SECOND);
}

function formatTimelineTime(ms: number): string {
  const clampedMs = Math.max(0, ms);
  const minutes = Math.floor(clampedMs / 60000);
  const seconds = Math.floor((clampedMs % 60000) / 1000);
  const centiseconds = Math.floor((clampedMs % 1000) / 10);

  return `${padTime(minutes)}:${padTime(seconds)}:${padTime(centiseconds)}`;
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}
