import { DEFAULT_ALTITUDE_ANGLE, HammerInput, createPointerEventsHandler } from '@packages/hammer/pointerevent';
import { clamp, radToDeg } from '@packages/pixijs-research/math/MathUtils';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { Title } from '@solidjs/meta';
import { ComponentProps, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { degToRad } from 'three/src/math/MathUtils';

export default function Multitouch() {
  const canvas = (<canvas class="touch-none"></canvas>) as HTMLCanvasElement;

  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const ctx = canvas.getContext('2d')!;

  const resize = createWindowSize();

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

  createEffect(() => {
    canvas.width = resize.width;
    canvas.height = resize.height;
  });

  const [events, setEvents] = createSignal<PointerEvent[]>([]);
  const [predictedEvents, setPredictedEvents] = createSignal<PointerEvent[]>([]);
  const [coalescedEvents, setCoalescedEvents] = createSignal<PointerEvent[]>([]);

  const pointerEventsHandler = createPointerEventsHandler();

  function pointerdownHandler(event: PointerEvent) {
    event.preventDefault();
    setEvents(() => [event]);
    setPredictedEvents(() => [...event.getPredictedEvents()]);
    setCoalescedEvents(() => [...event.getCoalescedEvents()]);
    setInputS(pointerEventsHandler(event));
  }
  function pointermoveHandler(event: PointerEvent) {
    event.preventDefault();
    setEvents((events) => {
      events.push(event);
      return events;
    });
    setPredictedEvents((events) => {
      events.push(...event.getPredictedEvents());
      return events;
    });
    setCoalescedEvents((events) => {
      events.push(...event.getCoalescedEvents());
      return events;
    });
    // console.log(event.getPredictedEvents());
    const input = pointerEventsHandler(event);
    setInputS(input);

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = 'black';
    for (const point of input.pointers) {
      ctx.beginPath();
      ctx.ellipse(point[0], point[1], 30, 30, 0, 0, Math.PI * 2, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(point[0], point[1]);
      ctx.lineTo(input.center[0], input.center[1]);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(input.start[0], input.start[1]);
    ctx.lineTo(input.center[0], input.center[1]);
    ctx.stroke();

    ctx.strokeStyle = 'blue';
    for (event of untrack(events)) {
      ctx.beginPath();
      ctx.ellipse(event.clientX, event.clientY, 3, 3, 0, 0, Math.PI * 2, false);
      ctx.stroke();
    }

    ctx.strokeStyle = 'red';
    for (event of untrack(coalescedEvents)) {
      ctx.beginPath();
      ctx.ellipse(event.clientX, event.clientY, 2, 2, 0, 0, Math.PI * 2, false);
      ctx.stroke();
    }

    // ctx.strokeStyle = 'green';
    // for (event of untrack(predictedEvents)) {
    //   ctx.beginPath();
    //   ctx.ellipse(event.clientX, event.clientY, 1, 1, 0, 0, Math.PI * 2, false);
    //   ctx.stroke();
    // }
  }
  function pointerupHandler(event: PointerEvent) {
    event.preventDefault();
    setInputS(pointerEventsHandler(event));
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  window.addEventListener('pointerdown', pointerdownHandler);
  window.addEventListener('pointermove', pointermoveHandler);
  window.addEventListener('pointerup', pointerupHandler);
  window.addEventListener('pointerleave', pointerupHandler);
  window.addEventListener('pointercancel', pointerupHandler);

  onCleanup(() => {
    window.removeEventListener('pointerdown', pointerdownHandler);
    window.removeEventListener('pointermove', pointermoveHandler);
    window.removeEventListener('pointerup', pointerupHandler);
    window.removeEventListener('pointerleave', pointerupHandler);
    window.removeEventListener('pointercancel', pointerupHandler);
  });

  const stroke = createMemo(() => {
    const y = inputS()?.delta[0] ?? 0;
    const x = inputS()?.delta[1] ?? 0;

    return clamp((y + x) / 2, -30, 30);
  });

  return (
    <>
      <Title>Multitouch</Title>
      <div class="fixed pointer-events-none">
        <pre>{JSON.stringify(inputS(), null, 2)}</pre>
      </div>
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        class="absolute top-2 end-2 h-120  w-120 pointer-events-none"
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
              x2={(inputS()?.tilt[0] ?? 0) / 9}
              y2={(inputS()?.tilt[1] ?? 0) / 9}
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
