import { Button } from '@app-game/components/ui/button';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { motionProjection, motionPaintOrder, motionSurfaceColor, motionSegments, pointerSegments, onionPoses, visibleMotionPose, windowMotionPoints, type MotionPoint, type StackFrame, type StackCapture, type MotionTrack } from './motionView';
import { createMotionViewport } from './createMotionViewport';
import styles from './CardStackDebug.module.css';

/** Draws measured outlines and unsmoothed paths. Bounds remain stable while scrubbing. */
export function MotionPlot(props: {
  occlusion: boolean;
  tracks: readonly (MotionTrack & { visible: boolean; onion: boolean; trajectory: boolean })[];
  fitMotion: boolean;
  onFitMotion: (fit: boolean) => void;
  events: readonly StackCapture['events'][number][];
  pointer: boolean;
  selectedEvent: StackCapture['events'][number] | undefined;
  frames: readonly StackFrame[];
  points: readonly MotionPoint[];
  index: number;
  ghosts: number;
  windowMs: number;
  includeHidden: boolean;
  onSvg: (element: SVGSVGElement) => void;
}) {
  const [host, setHost] = createSignal<HTMLDivElement>();
  const size = createElementSize(host);
  const allPoints = createMemo(() => props.tracks.flatMap(track => track.points));
  const width = () => Math.max(240, size.width ?? 600);
  const height = () => Math.max(60, size.height ?? 400);
  const viewport = createMotionViewport(host, () => ({ width: width(), height: height() }));
  const camera = viewport.camera;
  const gridStep = () => 20 * camera().zoom;
  const gridId = `motion-grid-${createUniqueId()}`;
  const frame = () => props.frames[props.index];
  const time = () => frame()?.t ?? 0;
  const fitted = createMemo(() => motionProjection(props.frames, allPoints(), width(), height(), props.fitMotion, props.pointer ? props.events.flatMap((event) => event.data.pointer ? [event.data.pointer] : []) : []));
  const projection = createMemo(() => ({
    scale: fitted().scale * camera().zoom,
    x: (x: number) => (fitted().x(x) - width() / 2) * camera().zoom + width() / 2 + camera().x,
    y: (y: number) => (fitted().y(y) - height() / 2) * camera().zoom + height() / 2 + camera().y
  }));
  const layers = createMemo(() => props.tracks.map(track => {
    const points = windowMotionPoints(track.points, time(), props.windowMs);
    return { ...track, segments: motionSegments(points, props.includeHidden), ghosts: onionPoses(points, props.ghosts, props.includeHidden), current: track.points.find(point => point.frame === props.index) };
  }));
  const surfaces = createMemo(() => motionPaintOrder((frame()?.data.elements ?? []).filter(element => {
    if (!props.tracks.some(track => track.instance === element.instance && track.visible)) return false;
    return props.includeHidden || (props.occlusion
      ? element.paint.opacity > 0 && element.paint.visibility !== 'hidden' && element.paint.visibility !== 'collapse' && element.paint.width > 0 && element.paint.height > 0
      : visibleMotionPose({ element, frame: props.index, t: time() }));
  })));
  const inputs = createMemo(() => pointerSegments(windowMotionPoints(props.events, time(), props.windowMs)));
  const elapsed = (t: number) => Math.round(t - (props.frames[0]?.t ?? 0));
  const color = (t: number) => t < time() ? '#8ab4f8' : t > time() ? '#f6c46c' : '#81c995';
  const path = (segment: readonly MotionPoint[]) => segment.map(({ element: e }, i) =>
    `${i ? 'L' : 'M'}${projection().x(e.x + e.width / 2)},${projection().y(e.y + e.height / 2)}`
  ).join(' ');

  return (
    <div class={styles.plotArea}>
      <div ref={setHost} class={styles.sceneWrap} data-motion-viewport="" data-panning={viewport.dragging() ? 'true' : 'false'} tabindex={0} role="group" aria-label="Motion canvas navigation" title="Drag to pan. Scroll or pinch to zoom. Double-click or press 0 to reset. Arrow keys pan; + and − zoom.">
      <svg ref={props.onSvg} data-motion-scene="" class={styles.scene} viewBox={`0 0 ${width()} ${height()}`} width={width()} height={height()} role="img" aria-label="Onion skin and element center trajectory">
        <title>{`${props.tracks.map(track => track.label).join(', ') || 'Notebook'} at ${elapsed(time())} ms: onion skin and center trajectories`}</title>
        <desc>Blue outlines precede the selected sample; orange outlines follow it. Green marks the selected pose. Dashed outlines are the recorded deck bounds. Purple shows recorded pointer paths, with down/up markers and a crosshair at the selected input. Input and DOM samples have independent timestamps. Occlusion uses opaque recorded panel/tab bounds ordered by parent card z-index, DOM order and local z-index. It is a geometric diagnostic, not a pixel replay; CSS clipping and transparency are not reproduced.</desc>
        <defs><pattern id={gridId} width={gridStep()} height={gridStep()} x={camera().x + width() / 2 * (1 - camera().zoom)} y={camera().y + height() / 2 * (1 - camera().zoom)} patternUnits="userSpaceOnUse"><path d={`M${gridStep()} 0H0V${gridStep()}`} fill="none" stroke="#35373c" stroke-width="0.6" /></pattern></defs>
        <rect width={width()} height={height()} fill="#202124" />
        <rect width={width()} height={height()} fill={`url(#${gridId})`} />
        <Show when={frame()}>{(sample) => <>
          <rect x={projection().x(0)} y={projection().y(0)} width={sample().data.root.width * projection().scale} height={sample().data.root.height * projection().scale} fill="none" stroke="#5f6368" stroke-dasharray="4 4" />
        </>}</Show>
        <g data-motion-surfaces="" data-occlusion={props.occlusion ? 'true' : 'false'}>
          <For each={surfaces()}>{(element) => {
            const bounds = () => props.occlusion ? element.paint : element;
            const label = `${element.itemId} / ${element.part}${element.representation === 'echo' ? ' / echo' : ''} · z ${element.paint.cardZ}`;
            return <g data-current-pose="" data-surface-instance={element.instance} data-stack-z={element.paint.cardZ}>
              <title>{label} · DOM {element.paint.domOrder} · local z {element.paint.localZ}</title>
              <rect x={projection().x(bounds().x)} y={projection().y(bounds().y)} width={bounds().width * projection().scale} height={bounds().height * projection().scale} rx="2" fill={props.occlusion ? motionSurfaceColor(element.itemId) : '#81c995'} fill-opacity={props.occlusion ? '1' : '.12'} stroke={props.occlusion ? '#a6b5c2' : '#81c995'} stroke-width={props.occlusion ? '1.2' : '2.4'} />
              <Show when={props.occlusion} fallback={<circle cx={projection().x(element.x + element.width / 2)} cy={projection().y(element.y + element.height / 2)} r="4" fill="#81c995" />}>
                <svg x={projection().x(bounds().x) + 5} y={projection().y(bounds().y) + 3} width={Math.max(0, bounds().width * projection().scale - 10)} height={Math.max(0, bounds().height * projection().scale - 6)} overflow="hidden">
                  <text x="0" y="11" fill="#f1f3f4" font-size="10" font-family="Arial, sans-serif">{label}</text>
                </svg>
              </Show>
            </g>;
          }}</For>
        </g>
        <For each={layers()}>{(layer) => <g data-motion-track={layer.key}>
          <title>{layer.label}</title>
        <Show when={layer.onion}><g data-onion-skin="">
          <For each={layer.ghosts}>{({ element: e, t, frame: index }) => (
            <rect data-ghost-frame={index} x={projection().x(e.x)} y={projection().y(e.y)} width={e.width * projection().scale} height={e.height * projection().scale} rx="2" fill="none" stroke={color(t)} stroke-width="1.2" opacity="0.55">
              <title>{`${layer.label} · ${elapsed(t)} ms · x ${e.x.toFixed(1)}, y ${e.y.toFixed(1)} px`}</title>
            </rect>
          )}</For>
        </g></Show>
        <Show when={layer.trajectory}><g data-motion-trajectory="">
          <For each={layer.segments}>{(segment) => <path d={path(segment)} fill="none" stroke="#8ab4f8" stroke-width="1.6" />}</For>
          <For each={layer.ghosts}>{({ element: e, t }) => (
            <circle cx={projection().x(e.x + e.width / 2)} cy={projection().y(e.y + e.height / 2)} r="3" fill={color(t)}><title>{layer.label} · {elapsed(t)} ms</title></circle>
          )}</For>
        </g></Show>
        </g>}</For>
        <Show when={props.pointer}><g data-pointer-trajectory="">
          <For each={inputs()}>{(segment) => <>
            <path d={segment.map(({ pointer: p }, i) => `${i ? 'L' : 'M'}${projection().x(p.rootX)},${projection().y(p.rootY)}`).join(' ')} fill="none" stroke="#d7aefb" stroke-width="1.8" stroke-dasharray="4 3" />
            <For each={segment.filter((event) => event.data.type !== 'pointermove')}>{(event) => <g>
              <circle cx={projection().x(event.pointer.rootX)} cy={projection().y(event.pointer.rootY)} r="5" fill={event.data.type === 'pointerdown' ? '#d7aefb' : '#202124'} stroke={event.data.type === 'pointercancel' ? '#f28b82' : '#d7aefb'} stroke-width="2"><title>{elapsed(event.t)} ms · {event.data.type} · {event.data.receiver?.label}</title></circle>
            </g>}</For>
          </>}</For>
          <Show when={props.selectedEvent?.data.pointer}>{(p) => <g data-current-pointer="">
            <circle cx={projection().x(p().rootX)} cy={projection().y(p().rootY)} r="9" fill="#d7aefb" fill-opacity=".2" stroke="#d7aefb" stroke-width="1.5" />
            <path d={`M${projection().x(p().rootX) - 13},${projection().y(p().rootY)}h26 M${projection().x(p().rootX)},${projection().y(p().rootY) - 13}v26`} stroke="#d7aefb" stroke-width="1" />
            <title>{props.selectedEvent?.data.type} · {elapsed(props.selectedEvent?.t ?? 0)} ms · target: {props.selectedEvent?.data.receiver?.label} · hit: {props.selectedEvent?.data.hit?.label}</title>
          </g>}</Show>
        </g></Show>
        <Show when={!props.frames.length}><text x={width() / 2} y={height() / 2} text-anchor="middle" fill="#9aa0a6" font-size="12" font-family="system-ui">Record to inspect motion</text></Show>
      </svg>
      </div>
      <div class={styles.legend}><span><i style={{ background: '#8ab4f8' }} />Past</span><span><i style={{ background: '#81c995' }} />Selected</span><span><i style={{ background: '#f6c46c' }} />Future</span><Show when={props.pointer}><span><i style={{ background: '#d7aefb' }} />Pointer</span></Show><div class={styles.viewControls} role="group" aria-label="Canvas zoom">
        <Button variant="ghost" size="sm" type="button" aria-label="Zoom out" title="Zoom out" disabled={camera().zoom <= .25} onClick={() => viewport.zoom(.8)}>−</Button>
        <Button variant="ghost" size="sm" type="button" aria-label="Reset view" title="Reset view" data-motion-zoom="" onClick={viewport.reset}>{Math.round(camera().zoom * 100)}%</Button>
        <Button variant="ghost" size="sm" type="button" aria-label="Zoom in" title="Zoom in" disabled={camera().zoom >= 16} onClick={() => viewport.zoom(1.25)}>+</Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => { props.onFitMotion(!props.fitMotion); viewport.reset(); }}>{props.fitMotion ? 'Fit deck' : 'Fit motion'}</Button>
      </div></div>
      <PositionPlot frames={props.frames} points={props.points} index={props.index} includeHidden={props.includeHidden} />
    </div>
  );
}

/** Shares the actual time scale; separates x/y so straight-line jumps remain visible. */
function PositionPlot(props: { frames: readonly StackFrame[]; points: readonly MotionPoint[]; index: number; includeHidden: boolean }) {
  const [host, setHost] = createSignal<HTMLDivElement>();
  const size = createElementSize(host);
  const width = () => Math.max(120, size.width ?? 600);
  const height = () => Math.max(70, size.height ?? 100);
  const baseline = () => height() - 22;
  const domain = createMemo(() => {
    const values = props.points.flatMap(({ element }) => [element.x, element.y]);
    const min = Math.min(0, ...values), max = Math.max(1, ...values);
    const pad = Math.max(1, (max - min) * 0.1);
    return { min: min - pad, max: max + pad };
  });
  const first = () => props.frames[0]?.t ?? 0;
  const duration = () => Math.max(1, (props.frames.at(-1)?.t ?? 1) - first());
  const x = (t: number) => 44 + (t - first()) / duration() * (width() - 58);
  const y = (value: number) => (baseline() - 3) - (value - domain().min) / (domain().max - domain().min) * (baseline() - 27);
  const path = (segment: readonly MotionPoint[], axis: 'x' | 'y') => segment.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p.element[axis])}`).join(' ');
  const current = () => props.points.find((point) => point.frame === props.index);
  return (
    <div ref={setHost} class={styles.chartWrap}><svg data-position-plot="" class={styles.positionPlot} viewBox={`0 0 ${width()} ${height()}`} width={width()} height={height()} role="img" aria-label="Horizontal and vertical position over time in milliseconds">
      <text x="0" y="13" fill="#9aa0a6" font-size="11">Position, px</text>
      <text x={width() - 88} y="13" fill="#8ab4f8" font-size="12">— x</text><text x={width() - 40} y="13" fill="#f6c46c" font-size="12">— y</text>
      <path d={`M44 23V${baseline()}H${width() - 14}`} fill="none" stroke="#3c4043" />
      <text x="36" y="32" text-anchor="end" fill="#9aa0a6" font-size="11">{Math.round(domain().max)}</text>
      <text x="36" y={baseline()} text-anchor="end" fill="#9aa0a6" font-size="11">{Math.round(domain().min)}</text>
      <For each={motionSegments(props.points, props.includeHidden)}>{(segment) => <>
        <path data-position-axis="x" d={path(segment, 'x')} stroke="#8ab4f8" fill="none" stroke-width="1.7" />
        <path data-position-axis="y" d={path(segment, 'y')} stroke="#f6c46c" fill="none" stroke-width="1.7" />
      </>}</For>
      <Show when={props.frames[props.index]}>{(frame) => <path d={`M${x(frame().t)} 23V${baseline()}`} stroke="#81c995" stroke-dasharray="3 3" />}</Show>
      <Show when={current() && (props.includeHidden || visibleMotionPose(current()!)) ? current() : undefined}>{(p) => <>
        <circle cx={x(p().t)} cy={y(p().element.x)} r="3" fill="#8ab4f8" />
        <circle cx={x(p().t)} cy={y(p().element.y)} r="3" fill="#f6c46c" />
      </>}</Show>
      <text x="44" y={height() - 4} fill="#9aa0a6" font-size="11">0</text><text x={width() - 14} y={height() - 4} text-anchor="end" fill="#9aa0a6" font-size="11">{props.frames.length ? Math.round(duration()) : 0} ms</text>
    </svg></div>
  );
}
