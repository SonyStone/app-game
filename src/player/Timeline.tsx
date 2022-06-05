import { createMemo, createSignal, ErrorBoundary } from 'solid-js';

import { Frame } from './interfaces/Frame';
import { TimelinePosition } from './interfaces/TimelinePosition';
import s from './Timeline.module.scss';
import { onDrag } from './utils/onDrag';
import { onResize } from './utils/onResize';
import { useVideoContext } from './VideoContext.provider';

const PADDING = 8 as TimelinePosition;

export default function Timeline() {
  const [size, setSize] = createSignal<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const width = createMemo(() => size().width);

  const [{ totalFrames, currentFrame }, { setCurrentFrame, setPlay }] =
    useVideoContext();

  const ratio = createMemo(() => totalFrames() / (width() - PADDING * 2));

  const position = createMemo(() => (currentFrame() / ratio() || 0) + PADDING);

  onResize;
  onDrag;

  return (
    <ErrorBoundary fallback={<div>Error in Timeline</div>}>
      <div class={s.host} use:onResize={setSize}>
        <div
          class={s.sliderThumb}
          style={{ transform: `translate(${position()}px)` }}>
          <span>{currentFrame()}</span>
        </div>

        <svg xmlns="http://www.w3.org/2000/svg" height="50" width={width()}>
          <rect
            class={s.sliderDragZone}
            x={0}
            y={26}
            height={10}
            width={width()}
          />

          <g></g>

          <path class={s.ruler} />

          <g
            class={s.slider}
            style={{ transform: `translate(${position()}px)` }}>
            <line x1={0} y1={10} x2={0} y2={28} />
            <path d="M-8,36 h16 l-7.5,-8 h-1 z"></path>
            <rect
              use:onDrag={(event) => {
                // console.log(`event`, event.type);

                if (event.type === 'pointerdown') {
                  setPlay(false);
                }
                const clipPosition = event.offsetX - PADDING;
                const frame = Math.round(clipPosition * ratio()) as Frame;
                setCurrentFrame(frame);
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
