import { distance, normalize } from '@packages/ogl/math/functions/vec-2-func';
import { createEventBus } from '@solid-primitives/event-bus';
import { WindowEventListener } from '@solid-primitives/event-listener';
import { createKeyHold } from '@solid-primitives/keyboard';
import { ComponentProps, createEffect, createMemo, createSignal, For, mergeProps, Show, untrack } from 'solid-js';

export default function PaintUIExample() {
  const [isOpen, setIsOpen] = (() => {
    const [isOpen, setIsOpen] = createSignal(false);
    const pressing = createKeyHold(' ', { preventDefault: false });
    createEffect(() => {
      if (pressing()) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    });
    return [isOpen, setIsOpen];
  })();

  const [position, setPosition, position2] = (() => {
    const [position, setPosition] = createSignal({ x: 0, y: 0 });

    const pos = createMemo<{ x: number; y: number }>((prev = { x: 0, y: 0 }) => {
      if (untrack(position) && isOpen()) {
        return untrack(position);
      }
      return prev;
    });

    return [pos, setPosition, position];
  })();

  let popup: HTMLElement = null;

  const [zoom, setZoom] = createSignal(1);
  const [rotation, setRotation] = createSignal(0);
  const [positionDelta, setPositionDelta] = createSignal({ x: 0, y: 0 });

  return (
    <>
      <WindowEventListener
        onPointermove={(e) => {
          setPosition({ x: e.clientX, y: e.clientY });
        }}
        onContextmenu={(e) => {
          e.preventDefault();
        }}
        onmousedown={(e) => {
          // right click
          if (e.button === 2) {
            if (isOpen()) {
              setIsOpen(false);
            } else {
              setIsOpen(true);
            }
          }
          //  left click
          if (e.button === 0) {
            if (!popup.contains(e.target as HTMLElement)) {
              setIsOpen(false);
            }
          }
        }}
      />
      <div class="transform-origin-center transform-scale-100 flex h-full w-full touch-none place-content-center place-items-center overflow-hidden">
        <div
          style={{
            transform:
              `matrix(1, 0, 0, 1, 0, 0)` +
              `translate(${positionDelta().x}px, ${positionDelta().y}px)` +
              `scale(${(zoom(), zoom())})` +
              `rotate(${rotation()}deg)`
          }}
        >
          <pre>
            position {position2().x.toFixed(2)} {position2().y.toFixed(2)}
            {}
            \n
            {}
            zoom {zoom().toFixed(2)}
            {}
            \n
            {}
            rotation {rotation().toFixed(2)}
            {}
          </pre>
        </div>

        {/* with svg */}
        <div
          ref={(ref) => {
            popup = ref;
          }}
          class={[
            isOpen() ? 'active opacity-100' : 'opacity-0',
            'pointer-events-none fixed left-0 top-0 transition-opacity'
          ].join(' ')}
          style={{ transform: `translate(${position().x - 60}px, ${position().y - 60}px)` }}
        >
          <NavigationPopupWithSVG
            zoomDelta={(val) => setZoom(val)}
            rotationDelta={(val) => setRotation(val)}
            positionDelta={(val) => setPositionDelta(val)}
            navigationIsActive={(val) => setIsOpen(!val)}
          />
        </div>
      </div>
    </>
  );
}

const NavigationPopupWithSVG = (props: {
  x?: number;
  y?: number;
  radius?: number;
  thickness?: number;
  horizontalMove?: number;
  gap?: number;
  stroke?: boolean;
  zoomDelta?: (value: number) => void;
  rotationDelta?: (value: number) => void;
  positionDelta?: (value: { x: number; y: number }) => void;
  navigationIsActive?: (value: boolean) => void;
}) => {
  const merged = mergeProps(
    { x: 60, y: 60, radius: 24, thickness: 18, gap: 2, horizontalMove: 8, stroke: false },
    props
  );

  return (
    <div class="relative flex select-none drop-shadow-lg">
      <svg class="w-30 h-30 stroke-width-1 z-1 scale-90 stroke-black transition-transform [.active_&]:scale-100">
        (
        {() => {
          // zoom navigation element
          const zoom = createZoom();
          zoom.active.listen((value) => props.navigationIsActive?.(value));

          createEffect(() => {
            props.zoomDelta?.(zoom.zoom());
          });

          return (
            <Cap
              x={merged.x}
              y={merged.y}
              radius={merged.radius}
              horizontalMove={merged.horizontalMove}
              up={true}
              class=" pointer-events-auto fill-blue-400 transition-colors [&.active]:cursor-zoom-in [&.active]:fill-blue-200 [&.hover]:fill-blue-300"
              onPointerOver={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.classList.add('hover');
              }}
              onPointerLeave={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.classList.remove('hover');
              }}
              onPointerDown={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.setPointerCapture(e.pointerId);
                element.classList.add('active');
                zoom.start({ x: e.clientX, y: e.clientY });
              }}
              onPointerUp={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.releasePointerCapture(e.pointerId);
                element.classList.remove('active');
                zoom.end();
              }}
              onPointerMove={(e: PointerEvent) => {
                zoom.move({ x: e.clientX, y: e.clientY });
              }}
            />
          );
        }}
        )() (
        {() => {
          // rotate navigation element
          const rotate = createRotate();
          rotate.active.listen((value) => props.navigationIsActive?.(value));

          createEffect(() => {
            props.rotationDelta?.(rotate.angle());
          });

          return (
            <Cap
              x={merged.x}
              y={merged.y}
              radius={merged.radius}
              horizontalMove={merged.horizontalMove + merged.gap}
              class="pointer-events-auto fill-blue-400 transition-colors [&.active]:cursor-e-resize [&.active]:fill-blue-200 [&.hover]:fill-blue-300"
              onPointerOver={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.classList.add('hover');
              }}
              onPointerLeave={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.classList.remove('hover');
              }}
              onPointerDown={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.setPointerCapture(e.pointerId);
                element.classList.add('active');
                rotate.start({ x: e.clientX, y: e.clientY });
              }}
              onPointerUp={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.releasePointerCapture(e.pointerId);
                element.classList.remove('active');
                rotate.end();
              }}
              onPointerMove={(e: PointerEvent) => {
                rotate.move({ x: e.clientX, y: e.clientY });
              }}
            />
          );
        }}
        )() (
        {() => {
          const translate = createTranslate();
          translate.active.listen((value) => props.navigationIsActive?.(value));

          createEffect(() => {
            props.positionDelta?.(translate.position());
          });

          return (
            <Donut
              x={merged.x}
              y={merged.y}
              inner_radius={merged.radius + merged.gap}
              outer_radius={merged.radius + merged.thickness}
              class="pointer-events-auto fill-red-400 transition-colors [&.active]:cursor-move [&.active]:fill-red-200 [&.hover]:fill-red-300"
              onPointerOver={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.classList.add('hover');
              }}
              onPointerLeave={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.classList.remove('hover');
              }}
              onPointerDown={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.setPointerCapture(e.pointerId);
                element.classList.add('active');
                translate.start({ x: e.clientX, y: e.clientY });
              }}
              onPointerUp={(e: PointerEvent) => {
                const element = e.target as SVGElement;
                element.releasePointerCapture(e.pointerId);
                element.classList.remove('active');
                translate.end();
              }}
              onPointerMove={(e: PointerEvent) => {
                translate.move({ x: e.clientX, y: e.clientY });
              }}
            />
          );
        }}
        )()
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

      <div class="pointer-events-auto absolute right-full flex w-40 translate-x-10 flex-col rounded border border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-x-0">
        Tools
        <div class="flex flex-wrap gap-1">
          <For each={['Pen', 'Brush', 'Color picker']}>
            {(tool) => <button class="h-8 w-8 truncate border border-black">{tool}</button>}
          </For>
        </div>
      </div>

      <div class="w-30 h-30 pointer-events-auto absolute bottom-full flex translate-y-10 flex-col gap-1 rounded border border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-y-0">
        Color wheel
        <div class="flex min-h-0 place-content-center place-items-center overflow-hidden">
          {(() => {
            const spread = 15;
            return (
              <svg viewBox="0 0 100 100" height="100%">
                <defs>
                  <filter id="blur" color-interpolation-filters="linear" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={spread} />
                  </filter>
                  <mask id="circle">
                    <circle cx="50" cy="50" r="50" fill="white" />
                  </mask>
                </defs>
                {/* <g mask="url(#circle)" filter="url(#blur)">
              <rect x="-10" width="110" height="110" fill="blue" />
              <rect x="50" width="60" height="110" fill="yellow" />
              <polygon points="50,50, 60,110, 40,110" fill="#0f8" />
              <polygon points="0,0, 100,0, 100,20, 50,50, 0,20" fill="red" />
              <polygon points="0,10, 50,50, 0,30" fill="#f0f" />
              <polygon points="100,10, 100,30, 50,50" fill="#f80" />
              </g> */}
                <g filter="url(#blur)">
                  <rect x={0 - spread} y={0 - spread} width={100 + spread} height={100 + spread} fill="white" />
                  <rect x={50 - spread} y={0 - spread} width={50 + spread * 2} height={100 + spread * 2} fill="#0f0" />
                  <rect
                    x={0 - spread}
                    y={50 + 10 - spread}
                    width={100 + spread * 2}
                    height={50 + spread * 2}
                    fill="black"
                  />
                  {/* <polygon points="50,50, 60,110, 40,110" fill="#0f8" /> */}
                  {/* <polygon points="0,0, 100,0, 100,20, 50,50, 0,20" fill="red" /> */}
                  {/* <polygon points="0,10, 50,50, 0,30" fill="#f0f" /> */}
                  {/* <polygon points="100,10, 100,30, 50,50" fill="#f80" /> */}
                </g>
              </svg>
            );
          })()}
        </div>
      </div>

      <div class="pointer-events-auto absolute -top-full left-full flex w-40 -translate-x-10 flex-col rounded border  border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-x-0">
        Layers
        <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}>
          {(layer) => (
            <div class="flex border-t border-black text-xs last:border-b">
              <button class="bg-blue-3 h-8 w-8 flex-shrink-0"></button>
              <button class="bg-blue-2 h-8 w-8 flex-shrink-0"></button>
              <button class="flex w-full select-none flex-col truncate">
                <span>Type</span>
                <span>Layer {layer}</span>
              </button>
            </div>
          )}
        </For>
      </div>

      <div class="w-30 pointer-events-auto absolute top-full flex -translate-y-10 flex-col rounded border  border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-y-0">
        Tools settings
        <input type="range"></input>
        <input type="range"></input>
      </div>
    </div>
  );
};

const Donut = (
  props: { x: number; y: number; inner_radius: number; outer_radius: number } & ComponentProps<'path'>
) => {
  const x1 = createMemo(() => props.x - props.outer_radius);
  const x2 = createMemo(() => props.x + props.outer_radius);
  const x3 = createMemo(() => props.x - props.inner_radius);
  const x4 = createMemo(() => props.x + props.inner_radius);

  return (
    <path
      {...props}
      d={`M ${x1()},${props.y}
          A 5 5 10 0 1 ${x2()},${props.y}
          A 5 5 10 0 1 ${x1()},${props.y}
          M ${x3()},${props.y}
          A 5 5 10 0 0 ${x4()},${props.y}
          A 5 5 10 0 0 ${x3()},${props.y}
          z`}
    />
  );
};

const Cap = (
  props: {
    x: number;
    y: number;
    radius: number;
    horizontalMove: number;
    up?: boolean;
  } & ComponentProps<'path'> &
    ComponentProps<'circle'>
) => {
  const adjacent = createMemo(
    () => props.radius - Math.sqrt(props.radius * props.radius - props.horizontalMove * props.horizontalMove)
  );
  const x1 = createMemo(() => toFixed(props.x - props.radius + adjacent()));
  const y1 = createMemo(() => toFixed(props.y + props.horizontalMove));
  const x2 = createMemo(() => toFixed(props.x + props.radius - adjacent()));
  const y2 = createMemo(() => toFixed(props.y + props.horizontalMove));

  return (
    <>
      <Show when={props.horizontalMove < props.radius && props.horizontalMove > -props.radius}>
        <path
          {...props}
          d={`M ${x1()},${y1()}
            A ${props.radius} ${props.radius} 0 ${props.up ? 1 : 0} ${props.up ? 1 : 0} ${x2()},${y2()}
            z`}
        />
      </Show>
      <Show when={props.horizontalMove > props.radius}>
        <circle {...props} cx={props.x} cy={props.y} r={props.radius} />
      </Show>
    </>
  );
};

/** to short svg values */
const toFixed = (val: number) => parseFloat(val.toFixed(2));

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
    start({ x = 0, y = 0 }) {
      isDown = true;
      active.emit(true);
      start.y = y;
      start.x = x;
    },
    end() {
      isDown = false;
      start.y = 0;
      start.x = 0;
      tempAngle = untrack(angle);
      active.emit(false);
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
    start({ x = 0, y = 0 }) {
      isDown = true;
      active.emit(true);
      start.y = y;
      start.x = x;
    },
    end() {
      isDown = false;
      start.y = 0;
      start.x = 0;
      temp = untrack(zoom);
      active.emit(false);
    }
  };
};

const createTranslate = () => {
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const active = createEventBus<boolean>();

  const start = { x: 0, y: 0 };
  const temp = { x: 0, y: 0 };
  let isDown = false;

  return {
    position,
    active,
    move({ x = 0, y = 0 }) {
      if (isDown) {
        setPosition({ x: temp.x + x - start.x, y: temp.y + y - start.y });
      }
    },
    start({ x = 0, y = 0 }) {
      isDown = true;
      active.emit(true);
      start.y = y;
      start.x = x;
    },
    end() {
      isDown = false;
      temp.x = untrack(position).x;
      temp.y = untrack(position).y;
      start.y = 0;
      start.x = 0;
      active.emit(false);
    }
  };
};
