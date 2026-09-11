import { cn } from '@app-game/utils/cn';
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import { Portal, type ComponentProps, type JSX } from '@solidjs/web';
import { Show, createContext, createSignal, omit, onSettled, useContext, type ParentProps } from 'solid-js';

interface PopoverState {
  readonly open: () => boolean;
  readonly setOpen: (open: boolean) => void;
  readonly contentId: string;
  readonly gutter: number;
  readonly placement: Placement;
  readonly shift: number;
  trigger: HTMLElement | undefined;
}

const PopoverContext = createContext<PopoverState>();
let popoverId = 0;

export type PopoverProps = ParentProps<{
  /** Optional controlled state, used together with onOpenChange. */
  open?: boolean;
  /** Reports trigger, Escape and outside-pointer changes. */
  onOpenChange?: (open: boolean) => void;
  /** Opens the popover on initial render. */
  defaultOpen?: boolean;
  /** Preferred Floating UI placement. Defaults to bottom-start. */
  placement?: Placement;
  /** Distance between the trigger and content. Defaults to 5px. */
  gutter?: number;
  /** Minimum viewport clearance used while shifting. Defaults to 8px. */
  shift?: number;
  /** Accepted for compatibility with the Solid UI Popover API; flipping is always enabled. */
  flip?: boolean;
}>;

/** Provides Solid UI-compatible popover state and Floating UI positioning for Solid 2. */
export function Popover(props: PopoverProps): JSX.Element {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);
  const state: PopoverState = {
    open: () => props.open ?? open(),
    setOpen: value => { setOpen(value); props.onOpenChange?.(value); },
    contentId: `solid-ui-popover-${++popoverId}`,
    gutter: props.gutter ?? 5,
    placement: props.placement ?? 'bottom-start',
    shift: props.shift ?? 8,
    trigger: undefined
  };
  return <PopoverContext value={state}>{props.children}</PopoverContext>;
}

/** Anchors and toggles the nearest Popover. */
export function PopoverTrigger(props: ComponentProps<'button'>): JSX.Element {
  const popover = usePopover();
  const rest = omit(props, 'onClick', 'ref', 'aria-controls', 'aria-expanded', 'aria-haspopup');
  return (
    <button
      {...rest}
      ref={(element) => {
        popover.trigger = element;
        if (typeof props.ref === 'function') props.ref(element);
      }}
      aria-controls={popover.contentId}
      aria-expanded={popover.open() ? 'true' : 'false'}
      aria-haspopup={props['aria-haspopup'] ?? 'dialog'}
      onClick={(event) => {
        callHandler(props.onClick, event);
        popover.setOpen(!popover.open());
      }}
    />
  );
}

export type PopoverContentProps = ComponentProps<'div'> & {
  /** Move focus into interactive content on open; close when focus leaves. Defaults false. */
  initialFocus?: boolean;
};

/** Renders popover content in a portal so diagram clipping cannot hide it. */
export function PopoverContent(props: PopoverContentProps): JSX.Element {
  const popover = usePopover();
  return (
    <Show when={popover.open()}>
      <Portal>
        <PopoverSurface {...props} popoverState={popover} />
      </Portal>
    </Show>
  );
}

function PopoverSurface(props: PopoverContentProps & { readonly popoverState: PopoverState }): JSX.Element {
  let content!: HTMLDivElement;
  const rest = omit(props, 'class', 'popoverState', 'ref', 'role', 'id', 'initialFocus');

  onSettled(() => {
    const trigger = props.popoverState.trigger;
    if (!trigger) return;
    const update = () => positionPopover(trigger, content, props.popoverState);
    const stopUpdating = autoUpdate(trigger, content, update);
    if (props.initialFocus) (content.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? content).focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { props.popoverState.setOpen(false); trigger.focus({ preventScroll: true }); }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!content.contains(event.target) && !trigger.contains(event.target)) props.popoverState.setOpen(false);
    };
    const closeOnOutsideFocus = (event: FocusEvent) => {
      if (props.initialFocus && event.target instanceof Node && !content.contains(event.target) && !trigger.contains(event.target)) props.popoverState.setOpen(false);
    };
    document.addEventListener('focusin', closeOnOutsideFocus);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      stopUpdating();
      document.removeEventListener('focusin', closeOnOutsideFocus);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  });

  return (
    <div
      {...rest}
      ref={element => { content = element; if (typeof props.ref === 'function') props.ref(element); }}
      tabindex={props.tabindex ?? -1}
      id={props.popoverState.contentId}
      role={props.role ?? 'dialog'}
      class={cn(
        'bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-none',
        props.class
      )}
    />
  );
}

function positionPopover(trigger: HTMLElement, content: HTMLElement, state: PopoverState): void {
  void computePosition(trigger, content, {
    placement: state.placement,
    middleware: [offset(state.gutter), flip(), shift({ padding: state.shift })]
  }).then(({ x, y }) => {
    Object.assign(content.style, { left: `${x}px`, position: 'fixed', top: `${y}px` });
  });
}

function usePopover(): PopoverState {
  const context = useContext(PopoverContext);
  if (!context) throw new Error('Popover components must be nested inside Popover');
  return context;
}

function callHandler<T extends Event>(handler: unknown, event: T): void {
  if (typeof handler === 'function') handler(event);
}
