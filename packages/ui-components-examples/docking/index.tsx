/* eslint-disable @typescript-eslint/no-namespace */

import { cn } from '@packages/utils/cn';
import { createEventListener } from '@solid-primitives/event-listener';
import { ComponentProps, createMemo, createSignal, Show, splitProps, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Portal } from 'solid-js/web';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
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

export default function DockingExample() {
  const [state, setState] = createStore<any>({
    panels: [
      {
        id: 'panel1',
        size: 300,
        minSize: 100,
        maxSize: 600,
        position: 'left'
      },
      {
        id: 'panel2',
        size: 400,
        minSize: 200,
        maxSize: 800,
        position: 'right'
      }
    ]
  });

  const video = (
    <video class="h-full w-full" controls src="https://www.w3schools.com/html/mov_bbb.mp4"></video>
  ) as HTMLVideoElement;

  const P = Portals({ children: video });

  return (
    <div dockview-demo class="flex h-full w-full flex-1 flex-col rounded-lg p-2">
      <div class="flex flex-col overflow-hidden">
        <h1 class="text-2xl font-bold">Docking Example</h1>
        <p class="text-sm text-gray-600">This is a placeholder for the docking example.</p>
        {/* Add your docking example components here */}
      </div>

      <GlobalCursorStyle />

      {/* Panels */}
      <div class="flex h-0 flex-1 flex-col overflow-hidden">
        <div class="flex flex-shrink-0 flex-grow-0" style={{ 'flex-basis': '40px' }}>
          <PanelContainer>
            <span class="p-4 text-white ">Header Panel 1</span>
          </PanelContainer>
        </div>
        <Sash type="horizontal" />
        <div class="flex-grow-1 flex flex-shrink-0" style={{ 'flex-basis': '60%' }}>
          <div class="flex-grow-1 flex flex-shrink-0" style={{ 'flex-basis': '60%' }}>
            <PanelContainer class="bg-gray-800">
              <Tabs />
              <span class="p-4 text-white ">Panel 2</span>
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
              <span class="p-4 text-white ">Side Panel 3</span>
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
    </div>
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
    <button class="group relative h-8 w-8  rounded border border-red-500 bg-red-500">
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
          'select-none rounded-full p-2 px-3 text-sm text-white transition-colors duration-1000'
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
        class="m-2px pointer-events-none absolute inset-y-0 rounded-full bg-white mix-blend-exclusion transition-transform  ease-out"
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
        ` relative flex flex-shrink-0 touch-none select-none place-content-center place-items-center outline-0`,
        props.type === 'horizontal' ? 'h-1px w-full  cursor-ns-resize' : 'w-1px h-full cursor-ew-resize'
      ].join(' ')}
    >
      <div class={['absolute ', props.type === 'horizontal' ? 'inset-x-0 h-4' : 'inset-y-0 w-4'].join(' ')}></div>
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
