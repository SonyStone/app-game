import { fadeOut } from '@packages/debug-layer/fade-out';
import { createStruct } from '@app-game/math/utils/create-struct';
import { Vec2 } from '@app-game/math/v2';
import { createEventListener } from '@solid-primitives/event-listener';
import { access } from '@solid-primitives/utils';
import { createManagedRoot } from '@utils/createManagedRoot';
import { Accessor, children, createEffect, createMemo, createSignal, getOwner, JSX, onCleanup, Owner } from 'solid-js';
import { SVGAngleVisualization } from '../m2x3/svg-angle-visualization';

export function TransientComponentDemo() {
  const owner = getOwner();

  const contentContainer = (<div />) as HTMLElement;

  const svgOverlay = (
    <svg class="pointer-events-none fixed right-0 top-0 z-10 h-screen w-screen touch-none" />
  ) as SVGSVGElement;

  const componentFactories = {
    contentCard: createTransientComponent((props, dispose) => {
      contentContainer.appendChild(
        access(
          (
            <FadeOut {...props()} onFinish={dispose}>
              <DemoContentCard
                {...props}
                onRemove={() => {
                  dispose();
                }}
              />
            </FadeOut>
          ) as HTMLElement
        )
      );
    }, owner),
    notification: createTransientComponent((props, dispose) => {
      contentContainer.appendChild(
        access(
          (
            <FadeOut {...props()} onFinish={dispose}>
              <div class="flex gap-2">
                LoL: {props().text}
                <button
                  class="border px-2"
                  onClick={() => {
                    dispose();
                  }}
                >
                  remove
                </button>
              </div>
            </FadeOut>
          ) as HTMLElement
        )
      );
    }, owner),
    cursorIndicator: createTransientComponent((props, dispose) => {
      svgOverlay.appendChild(
        access(
          (
            <FadeOut {...props()} onFinish={dispose}>
              <g
                class="pointer-events-none select-none transition-transform duration-100 ease-in-out"
                style={{ transform: `translate(${props().x}px, ${props().y}px)` }}
              >
                <g class="animate-spin">
                  <circle cx={0} cy={0} r={20} stroke={'red'} fill="none" stroke-width={1} />
                  <line x1={-20} y1={-20} x2={20} y2={20} stroke="red" stroke-width="1" />
                </g>
              </g>
            </FadeOut>
          ) as HTMLElement
        )
      );
    }, owner),
    angleIndicator: createTransientComponent<PointerEvent>((props, dispose) => {
      const [struct] = createStruct({
        firstPoint: [Vec2, Int32Array],
        cornerPoint: [Vec2, Int32Array],
        secondPoint: [Vec2, Int32Array]
      });
      const firstPoint = createMemo(
        () => {
          const { clientX, clientY, type } = props();
          if (type === 'pointerdown') {
            struct.firstPoint.set(clientX, clientY);
            struct.secondPoint.set(clientX, clientY);
          }
          return struct.firstPoint;
        },
        struct.firstPoint,
        { equals: false }
      );

      const secondPoint = createMemo(
        () => {
          const { clientX, clientY, type } = props();
          if (type === 'pointermove') {
            struct.secondPoint.set(clientX, clientY);
          }
          return struct.secondPoint;
        },
        struct.secondPoint,
        { equals: false }
      );

      struct.cornerPoint.set(window.innerWidth / 2, window.innerHeight / 2);

      svgOverlay.appendChild(
        access(
          (
            <FadeOut {...props()} onFinish={dispose}>
              <SVGAngleVisualization
                firstPoint={firstPoint()}
                cornerPoint={struct.cornerPoint}
                secondPoint={secondPoint()}
              />
            </FadeOut>
          ) as HTMLElement
        )
      );
    }, owner)
  };

  let isDown = false;
  createEventListener(window, ['pointerdown', 'pointermove', 'pointerup'], (event: PointerEvent) => {
    switch (event.type) {
      case 'pointerdown': {
        isDown = true;
        componentFactories.angleIndicator(event);
        componentFactories.cursorIndicator({ x: event.clientX, y: event.clientY });
        break;
      }
      case 'pointermove': {
        if (isDown) {
          componentFactories.angleIndicator(event);
        }
        break;
      }
      case 'pointerup': {
        isDown = false;
        componentFactories.angleIndicator(event);
        componentFactories.cursorIndicator({ x: event.clientX, y: event.clientY });
        break;
      }
    }
  });

  return (
    <>
      {svgOverlay}
      <div class="flex w-fit select-none flex-col gap-2 rounded border p-2">
        <p>Transient Component Demo</p>
        <button
          class="border px-2"
          onClick={(event: MouseEvent) => {
            componentFactories.contentCard({ text: event.timeStamp, name: 'element-1' });
          }}
        >
          add element 1
        </button>
        <button
          class=" border px-2"
          onClick={(event: MouseEvent) => {
            componentFactories.notification({ text: event.timeStamp, name: 'element-2' });
          }}
        >
          add element 2
        </button>
        {contentContainer}
      </div>
    </>
  );
}

function createTransientComponent<T extends Record<string, any>>(
  create: (props: Accessor<T>, dispose: VoidFunction) => void,
  detachedOwner?: typeof Owner
) {
  const [getProps, setProps] = createSignal<T | undefined>();
  const attach = createManagedRoot((dispose) => {
    create(getProps as Accessor<T>, dispose);
  }, detachedOwner);

  return (props: T) => {
    setProps(props);
    attach();
  };
}

function FadeOut(props: { children: JSX.Element; onFinish?: VoidFunction }) {
  let animation: Animation | undefined;
  let element: Element | undefined;

  const resolved = children(() => props.children);

  createEffect(() => {
    element = resolved() as Element;
    animation = fadeOut(element);
    animation.finished
      .catch(() => {
        props.onFinish?.();
      })
      .then(() => {
        props.onFinish?.();
      });
  });

  createEffect(() => {
    if (!animation) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ in props) {
      // ...
    }

    animation.currentTime = 0;
  });

  onCleanup(() => {
    element?.remove();
  });

  return resolved();
}

function DemoContentCard(props: { text: string | number; name: string; onRemove?: VoidFunction }) {
  return (
    <div class="flex gap-2">
      child {props.name} | {props.text}
      <button
        class="border px-2"
        onClick={() => {
          props.onRemove?.();
        }}
      >
        remove
      </button>
    </div>
  );
}
