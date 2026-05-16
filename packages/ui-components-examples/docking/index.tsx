/* eslint-disable @typescript-eslint/no-namespace */

import { cn } from '@app-game/utils/cn';
import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createDragSensor } from 'solid-dnd';
import { ComponentProps, createMemo, createSignal, For, onMount, Show, splitProps, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Portal } from 'solid-js/web';
import { SolidDockView } from '../solid-dockview';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'dockview-demo': ComponentProps<'div'>;
      sash: ComponentProps<'div'>;
      'sash-container': ComponentProps<'div'>;
      'panel-container': ComponentProps<'div'>;
    }
  }
}

/**
 * Should have:
 * - Sash - the draggable divider
 * - Panels - where the user content goes
 * - Tabs - multiple panels in one view
 * - grid-view
 *
 * View can be put on
 * - left or right (split horizontal)
 * - top or bottom (split vertical)
 * - center (new tab)
 * Should work the same way for floating windows.
 *
 * Example structure:
 * ```
 * ┌─────────┬─────┬───────┬────────┐
 * │ Panel 1 │     │       │        │
 * │         │     ├───┬───┤        │
 * │         │     │   │   │        │
 * │         ├─────┴───┴─┬─┴────────┤
 * │         │           │          │
 * │         │           │          │
 * └─────────┴───────────┴──────────┘
 * grid-view
 *  └─branch split-view-container horizontal
 *     ├─sash
 *     ├─view (panel 1)
 *     └─view
 *        └─branch split-view-container vertical
 * ```
 */

type SplitView = {
  direction?: 'row' | 'column';
  children?: PanelViewState[];
};

type View = {
  title?: string;
  size?: number;
  minSize?: number;
  maxSize?: number;
};

type PanelViewState = SplitView | View | View[];

/**
 * 1
 *
 * column[1,2]
 *
 *
 * column[1, row[2, 3]]
 *
 * column[1, row[2, column[3,5], 4]]
 *
 * column[1, row[2, column[3, row[5, 6]], 4]]
 */

// direction: 'column',
// children: [
//   {
//     direction: 'row',
//     children: [
//       {},
//       {
//         direction: 'column',
//         children: [
//           {},
//           {
//             direction: 'row',
//             children: [{}, {}]
//           }
//         ]
//       },
//       {}
//     ]
//   },
//   {}
// ]

const isSplitView = (data: PanelViewState): data is SplitView => {
  return typeof data === 'object' && data !== null && !Array.isArray(data) && 'direction' in data;
};

const isView = (data: PanelViewState): data is View => {
  return typeof data === 'object' && data !== null && !Array.isArray(data) && !('direction' in data);
};

const isViewArray = (data: PanelViewState): data is View[] => {
  return Array.isArray(data) && data.every(isView);
};

function PanelView(props: View) {
  return (
    <div
      class="border"
      style={{
        'flex-basis': props.size ? `${props.size}px` : 'auto',
        'min-width': props.minSize ? `${props.minSize}px` : '100px',
        'max-width': props.maxSize ? `${props.maxSize}px` : 'none'
      }}
    >
      <h2 class="panel-title">{props.title}</h2>
      {/* Add content here */}
    </div>
  );
}

function Unwrap(props: { data: PanelViewState }) {
  return (
    <>
      <Show when={isSplitView(props.data) && props.data}>
        {(d) => (
          <div style={{ display: 'flex', 'flex-direction': d().direction || 'column', gap: '4px' }}>
            <For each={d().children}>{(item) => <Unwrap data={item} />}</For>
          </div>
        )}
      </Show>
      <Show when={isView(props.data) && props.data}>{(d) => <PanelView {...d()} />}</Show>
      <Show when={isViewArray(props.data) && props.data}>
        {(d) => (
          <div class="panel-view-array">
            <For each={d()}>{(item) => <PanelView {...item} />}</For>
          </div>
        )}
      </Show>
    </>
  );
}

export default function DockingExample() {
  const [state, setState] = createStore<PanelViewState>({
    direction: 'column',
    children: [
      {
        direction: 'column',
        children: [{ title: 'Panel 2' }, { title: 'Panel 2.1' }]
      },
      {
        direction: 'row',
        children: [
          {
            title: 'Panel 1.1'
          },
          {
            title: 'Panel 1.2'
          }
        ]
      }
    ]
  });

  const video = (
    <video class="h-full w-full" controls src="https://www.w3schools.com/html/mov_bbb.mp4"></video>
  ) as HTMLVideoElement;

  const P = Portals({ children: video });

  const [ref, setRef] = createSignal<HTMLDivElement | undefined>(undefined);
  const [target, setTarget] = createSignal<{ width: string; height: string } | undefined>(undefined);
  onMount(() => {
    createResizeObserver(ref, (_, element) => {
      const rect = element.getBoundingClientRect();
      console.log('Resized', rect.width, rect.height);

      setTarget({
        width: rect.width + 'px',
        height: rect.height + 'px',
        top: element.offsetTop + 'px',
        left: element.offsetLeft + 'px'
      });
    });
  });

  const sensor = createDragSensor({
    threshold: 8
  });

  return (
    <>
      <div class="flex flex-col overflow-hidden">
        <h1 class="text-2xl font-bold">Docking Example</h1>
        <p class="text-sm text-gray-600">This is a placeholder for the docking example.</p>
        {/* Add your docking example components here */}
      </div>

      <dockview-demo class="flex h-full w-full flex-1 flex-col rounded-lg p-2">
        <GlobalCursorStyle />

        <div class="relative">
          {/* real layout */}
          <div class="grid grid-cols-4 grid-rows-4 gap-4 text-white">
            <div class="rounded-lg bg-pink-500 p-4">01</div>
            <div class="rounded-lg bg-pink-500 p-4">02</div>
            <div class="row-span-3 rounded-lg bg-pink-500 p-4">03</div>
            <div
              ref={setRef}
              class="relative col-span-2 touch-none rounded-lg bg-pink-500 p-4"
              onPointerDown={sensor.onPointerDown}
              style={{
                transform: `translate(${sensor.delta()?.x ?? 0}px, ${sensor.delta()?.y ?? 0}px)`
              }}
            >
              04
            </div>
          </div>

          {/* connected layout */}
          <div
            class={cn('pointer-events-none absolute inset-0', SHADED_BACKGROUND)}
            style={{
              ...target(),
              transform: `translate(${sensor.delta()?.x ?? 0}px, ${sensor.delta()?.y ?? 0}px)`
            }}
          >
            overlay
          </div>
        </div>

        <Unwrap data={state} />

        {/* Panels */}
        <div class="flex h-0 flex-1 flex-col overflow-hidden">
          <div class="flex flex-shrink-0 flex-grow-0" style={{ 'flex-basis': '40px' }}>
            <PanelContainer>
              <span class="p-4 text-white">Header Panel 1</span>
            </PanelContainer>
          </div>
          <Sash type="horizontal" />
          <div class="flex flex-shrink-0 flex-grow-1" style={{ 'flex-basis': '60%' }}>
            <div class="flex flex-shrink-0 flex-grow-1" style={{ 'flex-basis': '60%' }}>
              <PanelContainer class="bg-gray-800">
                <Tabs />
                <span class="p-4 text-white">Panel 2</span>
                <button
                  type="button"
                  onClick={() => {
                    P.toggle();
                  }}
                >
                  toggle
                </button>
                <P.Portal1 />
              </PanelContainer>
            </div>
            <Sash type="vertical" />
            <div class="flex flex-shrink-0 flex-grow-0" style={{ 'flex-basis': '80px' }}>
              <PanelContainer class="bg-gray-800">
                <span class="p-4 text-white">Side Panel 3</span>
                <div class="flex flex-wrap gap-2">
                  <TestButton />
                  <TestButton />
                  <TestButton />
                  <TestButton />
                  <P.Portal2 />
                </div>
              </PanelContainer>
            </div>
          </div>
        </div>
      </dockview-demo>

      <SolidDockView />
    </>
  );
}

function Portals(props: { children: JSX.Element }) {
  console.log('Portals', props.children);

  const source = (<div></div>) as HTMLDivElement;
  const target = (<div></div>) as HTMLDivElement;

  source.appendChild(props.children as unknown as Node);

  return {
    Portal1: () => {
      return source;
    },
    Portal2: () => {
      return target;
    },
    toggle: () => {
      if (source.hasChildNodes()) {
        target.appendChild(props.children as unknown as Node);
      } else {
        source.appendChild(props.children as unknown as Node);
      }
    }
  };
}

function TestButton() {
  return (
    <button class="group relative h-8 w-8 rounded border border-red-500 bg-red-500">
      <div class="translate-x-1px -translate-y-2px -m-1px group-focus:(translate-x-0 translate-y-0) pointer-events-none absolute inset-0 rounded border border-red-500 bg-white transition-transform"></div>
    </button>
  );
}

function Tabs(props: Partial<{ children: JSX.Element }>) {
  const [active, setActive] = createSignal<HTMLButtonElement>();

  function Button(props: Partial<{ children: JSX.Element }>) {
    const [ref, setRef] = createSignal<HTMLButtonElement>();
    const isActive = () => ref() === active();
    return (
      <button
        ref={setRef}
        class={cn(
          'rounded-full p-2 px-3 text-sm text-white transition-colors duration-1000 select-none'
          // isActive() ? 'text-[#000c18]' : 'text-white'
        )}
        onClick={(e) => setActive(e.currentTarget)}
      >
        {props.children}
      </button>
    );
  }

  return (
    <div test-tabs class="p-2px relative flex h-10 w-auto gap-1 self-start rounded-full bg-[#000c18]">
      {/* <div class="m-2px z-2 pointer-events-none absolute inset-0 flex gap-1 rounded-full">
        <span class="z-1 rounded-full p-2 px-3 text-sm text-red-600">Tab 1</span>
        <span class="z-1 rounded-full p-2 px-3 text-sm text-red-600">Tab 2</span>
        <span class="z-1 rounded-full p-2 px-3 text-sm text-red-600">Tab 3</span>
      </div> */}
      <div
        class="m-2px pointer-events-none absolute inset-y-0 rounded-full bg-white mix-blend-exclusion transition-transform ease-out"
        style={{ transform: `translateX(${active()?.offsetLeft}px)`, width: `${active()?.offsetWidth}px` }}
      ></div>
      <Button>Tab 1</Button>
      <Button>Tab 2</Button>
      <Button>Tab 3</Button>
    </div>
  );
}

function PanelContainer(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return <panel-container class={cn('flex h-full w-full flex-col rounded bg-[#000c18] p-1', local.class)} {...rest} />;
}

function Sash(props: { type?: 'horizontal' | 'vertical' }) {
  let dragStartPos: { x: number; y: number } | null = null;

  const onMove = (_x: number, _y: number, _isAltPressed: boolean) => {};

  const onDragEnd = () => {
    dragStartPos = null;
  };

  const handlers: {
    onBlur: JSX.EventHandler<HTMLButtonElement, FocusEvent>;
    onFocus: JSX.EventHandler<HTMLButtonElement, FocusEvent>;
    onKeyDown: JSX.EventHandler<HTMLButtonElement, KeyboardEvent>;
    onKeyUp: JSX.EventHandler<HTMLButtonElement, KeyboardEvent>;
    onMouseEnter: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
    onMouseLeave: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
    onPointerDown: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
  } = {
    onBlur: (e) => {},
    onFocus: (e) => {},
    onKeyDown: (e) => {},
    onKeyUp: (e) => {},
    onMouseEnter: (e) => {
      console.log('Mouse entered sash');
    },
    onMouseLeave: (e) => {},
    onPointerDown: (event) => {
      const targetElement = event.currentTarget;
      targetElement.setPointerCapture(event.pointerId);
      dragStartPos = { x: event.clientX, y: event.clientY };
      // set setDragging true

      const onPointerMove = (event: PointerEvent) => onMove(event.clientX, event.clientY, event.altKey);
      const onTouchMove = (event: TouchEvent) => {
        if (!event.touches[0]) return;
        onMove(event.touches[0].clientX, event.touches[0].clientY, event.altKey);
      };

      createEventListener(window, 'pointermove', onPointerMove);
      createEventListener(window, 'touchmove', onTouchMove);
      createEventListener(window, 'pointerup', onDragEnd);
      createEventListener(window, 'touchend', onDragEnd);
      createEventListener(window, 'contextmenu', onDragEnd);
    }
  };

  return (
    <button
      type="button"
      role="separator"
      {...handlers}
      aria-orientation={props.type === 'horizontal' ? 'horizontal' : 'vertical'}
      aria-valuemax="0.8"
      aria-valuemin="0.2"
      aria-valuenow="0.33578"
      data-orientation={props.type === 'horizontal' ? 'horizontal' : 'vertical'}
      class={[
        `relative flex flex-shrink-0 touch-none place-content-center place-items-center outline-0 select-none`,
        props.type === 'horizontal' ? 'h-1px w-full cursor-ns-resize' : 'w-1px h-full cursor-ew-resize'
      ].join(' ')}
    >
      <div class={['absolute', props.type === 'horizontal' ? 'inset-x-0 h-4' : 'inset-y-0 w-4'].join(' ')}></div>
      <ResizableHandle {...props} />
    </button>
  );
}

function ResizableHandle(props: { type?: 'horizontal' | 'vertical' }) {
  return (
    <div
      class={[
        'flex flex-shrink-0 place-content-center place-items-center rounded bg-white',
        props.type === 'horizontal' ? 'h-2.5 w-4' : 'h-4 w-2.5'
      ].join(' ')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class={['h-2.5 w-2.5', props.type === 'horizontal' ? 'rotate-90' : ''].join(' ')}
        viewBox="0 0 15 15"
      >
        <path
          fill="currentColor"
          fill-rule="evenodd"
          d="M5.5 4.625a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25m4 0a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25M10.625 7.5a1.125 1.125 0 1 1-2.25 0a1.125 1.125 0 0 1 2.25 0M5.5 8.625a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25m5.125 2.875a1.125 1.125 0 1 1-2.25 0a1.125 1.125 0 0 1 2.25 0M5.5 12.625a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25"
          clip-rule="evenodd"
        ></path>
        <title>Resizable handle</title>
      </svg>
    </div>
  );
}

function GlobalCursorStyle(props: { globalCursorStyle?: 'horizontal' | 'vertical' | 'both' }) {
  const cursorStyle = createMemo(() => {
    switch (props.globalCursorStyle) {
      case 'horizontal':
        return 'col-resize';
      case 'vertical':
        return 'row-resize';
      case 'both':
        return 'move';
      default:
        return undefined;
    }
  });

  return (
    <Show when={cursorStyle()}>
      {(cursorStyle) => (
        <Portal mount={document.head}>
          <style>
            {`
          * { cursor: ${cursorStyle()}!important; }
        `}
          </style>
        </Portal>
      )}
    </Show>
  );
}

const SHADED_BACKGROUND =
  'col-start-1 row-start-1 rounded-lg border bg-[image:repeating-linear-gradient(315deg,currentColor_0,currentColor_1px,transparent_0,transparent_50%)] bg-[size:8px_8px] bg-top-left text-black/10 dark:text-white/12.5';
