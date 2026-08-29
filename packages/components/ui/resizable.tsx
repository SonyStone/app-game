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

/** Pointer-driven divider that resizes its immediately adjacent panels. */
export function ResizableHandle(props: ResizableHandleProps): JSX.Element {
  const rest = omit(props, 'class', 'children', 'orientation', 'withHandle', 'onPointerDown');
  return (
    <div
      role="separator"
      class={cn(
        'bg-border focus-visible:(outline-none ring-1.5 ring-ring ring-offset-1) flex w-px flex-none touch-none items-center justify-center transition-shadow select-none',
        props.orientation === 'vertical' && 'h-px w-full',
        props.class
      )}
      aria-orientation={props.orientation ?? 'horizontal'}
      onPointerDown={(event) => startResize(event, props.orientation ?? 'horizontal')}
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
  const previous = handle.previousElementSibling as HTMLElement | null;
  const next = handle.nextElementSibling as HTMLElement | null;
  const container = handle.parentElement;
  if (!previous || !next || !container) return;

  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  const vertical = orientation === 'vertical';
  const start = vertical ? event.clientY : event.clientX;
  const previousSize = vertical ? previous.getBoundingClientRect().height : previous.getBoundingClientRect().width;
  const nextSize = vertical ? next.getBoundingClientRect().height : next.getBoundingClientRect().width;
  const totalSize = vertical ? container.getBoundingClientRect().height : container.getBoundingClientRect().width;
  const previousMin = Number(previous.dataset.minSize ?? 0) * totalSize;
  const nextMin = Number(next.dataset.minSize ?? 0) * totalSize;

  const onPointerMove = (moveEvent: PointerEvent) => {
    const delta = (vertical ? moveEvent.clientY : moveEvent.clientX) - start;
    const boundedDelta = Math.max(previousMin - previousSize, Math.min(nextSize - nextMin, delta));
    previous.style.flexBasis = `${previousSize + boundedDelta}px`;
    next.style.flexBasis = `${nextSize - boundedDelta}px`;
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
