import { createMemo, createSignal, ErrorBoundary, For } from 'solid-js';

import { Frame } from './interfaces/Frame';
import { TimelinePosition } from './interfaces/TimelinePosition';
import s from './Timeline.module.scss';
import { onDrag } from './utils/onDrag';
import { onResize } from './utils/onResize';

const PADDING = 8 as TimelinePosition;

export default function Timeline(props: {
  totalFrames: Frame;
  currentFrame: Frame;
  progress: (readonly [number, number])[];
  setCurrentFrame: (frame: Frame) => void;
  pause: () => void;
}) {
  const [size, setSize] = createSignal<{ width: number; height: number }>({
    width: 0,
    height: 0
  });

  const width = createMemo(() => size().width);

  const ratio = createMemo(() => props.totalFrames / (width() - PADDING * 2));

  const position = createMemo(() => (props.currentFrame / ratio() || 0) + PADDING);

  function getPosition(frame: Frame) {
    return (100 / props.totalFrames) * frame;
  }

  onResize;
  onDrag;

  return (
    <ErrorBoundary fallback={<div>Error in Timeline</div>}>
      <div class={s.host} use:onResize={setSize}>
        <div class={s.sliderThumb} style={{ transform: `translate(${position()}px)` }}>
          <span>{props.currentFrame}</span>
        </div>

        <svg xmlns="http://www.w3.org/2000/svg" height="50" width={width()}>
          <rect class={s.sliderDragZone} x={0} y={26} height={10} width={'100%'} />

          <For each={props.progress}>
            {(item) => (
              <rect
                class={s.sliderLoaded}
                x={getPosition(item[0]) + '%'}
                y={26}
                height={10}
                width={getPosition(item[1] - item[0]) + '%'}
              ></rect>
            )}
          </For>

          <g></g>

          <path class={s.ruler} />

          <g class={s.slider} style={{ transform: `translate(${position()}px)` }}>
            <line x1={0} y1={10} x2={0} y2={28} />
            <path d="M-8,36 h16 l-7.5,-8 h-1 z"></path>
            <rect
              use:onDrag={(event) => {
                // console.log(`event`, event.type);

                if (event.type === 'pointerdown') {
                  props.pause();
                }
                const clipPosition = event.offsetX - PADDING;
                const frame = Math.round(clipPosition * ratio()) as Frame;
                props.setCurrentFrame(frame);
              }}
              x={-12}
              y={24}
              height={20}
              width={24}
            />
          </g>
        </svg>
      </div>
    </ErrorBoundary>
  );
}
