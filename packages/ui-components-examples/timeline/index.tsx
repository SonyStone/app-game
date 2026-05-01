import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, For } from 'solid-js';
import BackwardIcon from './icons/backward.svg';
import ForwardIcon from './icons/forward.svg';
import PlayIcon from './icons/play.svg';
import SearchIcon from './icons/search.svg';

export default function TimelineExample() {
  return (
    <div class="relative flex h-full flex-col items-center justify-center">
      <h1 class="mb-4 text-2xl font-bold">Timeline Example</h1>
      <p class="text-gray-700">This is a placeholder for the timeline example.</p>

      {/* Add your timeline components here */}

      <div class="z-2 relative flex h-full w-full flex-col overflow-hidden">
        {/* timeline actions container */}
        <div class="bg-#1f2123 border-t-#3c4144 border-b-#3a3f41 h-41px relative z-10 border-b border-t">
          {/* resize handle */}
          <div class="h-7px absolute inset-x-0 top-0 cursor-ns-resize"></div>

          {/* timeline action buttons */}
          <div class="py-7px px-43px flex">
            <button
              type="button"
              tabindex={0}
              class="rounded-l-4px border-#3a3f41 text-#bcb7ae bg-#1b1e1f w-26px h-27px text-20px float-left flex place-content-center place-items-center border text-center outline-none"
            >
              <BackwardIcon class="scale-y-60 h-14px" />
            </button>
            <button class="border-#3a3f41 text-#bcb7ae bg-#1b1e1f w-26px h-27px text-20px float-left flex place-content-center place-items-center border-y text-center outline-none">
              <PlayIcon class="h-14px" />
            </button>
            <button
              type="button"
              tabindex={0}
              class="rounded-r-4px border-#3a3f41 text-#bcb7ae bg-#1b1e1f w-26px h-27px text-20px float-left flex place-content-center place-items-center border text-center outline-none"
            >
              <ForwardIcon class="scale-y-60 h-14px" />
            </button>
          </div>
        </div>

        {/* timeline content container */}
        <div class="relative flex h-full w-full flex-col overflow-hidden">
          {/* strips background first: 5C6D6B second: 6D7979 */}
          {/* TODO:  */}
          <div
            style={{
              'background-size': `1px ${32}px`
            }}
            class="pl-191px relative left-0 h-full h-full w-full w-full [background-image:linear-gradient(0deg,#5C6D6B_50%,#6D7979_50%,#6D7979_100%)]"
          >
            {/* Timeline at the top */}
            <Timeline />
          </div>
          {/* Timeline zoom handler */}
          <div class="border-t-#383c3f bg-#1f2123 h-15px gap-4px px-14px py-2px bottom-0 left-0 z-10 flex w-full place-items-center border-t">
            <SearchIcon class="h-10px text-#9a9284 float-left" />

            <div class="h-13px w-172px relative overflow-hidden">
              <div class="top-5px border-t-#494f52 absolute left-0 right-0 border-t-2"></div>

              {/* Zoom handle */}
              <div class="left-25px h-10px w-10px bg-#1c1e1f border-#474d50 absolute top-0 rounded-full border"></div>
            </div>
            <SearchIcon class="h-12px text-#9a9284" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Timeline() {
  const [step, setStep] = createSignal(85); // 1 second in pixels
  const [svgRef, setSvgRef] = createSignal<SVGElement | undefined>();

  const [size, setSize] = createSignal<{ height: number; width: number }>({ height: 0, width: 0 });
  createResizeObserver(svgRef, setSize);

  const [currentFrame, setCurrentFrame] = createSignal(60);

  const currentFramePosition = createMemo(() => {
    return `${(currentFrame() * step()) / 60}px`;
  });

  return (
    <svg
      ref={setSvgRef}
      onClick={() => {
        console.log('SVG clicked', svgRef()?.getBoundingClientRect());
      }}
      width="100%"
      height="16px"
      class="z-1 bg-#1a1c1e pointer-events-none select-none [shape-rendering:crispEdges]"
    >
      <TimelineRuler step={step()} height={size().height} />
      <g
        class="cursor-col-resize"
        style={{
          transform: `translateX(${currentFramePosition()})`
        }}
      >
        <line x1={0} y1="0" x2={0} y2={size().height} stroke="transparent" stroke-width="8" />
        <line x1={0} y1="0" x2={0} y2={size().height} stroke="#C7C7C7" stroke-width="1" />
      </g>
    </svg>
  );
}

function TimelineRuler(props: { step: number; height?: number }) {
  const id = 'pattern-timeline-ruler';
  // 1px is 1/60 of a second, so 60px is 1 second
  const lines = createMemo(() => {
    const lines = Array.from({ length: 2 });
    const d = `M0 16 m0 -6 v6 ` + ' ' + lines.map(() => `m${props.step / 2} -6 v6`).join(' ');
    return d;
  });

  return (
    <>
      <defs>
        <pattern id={id} height={props.height} width={props.step} x="0" patternUnits="userSpaceOnUse" y="0">
          <path d={lines()} stroke="#C7C7C7" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} x="0" y="0" />
      <text
        x="10"
        y="8"
        class="fill-#b2aca2 text-9px font-[helvetica]"
        text-anchor="middle"
        text-rendering="optimizeSpeed"
      >
        <For each={Array.from({ length: 60 })}>
          {(item, index) => (
            <tspan x={(index() + 1) * props.step} y="0" dy="8">
              {index() + 1}
            </tspan>
          )}
        </For>
      </text>
    </>
  );
}
