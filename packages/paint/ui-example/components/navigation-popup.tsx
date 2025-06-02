import { Vec2 } from '@packages/math';
import { Mat3 } from '@packages/ogl';
import { distance, normalize } from '@packages/ogl/math/functions/vec-2-func';
import { takeUntilCleanup } from '@packages/utils/take-until-cleanup';
import { createEventBus } from '@solid-primitives/event-bus';
import { concat, fromEvent, merge, of, ReplaySubject, switchMap, take, takeUntil, tap } from 'rxjs';
import { createEffect, createSignal, For, mergeProps, onCleanup, Show, untrack } from 'solid-js';
import { Cap } from './cap';
import { Donut } from './donut';

const createPointerEvent = (element: Element) => {
  const down$ = fromEvent<PointerEvent>(element, 'pointerdown').pipe(
    tap((event) => {
      element.setPointerCapture(event.pointerId);
    })
  );

  const replay$ = new ReplaySubject<PointerEvent>(1);

  const up$ = merge(
    fromEvent<PointerEvent>(element, 'pointerup'),
    fromEvent<PointerEvent>(element, 'pointercancel'),
    fromEvent<PointerEvent>(element, 'pointerout')
  ).pipe(
    tap((event) => {
      element.releasePointerCapture(event.pointerId);
      replay$.next(event);
    }),
    take(1)
  );

  const move$ = fromEvent<PointerEvent>(element, 'pointermove').pipe(takeUntil(up$));

  onCleanup(() => {
    replay$.unsubscribe();
  });

  return down$.pipe(
    switchMap((start) => concat(of(start), move$, replay$)),
    takeUntilCleanup()
  );
};


/**
 * ```
 *  zoom
 *  rotate
 *  pan
 * ```
 * @param props
 * @returns
 */
export const NavigationPopup = (props: {
  x?: number;
  y?: number;
  radius?: number;
  thickness?: number;
  horizontalMove?: number;
  gap?: number;
  stroke?: boolean;
  isActive?: boolean;
  zoomDelta?: (value: number) => void;
  rotationDelta?: (value: number) => void;
  positionDelta?: (value: { x: number; y: number }) => void;
  navigationIsActive?: (value: boolean) => void;
}) => {
  const merged = mergeProps(
    { x: 60, y: 60, radius: 24, thickness: 18, gap: 0, horizontalMove: 8, stroke: false },
    props
  );

  return (
    <svg class="w-30 h-30 stroke-width-1 z-1 scale-90 stroke-black transition-transform [.active_&]:scale-100">
      {(() => {
        // zoom navigation element
        const nav = createZoom();
        nav.active.listen((value) => props.navigationIsActive?.(value));

        createEffect(() => {
          props.zoomDelta?.(nav.zoom());
        });

        return (
          <Cap
            ref={(element) => {
              createPointerEvent(element).subscribe({
                next: (n) => {
                  console.log(`log-next`, n);
                },
                error: (e) => {
                  console.log(`log-error`, e);
                },
                complete: () => {
                  console.log(`log-complete`);
                }
              });
            }}
            x={merged.x}
            y={merged.y}
            radius={merged.radius}
            horizontalMove={merged.horizontalMove}
            up={true}
            isActive={props.isActive}
            class="fill-blue-400 transition-colors [&.active]:cursor-zoom-in [&.active]:fill-blue-200 [&.hover]:fill-blue-300"
            onPointerLeave={() => {
              nav.end();
            }}
            onPointerDown={(e: PointerEvent) => {
              nav.start({ x: e.clientX, y: e.clientY });
            }}
            onPointerUp={() => {
              nav.end();
            }}
            onPointerMove={(e: PointerEvent) => {
              nav.move({ x: e.clientX, y: e.clientY });
            }}
            onPointerCancel={() => {
              nav.end();
            }}
          />
        );
      })()}

      {(() => {
        // rotate navigation element
        const nav = createRotate();
        nav.active.listen((value) => props.navigationIsActive?.(value));

        createEffect(() => {
          props.rotationDelta?.(nav.angle());
        });

        return (
          <Cap
            x={merged.x}
            y={merged.y}
            radius={merged.radius}
            horizontalMove={merged.horizontalMove + merged.gap}
            class=" fill-blue-400 transition-colors [&.active]:cursor-e-resize [&.active]:fill-blue-200 [&.hover]:fill-blue-300"
            isActive={props.isActive}
            onPointerOver={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.classList.add('hover');
            }}
            onPointerLeave={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.classList.remove('hover');
              element.classList.remove('active');
              nav.end();
            }}
            onPointerDown={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.setPointerCapture(e.pointerId);
              element.classList.add('active');
              nav.start({ x: e.clientX, y: e.clientY });
            }}
            onPointerUp={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.releasePointerCapture(e.pointerId);
              element.classList.remove('active');
              nav.end();
            }}
            onPointerMove={(e: PointerEvent) => {
              nav.move({ x: e.clientX, y: e.clientY });
            }}
            onPointerCancel={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.classList.remove('hover');
              nav.end();
            }}
          />
        );
      })()}

      {(() => {
        const nav = createTranslate();
        nav.active.listen((value) => props.navigationIsActive?.(value));

        createEffect(() => {
          props.positionDelta?.(nav.position());
        });

        return (
          <Donut
            x={merged.x}
            y={merged.y}
            inner_radius={merged.radius + merged.gap}
            outer_radius={merged.radius + merged.thickness}
            class="fill-red-400 transition-colors [&.active]:cursor-move [&.active]:fill-red-200 [&.hover]:fill-red-300"
            classList={{ 'pointer-events-auto': props.isActive, 'pointer-events-none': !props.isActive }}
            onPointerOver={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.classList.add('hover');
            }}
            onPointerLeave={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.classList.remove('hover');
              element.classList.remove('active');
              nav.end();
            }}
            onPointerDown={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.setPointerCapture(e.pointerId);
              element.classList.add('active');
              nav.start({ x: e.clientX, y: e.clientY });
            }}
            onPointerUp={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.releasePointerCapture(e.pointerId);
              element.classList.remove('active');
              nav.end();
            }}
            onPointerMove={(e: PointerEvent) => {
              nav.move({ x: e.clientX, y: e.clientY });
            }}
            onPointerCancel={(e: PointerEvent) => {
              const element = e.target as SVGElement;
              element.classList.remove('hover');
              nav.end();
            }}
          />
        );
      })()}

      <Show when={true}>
        <For
          each={[
            { x: merged.x - merged.radius - (merged.thickness + merged.gap) / 2, y: merged.y },
            { x: merged.x + merged.radius + (merged.thickness + merged.gap) / 2, y: merged.y },
            { x: merged.x, y: merged.y - merged.radius - (merged.thickness + merged.gap) / 2 },
            { x: merged.x, y: merged.y + merged.radius + (merged.thickness + merged.gap) / 2 }
          ]}
        >
          {(item) => (
            <circle
              cx={item.x}
              cy={item.y}
              r={(merged.thickness - merged.gap) / 4}
              class="pointer-events-none fill-blue-400"
            />
          )}
        </For>
        <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z" />
        <circle
          cx={merged.x}
          cy={merged.y + (merged.radius + merged.horizontalMove) / 2}
          r={(merged.thickness - merged.gap) / 4}
          class="pointer-events-none fill-red-400"
        />
        <circle
          cx={merged.x}
          cy={merged.y - (merged.radius - merged.horizontalMove) / 2}
          r={(merged.thickness - merged.gap) / 4}
          class="pointer-events-none fill-red-400"
        />
      </Show>
    </svg>
  );
};

const createNavigation = () => {
  // const [matrix, setMatrix] = createSignal(m3.identity([]));
  const transformMatrix = new Mat3();
  const rotateStart = { x: 0, y: 0 };
  const translateStart = new Vec2();

  let isActive = false;

  return {
    translate: {
      start(x = 0, y = 0) {
        isActive = true;
      },
      move(x = 0, y = 0) {
        if (isActive) {
          transformMatrix.translate([translateStart.x - x, translateStart.y - y]);
        }
      },
      end() {}
    },
    rotate: {
      start(x = 0, y = 0) {
        isActive = true;
      },
      move(x = 0, y = 0) {
        if (isActive) {
          // m3.setRotate(matrix(), 0.1);
          // rotate around point
        }
      },
      end() {
        if (isActive) {
          isActive = false;
        }
      }
    },
    zoom: {
      start(x = 0, y = 0) {
        isActive = true;
      },
      move(x = 0, y = 0) {
        if (isActive) {
          // zoom 2d camera
        }
      }
    }
  };
};

// TODO: make it a directive?
const createRotate = () => {
  const [angle, setAngle] = createSignal(0);
  const active = createEventBus<boolean>();

  const start = { x: 0, y: 0 };
  let isDown = false;
  let tempAngle = 0;

  const getScreenSize = () => {
    const height = document.body.clientHeight;
    const width = document.body.clientWidth;
    return { height, width };
  };

  const getScreenCenter = () => {
    const { height, width } = getScreenSize();
    return { x: width / 2, y: height / 2 };
  };

  return {
    angle,
    active,
    start({ x = 0, y = 0 }) {
      isDown = true;
      active.emit(true);
      start.y = y;
      start.x = x;
    },
    move({ x = 0, y = 0 }) {
      if (isDown) {
        // rotate around center
        const center = getScreenCenter();
        const angle1 = Math.atan2(start.y - center.y, start.x - center.x) * (180 / Math.PI);
        const angle2 = Math.atan2(y - center.y, x - center.x) * (180 / Math.PI);
        setAngle(tempAngle + angle2 - angle1);

        // rotate around start point
        // const angle3 = Math.atan2(start.y - y, start.x - x) * (180 / Math.PI);
        // setAngle(tempAngle + angle3);
      }
    },
    end() {
      if (isDown) {
        isDown = false;
        start.y = 0;
        start.x = 0;
        tempAngle = untrack(angle);
        active.emit(false);
      }
    },
    rotate: (value: number) => {
      setAngle((prev) => prev + value);
    }
  };
};

const createZoom = () => {
  const [zoom, setZoom] = createSignal(1);
  const active = createEventBus<boolean>();

  const start = { x: 0, y: 0 };
  let isDown = false;
  let temp = 0;

  return {
    zoom,
    active,
    start({ x = 0, y = 0 }) {
      isDown = true;
      active.emit(true);
      start.y = y;
      start.x = x;
    },
    move({ x = 0, y = 0 }) {
      if (isDown) {
        // should calculate zoom based on distance and left-right top-down direction from start
        const direction = normalize([0, 0], [start.x - x, start.y - y]);
        const angle = Math.atan2(direction[1], direction[0]);
        const move = distance([start.x, start.y], [x, y]) * -(Math.cos(angle) - Math.sin(angle));
        let newValue = temp + move / 100;
        if (newValue < 0.1) {
          newValue = 0.1;
        }
        if (newValue > 10) {
          newValue = 10;
        }
        setZoom(newValue);
      }
    },
    end() {
      if (isDown) {
        isDown = false;
        start.y = 0;
        start.x = 0;
        temp = untrack(zoom);
        active.emit(false);
      }
    }
  };
};

const createTranslate = () => {
  const transformMatrix = new Mat3();
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const active = createEventBus<boolean>();

  const start = { x: 0, y: 0 };
  const temp = { x: 0, y: 0 };
  let isDown = false;

  return {
    position,
    active,
    start({ x = 0, y = 0 }) {
      isDown = true;
      active.emit(true);
      start.y = y;
      start.x = x;
    },
    move({ x = 0, y = 0 }) {
      if (isDown) {
        setPosition({ x: temp.x + x - start.x, y: temp.y + y - start.y });
      }
    },
    end() {
      if (isDown) {
        isDown = false;
        temp.x = untrack(position).x;
        temp.y = untrack(position).y;
        start.y = 0;
        start.x = 0;
        active.emit(false);
      }
    }
  };
};
