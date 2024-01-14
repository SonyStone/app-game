import { createPointerEventsHandler } from '@packages/hammer/pointerevent';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { Animation, AnimationFrame, Vec2 } from 'ogl';
import { For, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import GraphEditorToggle from './graph-editor-toggle';
import PanelResizers from './panel-resizers';

const AXIS_COLORS = ['#ff0000', '#00ff00', '#0000ff'];
const AXIS_NAME = ['x', 'y', 'z'];

export function Timeline(props: { animation?: Animation }) {
  createEffect(() => {
    console.log(`data?`, props.animation?.data?.frames);
  });

  const size = createWindowSize();

  const [frames, setFrames] = createStore<AnimationFrame[]>([]);

  createEffect(() => {
    setFrames(props.animation?.data?.frames ?? []);
  });

  const [position, setPosition] = createSignal<Vec2>(new Vec2(0, 0), { equals: (v1, v2) => !v1.equals(v2) });

  let elementRef: HTMLElement;

  if (true) {
    const pointerEventsHandler = createPointerEventsHandler();

    let start = new Vec2(0, 0);
    let dataset:
      | {
          name: 'keyframe';
          item: number;
          axis: number;
        }
      | undefined;

    let posStart = 0;

    function onStart(e: PointerEvent) {
      e.stopPropagation();
      e.preventDefault();
      const input = pointerEventsHandler(e);

      dataset = (e.target as any).dataset as any;

      if (dataset?.name === 'keyframe') {
        setFrames(dataset.item, 'position', dataset.axis, (p) => {
          posStart = p;
          return posStart + input.delta[1];
        });
      }

      if (!dataset) {
        const p = position();
        p.set(start.add(input.delta as any as Vec2));
        setPosition(p);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
    }

    function onMove(e: PointerEvent) {
      e.stopPropagation();
      e.preventDefault();
      const input = pointerEventsHandler(e);

      if (dataset?.name === 'keyframe') {
        setFrames(dataset.item, 'position', dataset.axis, (p) => posStart + input.delta[1]);
      }

      if (!dataset?.name) {
        const p = position();
        p.set([start[0] + input.delta[0], start[1] + input.delta[1]]);
        setPosition(p);
      }
    }

    function onEnd(e: PointerEvent) {
      e.stopPropagation();
      e.preventDefault();
      const input = pointerEventsHandler(e);

      if (!dataset?.name) {
        const p = position();
        p.set([start[0] + input.delta[0], start[1] + input.delta[1]]);
        start = p.clone();
        setPosition(p);
      }

      if (dataset?.name === 'keyframe') {
        setFrames(dataset.item, 'position', dataset.axis, (p) => {
          return posStart + input.delta[1];
        });
        dataset = undefined;
      }

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      elementRef.addEventListener('pointerdown', onStart);
    }

    onMount(() => {
      elementRef.addEventListener('pointerdown', onStart);
    });

    onCleanup(() => {
      elementRef.removeEventListener('pointerdown', onStart);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
    });
  }

  const [dimensions, setDimensions] = createSignal({
    width: 300,
    height: 300,
    top: 400,
    left: 10
  });

  return (
    <div
      ref={(ref) => {
        elementRef = ref;
      }}
      onWheel={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      style={{
        width: dimensions().width + 'px',
        height: dimensions().height + 'px',
        top: dimensions().top + 'px',
        left: dimensions().left + 'px'
      }}
      class=":uno: fixed h-90 overflow-hidden bg-blue"
    >
      <PanelResizers onDimensionsChange={setDimensions} />
      <GraphEditorToggle />
      <svg xmlns="http://www.w3.org/2000/svg" height={dimensions().height} width={dimensions().width}>
        <g transform={`translate(${position()[0]},${position()[1]})`}>
          <For each={frames}>
            {(frame, index) => (
              <g>
                <For each={frame.position.slice(0, 3)}>
                  {(position, axis) => (
                    <circle
                      data-name="keyframe"
                      data-axis={axis()}
                      data-item={index()}
                      class="hover:stroke-white hover:stroke-2"
                      cx={50 + index() * 10}
                      cy={position}
                      r={4}
                      fill={AXIS_COLORS[axis()]}
                    />
                  )}
                </For>
              </g>
            )}
          </For>
        </g>
      </svg>
    </div>
  );
}
