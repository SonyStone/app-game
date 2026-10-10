import { createElementSize, useWindowSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';
import { placeBesideDock } from './placement';

/**
 * A card that comes out of a dock control: placed on the canvas side of the control marked `data-anchor={anchor}`,
 * level with it and kept inside the window (see `placeBesideDock`). It follows the control when the window or the
 * dock changes size, which moves the dock's controls; `dockSize` carries those changes. Hidden while the control is
 * not in the dock.
 */
export function Beside(props: {
  /** The dock holding the control the card belongs to. */
  dock: HTMLElement | undefined;
  /** The `data-anchor` of that control. */
  anchor: string;
  dockSide: 'left' | 'right';
  /** The dock's current size; read so the card moves along when controls arrive above its anchor. */
  dockSize: { width: number | null; height: number | null };
  class?: string;
  style?: JSX.CSSProperties;
  role?: 'dialog' | 'status' | 'toolbar';
  label?: string;
  /** Marks a panel for the variant's outside-press check. */
  panel?: boolean;
  ref?: (element: HTMLElement) => void;
  children: JSX.Element;
}) {
  const [element, setElement] = createSignal<HTMLElement>();
  const size = createElementSize(element);
  const view = useWindowSize();
  const place = createMemo(() => {
    // Arriving controls resize the dock, also after the flush that adds them; read for that.
    void props.dockSize.height;
    void props.dockSize.width;
    const anchor = props.dock?.querySelector(`[data-anchor="${props.anchor}"]`);
    if (!anchor) {
      return undefined;
    }

    const rect = anchor.getBoundingClientRect();
    return placeBesideDock(rect, { width: size.width ?? 0, height: size.height ?? 0 }, props.dockSide, {
      width: view.width,
      height: view.height
    });
  });

  return (
    <section
      ref={(el) => {
        setElement(el);
        props.ref?.(el);
      }}
      class={props.class}
      role={props.role}
      aria-label={props.label}
      data-growing-panel={props.panel ? '' : undefined}
      style={{
        ...props.style,
        left: `${place()?.left ?? 0}px`,
        top: `${place()?.top ?? 0}px`,
        visibility: place() ? undefined : 'hidden'
      }}
    >
      {props.children}
    </section>
  );
}
