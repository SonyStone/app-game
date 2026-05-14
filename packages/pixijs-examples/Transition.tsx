import { resolveFirst } from '@solid-primitives/refs';
import { createSwitchTransition } from '@solid-primitives/transition-group';
import { Container as _Container } from 'pixi.js';
import { FlowComponent, JSX, JSXElement } from 'solid-js';

const TRANSITION_MODE_MAP = {
  inout: 'in-out',
  outin: 'out-in'
} as const;

type TransitionEvents<E> = {
  /**
   * Function called before the enter transition starts.
   * The {@link element} is not yet rendered.
   */
  onBeforeEnter?: (element: E) => void;
  /**
   * Function called when the enter transition starts.
   * The {@link element} is rendered to the DOM.
   *
   * Call {@link done} to end the transition - removes the enter classes,
   * and calls {@link TransitionEvents.onAfterEnter}.
   * If the parameter for {@link done} is not provided, it will be called on `transitionend` or `animationend`.
   */
  onEnter?: (element: E, done: () => void) => void;
  /**
   * Function called after the enter transition ends.
   * The {@link element} is removed from the DOM.
   */
  onAfterEnter?: (element: E) => void;
  /**
   * Function called before the exit transition starts.
   * The {@link element} is still rendered, exit classes are not yet applied.
   */
  onBeforeExit?: (element: E) => void;
  /**
   * Function called when the exit transition starts, after the exit classes are applied
   * ({@link TransitionProps.enterToClass} and {@link TransitionProps.exitActiveClass}).
   * The {@link element} is still rendered.
   *
   * Call {@link done} to end the transition - removes exit classes,
   * calls {@link TransitionEvents.onAfterExit} and removes the element from the DOM.
   * If the parameter for {@link done} is not provided, it will be called on `transitionend` or `animationend`.
   */
  onExit?: (element: E, done: () => void) => void;
  /**
   * Function called after the exit transition ends.
   * The {@link element} is removed from the DOM.
   */
  onAfterExit?: (element: E) => void;
};

/**
 * Props for the {@link Transition} component.
 */
type TransitionProps = TransitionEvents<_Container> & {
  /**
   * Whether to apply transition on initial render. Defaults to `false`.
   */
  appear?: boolean;
  /**
   * Controls the timing sequence of leaving/entering transitions.
   * Available modes are `"outin"` and `"inout"`;
   * Defaults to simultaneous.
   */
  mode?: 'inout' | 'outin';
};

export const Transition: FlowComponent<TransitionProps> = (props) => {
  const first = resolveFirst(
    () => props.children,
    (item): item is _Container & JSXElement => item instanceof _Container
  );

  return createSwitchTransition(first, {
    mode: TRANSITION_MODE_MAP[props.mode!],
    appear: props.appear,
    onEnter(el, done) {
      props.onBeforeEnter?.(el);
      queueMicrotask(() => {
        if (!el.parent) return done();
        props.onEnter?.(el, () => {
          done();
          props.onAfterEnter?.(el);
        });
      });
    },
    onExit(el, done) {
      props.onBeforeExit?.(el);
      queueMicrotask(() => {
        props.onExit?.(el, () => {
          done();
          props.onAfterExit?.(el);
        });
      });
    }
  }) as unknown as JSX.Element;
};
