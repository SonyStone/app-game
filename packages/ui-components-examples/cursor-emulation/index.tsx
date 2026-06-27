import { createMemo, createSignal, onCleanup, onMount, type ComponentProps } from 'solid-js';
import { CursorOverlay, type CursorOverlayPath, type TouchPointerView } from './CursorOverlay';
import { MetricsPanel, type LoggedEvent, type MetricValue } from './components/MetricsPanel';
import { TargetButton } from './components/TargetButton';
import { TimelineEditor } from './components/TimelineEditor';
import { Toolbar } from './components/Toolbar';
import { TransformPanel } from './components/TransformPanel';
import {
  createEventDispatcher,
  type DispatchAction,
  type DispatchPointer,
  type DispatchPosition
} from './eventDispatcher';
import { clamp, distance } from './geometry';
import { createPinchScaleController } from './pinchScaleController';
import {
  createEmptyTimelineSample,
  getTimelineActionsBetween,
  getTimelinePaths,
  sampleTimeline,
  type TimelineAction,
  type TimelineDefinition,
  type TimelinePosition,
  type TimelineSample
} from './timeline';
import { createCursorClickTimeline, createPinchInOutTimeline } from './timelinePresets';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'cursor-emulation': ComponentProps<'div'>;
    }
  }
}

type GestureMode = 'Click' | 'Pinch';

const DEFAULT_SAMPLE = createEmptyTimelineSample();

export default function CursorEmulationExample() {
  const [buttonRef, setButtonRef] = createSignal<HTMLButtonElement>();
  const [clickCount, setClickCount] = createSignal(0);
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [eventLog, setEventLog] = createSignal<readonly LoggedEvent[]>([]);
  const [gestureMode, setGestureMode] = createSignal<GestureMode>('Click');
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [mouseMoveCount, setMouseMoveCount] = createSignal(0);
  const [pinchPanelRef, setPinchPanelRef] = createSignal<HTMLDivElement>();
  const [pinchScale, setPinchScale] = createSignal(1);
  const [pointerMoveCount, setPointerMoveCount] = createSignal(0);
  const [sample, setSample] = createSignal<TimelineSample>(DEFAULT_SAMPLE);
  const [timeline, setTimeline] = createSignal<TimelineDefinition>();

  const dispatcher = createEventDispatcher();
  const pinchScaleController = createPinchScaleController({
    getScale: pinchScale,
    onEvent: recordEvent,
    setScale: setPinchScale
  });

  let eventId = 0;
  let frameId: number | undefined;
  let previousElapsedMs = -1;
  let runId = 0;

  const cursorPoint = createMemo(
    () => sample().positions.find((position) => position.pointer.appearance === 'cursor')?.point
  );
  const metrics = createMemo((): readonly MetricValue[] => [
    {
      label: 'Gesture',
      value: gestureMode()
    },
    {
      label: 'Phase',
      value: sample().phase
    },
    {
      label: 'Clicks',
      value: String(clickCount())
    },
    {
      label: 'Pointer',
      value: String(pointerMoveCount())
    },
    {
      label: 'Scale',
      value: (gestureMode() === 'Pinch' ? pinchScale() : 1).toFixed(2)
    }
  ]);
  const overlayPaths = createMemo((): readonly CursorOverlayPath[] => {
    const activeTimeline = timeline();

    if (!activeTimeline) {
      return [];
    }

    return getTimelinePaths(activeTimeline).map((path) => ({
      d: path.d,
      dashArray: gestureMode() === 'Pinch' ? '3 8' : '7 9',
      id: path.id,
      stroke: gestureMode() === 'Pinch' ? '#be123c' : '#0e7490'
    }));
  });
  const touchPointers = createMemo((): readonly TouchPointerView[] =>
    sample()
      .positions.filter((position) => position.pointer.appearance === 'touch')
      .map((position) => ({
        id: position.pointer.id,
        isPrimary: position.pointer.isPrimary,
        point: position.point
      }))
  );

  function cancelPlayback(): void {
    stopPlayback();
    resetDispatchState();
  }

  function stopPlayback(): void {
    runId += 1;

    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      frameId = undefined;
    }

    setIsPlaying(false);
  }

  function resetDispatchState(): void {
    previousElapsedMs = -1;
    dispatcher.reset();
    pinchScaleController.reset();
  }

  function playClick(): void {
    const button = buttonRef();

    if (!button) {
      return;
    }

    setClickCount(0);
    playTimeline(
      createCursorClickTimeline(button.getBoundingClientRect(), {
        height: window.innerHeight,
        width: window.innerWidth
      }),
      'Click'
    );
  }

  function playPinch(): void {
    const panel = pinchPanelRef();

    if (!panel) {
      return;
    }

    setClickCount(0);
    setPinchScale(1);
    playTimeline(createPinchInOutTimeline(panel.getBoundingClientRect()), 'Pinch');
  }

  function playTimeline(nextTimeline: TimelineDefinition, nextGestureMode: GestureMode): void {
    cancelPlayback();
    resetEventCounters();
    setGestureMode(nextGestureMode);
    setTimeline(nextTimeline);
    setElapsedMs(0);
    setSample(sampleTimeline(nextTimeline, 0));
    startPlayback(nextTimeline, 0);
  }

  function playActiveTimeline(): void {
    const activeTimeline = timeline();

    if (!activeTimeline) {
      playClick();
      return;
    }

    const startElapsedMs = elapsedMs() >= activeTimeline.durationMs ? 0 : elapsedMs();

    if (startElapsedMs === 0) {
      resetDispatchState();
      resetEventCounters();
      setClickCount(0);

      if (gestureMode() === 'Pinch') {
        setPinchScale(1);
      }
    }

    startPlayback(activeTimeline, startElapsedMs);
  }

  function startPlayback(nextTimeline: TimelineDefinition, startElapsedMs: number): void {
    stopPlayback();

    const nextRunId = runId + 1;
    const clampedStartMs = clampTimelineElapsed(nextTimeline, startElapsedMs);
    const startedAt = performance.now() - clampedStartMs;

    runId = nextRunId;
    previousElapsedMs = clampedStartMs <= 0 ? -1 : clampedStartMs;
    setIsPlaying(true);
    tick(performance.now());

    function tick(now: number): void {
      if (runId !== nextRunId) {
        return;
      }

      const elapsedMs = Math.min(now - startedAt, nextTimeline.durationMs);
      const nextSample = sampleTimeline(nextTimeline, elapsedMs);
      const dispatchPositions = nextSample.positions.map(toDispatchPosition);
      const dispatchActions = getTimelineActionsBetween(nextTimeline, previousElapsedMs, elapsedMs).map(
        toDispatchAction
      );

      setSample(nextSample);
      setElapsedMs(nextSample.elapsedMs);
      dispatcher.dispatchPositions(dispatchPositions);
      dispatcher.dispatchActions(dispatchActions, dispatchPositions);
      previousElapsedMs = elapsedMs;

      if (nextSample.done) {
        frameId = undefined;
        setIsPlaying(false);
        return;
      }

      frameId = requestAnimationFrame(tick);
    }
  }

  function pausePlayback(): void {
    stopPlayback();
    previousElapsedMs = elapsedMs();
  }

  function seekTimeline(nextElapsedMs: number): void {
    const activeTimeline = timeline();

    if (!activeTimeline) {
      return;
    }

    pausePlayback();

    const clampedElapsedMs = clampTimelineElapsed(activeTimeline, nextElapsedMs);
    const nextSample = sampleTimeline(activeTimeline, clampedElapsedMs);

    setElapsedMs(nextSample.elapsedMs);
    setSample(nextSample);
    previousElapsedMs = nextSample.elapsedMs;
    dispatcher.reset();
    pinchScaleController.reset();

    if (nextSample.elapsedMs === 0) {
      resetEventCounters();
      setClickCount(0);
    }

    if (gestureMode() === 'Pinch') {
      setPinchScale(previewTouchScale(activeTimeline, nextSample) ?? 1);
    }
  }

  function recordEvent(event: MouseEvent | PointerEvent): void {
    const loggedEvent: LoggedEvent = {
      id: eventId,
      source: event.isTrusted ? 'trusted' : 'script',
      target: describeTarget(event.target),
      type: event.type,
      x: Math.round(event.clientX),
      y: Math.round(event.clientY)
    };

    eventId += 1;

    setEventLog((events) => [loggedEvent, ...events].slice(0, 9));

    if (event.type === 'pointermove') {
      setPointerMoveCount((count) => count + 1);
    }

    if (event.type === 'mousemove') {
      setMouseMoveCount((count) => count + 1);
    }
  }

  function resetEventCounters(): void {
    eventId = 0;
    setEventLog([]);
    setMouseMoveCount(0);
    setPointerMoveCount(0);
  }

  onMount(() => {
    const timeoutId = window.setTimeout(playClick, 500);

    window.addEventListener('resize', handleResize);

    onCleanup(() => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    });
  });

  onCleanup(cancelPlayback);

  return (
    <cursor-emulation
      class="relative block min-h-screen overflow-hidden bg-zinc-50 text-zinc-950"
      onMouseMove={recordEvent}
      onPointerMove={recordEvent}
    >
      <Toolbar onReplayClick={playClick} onReplayPinch={playPinch} />

      <div class="grid min-h-screen grid-cols-1 place-items-center gap-10 px-6 pt-28 pb-80 lg:grid-cols-2">
        <TargetButton
          clicked={clickCount() > 0}
          label="Click me"
          onClick={(event) => {
            recordEvent(event);
            setClickCount((count) => count + 1);
          }}
          onMouseDown={recordEvent}
          onMouseUp={recordEvent}
          onPointerDown={recordEvent}
          onPointerUp={recordEvent}
          ref={setButtonRef}
        />

        <TransformPanel
          label="Pinch zoom in, then out"
          onPointerCancel={pinchScaleController.onPointerUp}
          onPointerDown={pinchScaleController.onPointerDown}
          onPointerMove={pinchScaleController.onPointerMove}
          onPointerUp={pinchScaleController.onPointerUp}
          ref={setPinchPanelRef}
          scale={pinchScale()}
          tone="cyan"
        />
      </div>

      <MetricsPanel class="bottom-[18.5rem]" events={eventLog()} metrics={metrics()} />
      <CursorOverlay cursor={cursorPoint()} paths={overlayPaths()} touchPointers={touchPointers()} />
      <TimelineEditor
        elapsedMs={elapsedMs()}
        isPlaying={isPlaying()}
        onPause={pausePlayback}
        onPlay={playActiveTimeline}
        onSeek={seekTimeline}
        onSkipToEnd={() => {
          const activeTimeline = timeline();

          if (activeTimeline) {
            seekTimeline(activeTimeline.durationMs);
          }
        }}
        onSkipToStart={() => seekTimeline(0)}
        timeline={timeline()}
      />
    </cursor-emulation>
  );

  function handleResize(): void {
    const activeTimeline = timeline();

    if (!activeTimeline) {
      return;
    }

    if (gestureMode() === 'Click') {
      const button = buttonRef();

      if (button) {
        replaceTimeline(
          createCursorClickTimeline(button.getBoundingClientRect(), {
            height: window.innerHeight,
            width: window.innerWidth
          })
        );
      }
    } else {
      const panel = pinchPanelRef();

      if (panel) {
        replaceTimeline(createPinchInOutTimeline(panel.getBoundingClientRect()));
      }
    }
  }

  function replaceTimeline(nextTimeline: TimelineDefinition): void {
    const wasPlaying = isPlaying();
    const nextElapsedMs = clampTimelineElapsed(nextTimeline, elapsedMs());
    const nextSample = sampleTimeline(nextTimeline, nextElapsedMs);

    stopPlayback();
    setTimeline(nextTimeline);
    setElapsedMs(nextElapsedMs);
    setSample(nextSample);

    if (gestureMode() === 'Pinch') {
      setPinchScale(previewTouchScale(nextTimeline, nextSample) ?? 1);
    }

    if (wasPlaying) {
      startPlayback(nextTimeline, nextElapsedMs);
    }
  }
}

function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return 'document';
  }

  if (target instanceof HTMLElement && target.dataset.cursorTarget) {
    return target.dataset.cursorTarget;
  }

  const tagName = target.tagName.toLowerCase();

  if (tagName === 'cursor-emulation') {
    return 'stage';
  }

  return tagName;
}

function toDispatchAction(action: TimelineAction): DispatchAction {
  return {
    kind: action.kind,
    pointerId: action.pointerId
  };
}

function toDispatchPosition(position: TimelinePosition): DispatchPosition {
  return {
    point: position.point,
    pointer: toDispatchPointer(position)
  };
}

function toDispatchPointer(position: TimelinePosition): DispatchPointer {
  return {
    id: position.pointer.id,
    isPrimary: position.pointer.isPrimary,
    pointerId: position.pointer.pointerId,
    pointerType: position.pointer.pointerType
  };
}

function clampTimelineElapsed(timeline: TimelineDefinition, elapsedMs: number): number {
  return clamp(elapsedMs, 0, timeline.durationMs);
}

function previewTouchScale(timeline: TimelineDefinition, sample: TimelineSample): number | undefined {
  const initialSample = sampleTimeline(timeline, 0);
  const currentTouches = sample.positions.filter((position) => position.pointer.pointerType === 'touch');
  const initialTouches = initialSample.positions.filter((position) => position.pointer.pointerType === 'touch');
  const firstCurrent = currentTouches[0];
  const secondCurrent = currentTouches[1];
  const firstInitial = initialTouches[0];
  const secondInitial = initialTouches[1];

  if (!firstCurrent || !secondCurrent || !firstInitial || !secondInitial) {
    return undefined;
  }

  const initialDistance = distance(firstInitial.point, secondInitial.point);

  if (initialDistance <= 0) {
    return undefined;
  }

  return clamp(distance(firstCurrent.point, secondCurrent.point) / initialDistance, 0.55, 1.9);
}
