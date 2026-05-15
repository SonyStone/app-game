import { DEFAULT_ALTITUDE_ANGLE, HammerInput, createPointerEventsHandler } from '@app-game/hammer/pointerevent';
import { clamp, radToDeg } from '@app-game/pixijs-research/math/MathUtils';
import { createEventListener } from '@solid-primitives/event-listener';
import { Title } from '@solidjs/meta';
import { ComponentProps, Show, createMemo, createSignal } from 'solid-js';
import { MathUtils } from 'three';
import { useOffscreenCanvas } from './offscreen-canvas';
import type { WorkerMessage } from './offscreen-canvas.worker';

const { degToRad } = MathUtils;

const toPlainPointerEvent = (event: PointerEvent): WorkerMessage => ({
  type: event.type as 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: event.clientX,
  clientY: event.clientY,
  pointerId: event.pointerId,
  pointerType: event.pointerType,
  pressure: event.pressure,
  tiltX: event.tiltX,
  tiltY: event.tiltY,
  twist: event.twist,
  timeStamp: event.timeStamp
});

export default function Multitouch() {
  const { canvas, worker } = useOffscreenCanvas();

  const [inputS, setInputS] = createSignal<HammerInput | undefined>(undefined);
  const altitudeAngle = createMemo(() => radToDeg(inputS()?.altitudeAngle ?? DEFAULT_ALTITUDE_ANGLE));
  const azimuthAngle = createMemo(() => radToDeg(inputS()?.azimuthAngle ?? 0));

  const angle = createMemo(() => {
    const _azimuthAngle = azimuthAngle();
    const side = 90 > _azimuthAngle || 270 < _azimuthAngle ? -1 : 1;

    return (altitudeAngle() - 90) * side;
  });

  const pressure = createMemo(() => {
    const input = inputS();
    const pressure = input?.pressure ?? 0;

    return pressure;
  });

  const pointerEventsHandler = createPointerEventsHandler();

  createEventListener(window, 'pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    worker.postMessage(toPlainPointerEvent(event));
    setInputS(pointerEventsHandler(event));
  });

  createEventListener(window, 'pointermove', (event: PointerEvent) => {
    // ! Very important to use event.getCoalescedEvents() to get all the events between the frames
    event.preventDefault();
    if (event.getCoalescedEvents) {
      for (const e of event.getCoalescedEvents()) {
        worker.postMessage(toPlainPointerEvent(e));
      }
    } else {
      worker.postMessage(toPlainPointerEvent(event));
    }
    setInputS(pointerEventsHandler(event));
  });

  createEventListener(window, ['pointerup', 'pointerleave', 'pointercancel'], (event: PointerEvent) => {
    event.preventDefault();
    worker.postMessage(toPlainPointerEvent(event));
    setInputS(pointerEventsHandler(event));
  });

  createEventListener(window, 'contextmenu', (event) => event.preventDefault());

  const stroke = createMemo(() => {
    const y = inputS()?.delta.x ?? 0;
    const x = inputS()?.delta.y ?? 0;

    return clamp((y + x) / 2, -30, 30);
  });

  return (
    <>
      <Title>Multitouch</Title>
      <div class="pointer-events-none fixed text-[8px] md:text-base">
        <pre>{JSON.stringify(inputS(), null, 2)}</pre>
      </div>
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        class="md:h-120 md:w-120 pointer-events-none absolute end-2 top-2 h-60 w-60"
      >
        <g transform="scale(0.9)" transform-origin="50 50">
          <line x1="0" y1="100" x2="100" y2="100" stroke="black" stroke-width="1" />

          <g transform="translate(12 50)">
            <circle cx="0" cy="0" r="10" fill="none" stroke="black" stroke-width="1" />
            <text x="-10" y="-12.5" class="text-2">
              tild
            </text>
            <line
              stroke-linecap="round"
              x1="0"
              y1="0"
              x2={(inputS()?.tilt.x ?? 0) / 9}
              y2={(inputS()?.tilt.y ?? 0) / 9}
              stroke="black"
              stroke-width="1"
            />
          </g>

          <g transform="translate(12 80)">
            <circle cx="0" cy="0" r="10" fill="none" stroke="black" stroke-width="1" />
            <text x="-10" y="-12.5" class="text-2">
              angle
            </text>
            <line
              stroke-linecap="round"
              transform={`rotate(${azimuthAngle()})`}
              x1="0"
              y1="0"
              x2={(Math.floor(Math.cos(degToRad(altitudeAngle())) * 1000) / 1000) * 10}
              y2="0"
              stroke="black"
              stroke-width="1"
            />
          </g>

          <ConeCut azimuth={azimuthAngle()} altitude={altitudeAngle()} pressure={pressure()} />

          <ConeCut2 azimuth={azimuthAngle()} altitude={altitudeAngle()} pressure={pressure()} />

          <ConeCut3 azimuth={azimuthAngle()} altitude={altitudeAngle()} pressure={pressure()} />

          <StylusPen transform={`translate(${stroke() + 50} ${pressure() * 8 - 22}) rotate(${angle()})`} />
        </g>
      </svg>
      {canvas}
    </>
  );
}

/**
 *
 * radius of circle is radius from focus point to ry of the ellips
 *
 * [link](https://byjus.com/maths/ellipse/)
 *
 */
function ConeCut(props: { azimuth: number; altitude: number; pressure: number }) {
  const rotate = createMemo(() => props.azimuth);
  const moved = createMemo(() => (Math.floor(Math.cos(degToRad(props.altitude)) * 1000) / 1000) * 10);

  const r = createMemo(() => props.pressure * 8);

  const c = createMemo(() => moved() / 2);
  const a = createMemo(() => r() + c());
  const b = createMemo(() => Math.sqrt(a() * a() - c() * c()) ?? 0);

  return (
    <>
      <g transform={`translate(88 80) rotate(${rotate()})`}>
        <Show when={true}>
          <ellipse cx="0" cy="0" rx="0.1" ry="0.1" fill="none" stroke="black" stroke-width="0.5" />
          <ellipse cx={moved()} cy={0} rx="0.1" ry="0.1" fill="none" stroke="black" stroke-width="0.5" />
          <line stroke-linecap="round" x1="0" y1="0" x2={moved()} y2={0} stroke="black" stroke-width="0.5"></line>

          <circle cx="0" cy="0" r={r()} fill="none" stroke="black" stroke-width="0.5" />
          <circle cx={moved()} cy="0" r={r()} fill="none" stroke="black" stroke-width="0.5" />
        </Show>

        <ellipse cx={c()} cy="0" rx={a()} ry={b()} fill="none" stroke="black" stroke-width="1" />
      </g>
    </>
  );
}

function ConeCut2(props: { azimuth: number; altitude: number; pressure: number }) {
  const rotate = createMemo(() => props.azimuth);
  const moved = createMemo(() => (Math.floor(Math.cos(degToRad(props.altitude)) * 1000) / 1000) * 10);

  const r = createMemo(() => props.pressure * 8);

  const c = createMemo(() => moved() / 2);
  const a = createMemo(() => r() + c());

  return (
    <>
      <g
        transform={`translate(88 40) rotate(${rotate()}) translate(${
          -props.pressure * 8 * Math.cos(degToRad(props.altitude))
        } 0)`}
      >
        <Show when={true}>
          <line stroke-linecap="round" x1="0" y1="0" x2={moved()} y2={0} stroke="black" stroke-width="0.5"></line>
          <line
            stroke-linecap="round"
            x1={moved()}
            y1={-r()}
            x2={moved()}
            y2={r()}
            stroke="black"
            stroke-width="0.5"
          ></line>
        </Show>

        <line stroke-linecap="round" x1={0} y1={0} x2={moved()} y2={r()} stroke="black" stroke-width="1"></line>
        <line stroke-linecap="round" x1={0} y1={0} x2={moved()} y2={-r()} stroke="black" stroke-width="1"></line>
        <ellipse
          cx={moved()}
          cy="0"
          rx={r() * Math.sin(degToRad(props.altitude))}
          ry={r()}
          fill="none"
          stroke="black"
          stroke-width="1"
        />
      </g>
    </>
  );
}

/**
 * b - y or hight/2 of from center to y
 * a - x or width/2 or from center to x
 * c - center to one of focus points
 * r - radius from focus point of from focus point to x or (a - c)
 *
 * radius of circle is radius y of the ellips
 */
function ConeCut3(props: { azimuth: number; altitude: number; pressure: number }) {
  const rotate = createMemo(() => props.azimuth);
  const moved = createMemo(() => (Math.floor(Math.cos(degToRad(props.altitude)) * 1000) / 1000) * 10);

  const b = createMemo(() => props.pressure * 8);
  const c = createMemo(() => moved() / 2);

  const a = createMemo(() => Math.sqrt(b() * b() + c() * c()) ?? 0);
  const r = createMemo(() => a() - c());

  return (
    <>
      <g transform={`translate(88 60) rotate(${rotate()})`}>
        <Show when={true}>
          <ellipse cx="0" cy="0" rx="0.1" ry="0.1" fill="none" stroke="black" stroke-width="0.5" />
          <ellipse cx={moved()} cy={0} rx="0.1" ry="0.1" fill="none" stroke="black" stroke-width="0.5" />
          <line stroke-linecap="round" x1="0" y1="0" x2={moved()} y2={0} stroke="black" stroke-width="0.5"></line>

          <circle cx="0" cy="0" r={r()} fill="none" stroke="black" stroke-width="0.5" />
          <circle cx={moved()} cy="0" r={r()} fill="none" stroke="black" stroke-width="0.5" />
        </Show>

        <ellipse cx={c()} cy="0" rx={a()} ry={b()} fill="none" stroke="black" stroke-width="1" />
      </g>
    </>
  );
}

function StylusPen(props: ComponentProps<'g'>) {
  return (
    <g transform-origin="0 119.5" {...props}>
      <path
        d="M 0.95,118 6.6,106 A 1.5,1.5 80 0 0 6.3,104.3 l -1.6,-1.7 h -9.4 l -1.6,1.7 a 1.5,1.5 100 0 0 -0.3,1.6 l 5.6,12.1 z"
        fill="white"
        stroke="black"
        stroke-width="1"
      />
      <path d="M 0,120 V 118" fill="none" stroke="black" stroke-width="1" />
      <path
        d="m -4.7,49.2 h 9.4 l 0.789,52.6 a 0.7415,0.7415 134.6 0 1 -0.742,0.8 l -9.494,0 a 0.75,0.75 45.43 0 1 -0.75,-0.8 z"
        fill="gray"
        stroke="black"
        stroke-width="1"
      />
      <path d="m -3.5,7 h 7 L 4,49.2 h -8 z" fill="white" stroke="black" stroke-width="1" />
      <path
        d="M -2.8,7 -2.9,3.3 c 0,-1.6 1.3,-2.9 2.9,-2.9 1.6,0 2.9,1.3 2.9,2.9 L 2.8,7"
        fill="white"
        stroke="black"
        stroke-width="1"
      />
      <rect width="3" height="9" x="-1.5" y="85" ry="0.7" fill="white" stroke="black" stroke-width="1" />
      <rect width="3" height="9" x="-1.5" y="75" ry="0.7" fill="white" stroke="black" stroke-width="1" />
    </g>
  );
}
