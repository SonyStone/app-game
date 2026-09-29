import { cn } from '@app-game/utils/cn';
import type { ComponentProps, JSX } from '@solidjs/web';
import { omit, Show } from 'solid-js';

export type ResizableProps = ComponentProps<'div'> & {
  /** Stacks panels left-to-right by default or top-to-bottom when vertical. */
  orientation?: 'horizontal' | 'vertical';
};

/** Container for locally resizable sibling panels. */
export function Resizable(props: ResizableProps): JSX.Element {
  const rest = omit(props, 'class', 'orientation');
  return (
    <div
      class={cn('flex size-full', props.orientation === 'vertical' && 'flex-col', props.class)}
      data-orientation={props.orientation ?? 'horizontal'}
      {...rest}
    />
  );
}

export type ResizablePanelProps = ComponentProps<'div'> & {
  /** Initial fraction of the container occupied by this panel. */
  initialSize?: number;
  /** Minimum fraction retained while dragging an adjacent handle. */
  minSize?: number;
};

/** A flexible panel whose basis can be changed by an adjacent handle. */
export function ResizablePanel(props: ResizablePanelProps): JSX.Element {
  const rest = omit(props, 'class', 'style', 'initialSize', 'minSize');
  return (
    <div
      class={cn('min-h-0 min-w-0', props.class)}
      data-min-size={props.minSize ?? 0}
      style={{
        'flex-basis': `${(props.initialSize ?? 0.5) * 100}%`,
        'flex-grow': 1,
        'flex-shrink': 1,
        ...(typeof props.style === 'object' ? props.style : {})
      }}
      {...rest}
    />
  );
}

export type ResizableHandleProps = ComponentProps<'div'> & {
  withHandle?: boolean;
  orientation?: 'horizontal' | 'vertical';
};

/**
 * Divider that resizes its immediately adjacent panels by pointer drag, or by 5% per arrow key and to either limit
 * with Home and End. Sizes are stored as fractions of the container, so they survive resizing and orientation changes.
 * `orientation` is the container's: a horizontal container has a vertical divider.
 */
export function ResizableHandle(props: ResizableHandleProps): JSX.Element {
  const rest = omit(props, 'class', 'children', 'orientation', 'withHandle', 'onPointerDown', 'onKeyDown');
  return (
    <div
      role="separator"
      tabindex={0}
      class={cn(
        'bg-border focus-visible:(outline-none ring-1.5 ring-ring ring-offset-1) flex w-px flex-none touch-none items-center justify-center transition-shadow select-none',
        props.orientation === 'vertical' && 'h-px w-full',
        props.class
      )}
      aria-orientation={props.orientation === 'vertical' ? 'horizontal' : 'vertical'}
      onPointerDown={(event) => startResize(event, props.orientation ?? 'horizontal')}
      onKeyDown={(event) => resizeByKey(event, props.orientation ?? 'horizontal')}
      {...rest}
    >
      <Show when={props.withHandle}>
        <div
          class={cn(
            'bg-border z-10 flex h-4 w-3 items-center justify-center rounded-sm border',
            props.orientation === 'vertical' && 'rotate-90'
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5" viewBox="0 0 15 15">
            <path
              fill="currentColor"
              fill-rule="evenodd"
              d="M5.5 4.625a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25m4 0a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25M10.625 7.5a1.125 1.125 0 1 1-2.25 0a1.125 1.125 0 0 1 2.25 0M5.5 8.625a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25m5.125 2.875a1.125 1.125 0 1 1-2.25 0a1.125 1.125 0 0 1 2.25 0M5.5 12.625a1.125 1.125 0 1 0 0-2.25a1.125 1.125 0 0 0 0 2.25"
              clip-rule="evenodd"
            />
            <title>Resize handle</title>
          </svg>
        </div>
      </Show>
      {props.children}
    </div>
  );
}

function startResize(event: PointerEvent & { currentTarget: HTMLDivElement }, orientation: 'horizontal' | 'vertical') {
  const handle = event.currentTarget;
  const panels = adjacentPanels(handle, orientation);
  if (!panels) return;

  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  const start = orientation === 'vertical' ? event.clientY : event.clientX;

  const onPointerMove = (moveEvent: PointerEvent) => {
    panels.resize((orientation === 'vertical' ? moveEvent.clientY : moveEvent.clientX) - start);
  };
  const onPointerUp = () => {
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerUp);
  };

  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
}

/** Moves the divider by 5% of the container per arrow key, or as far as the panels allow with Home and End. */
function resizeByKey(event: KeyboardEvent & { currentTarget: HTMLDivElement }, orientation: 'horizontal' | 'vertical') {
  const steps: Record<string, number> = { ArrowLeft: -0.05, ArrowUp: -0.05, ArrowRight: 0.05, ArrowDown: 0.05 };
  const step = event.key === 'Home' ? -1 : event.key === 'End' ? 1 : steps[event.key];
  const panels = step === undefined ? undefined : adjacentPanels(event.currentTarget, orientation);
  if (!panels || step === undefined) return;

  event.preventDefault();
  panels.resize(step * panels.total);
}

/**
 * Measures the panels beside `handle` and returns a function that moves the boundary between them by a pixel delta,
 * bounded by their `minSize`, storing both sizes as percentages of the container.
 * Every other panel is first pinned to its measured size: panels start from initial sizes that may not add up, and the
 * browser would otherwise shrink all of them to fit, moving the boundary less than the delta and resizing panels
 * that are not adjacent to the handle.
 */
function adjacentPanels(handle: HTMLElement, orientation: 'horizontal' | 'vertical') {
  const previous = handle.previousElementSibling as HTMLElement | null;
  const next = handle.nextElementSibling as HTMLElement | null;
  const container = handle.parentElement;
  if (!previous || !next || !container) return undefined;

  const size = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return orientation === 'vertical' ? rect.height : rect.width;
  };
  const total = size(container);
  const panels = [...container.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.getAttribute('role') !== 'separator'
  );
  const sizes = panels.map(size);
  panels.forEach((panel, index) => {
    panel.style.flexBasis = `${(sizes[index]! / total) * 100}%`;
  });

  const previousSize = size(previous);
  const nextSize = size(next);
  const previousMin = Number(previous.dataset.minSize ?? 0) * total;
  const nextMin = Number(next.dataset.minSize ?? 0) * total;

  return {
    total,
    resize(delta: number) {
      const bounded = Math.max(previousMin - previousSize, Math.min(nextSize - nextMin, delta));
      previous.style.flexBasis = `${((previousSize + bounded) / total) * 100}%`;
      next.style.flexBasis = `${((nextSize - bounded) / total) * 100}%`;
    }
  };
}
