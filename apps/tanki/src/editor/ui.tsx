import { makeEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';

/**
 * Small controls shared by the editor's panels, in its dark UI: buttons, number fields and
 * titled sections.
 */

/** A text button; `tone` picks the accent or the danger color. */
export function Button(props: {
  children: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: 'plain' | 'accent' | 'danger';
  /** Stretches the button over the full width of its column. */
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={() => props.onClick()}
      class={[
        'h-7 cursor-pointer rounded-md border border-solid px-2.5 text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-40',
        {
          'w-full': props.wide,
          'border-[#3d3d3d] bg-[#2b2b2b] text-[#e6e6e6] enabled:hover:bg-[#363636]':
            (props.tone ?? 'plain') === 'plain',
          'border-[#ffb020] bg-[#ffb020] text-[#1b1b1b] enabled:hover:bg-[#ffc24d]': props.tone === 'accent',
          'border-[#5a2b2b] bg-[#3a2323] text-[#ffb4b4] enabled:hover:bg-[#4a2a2a]': props.tone === 'danger'
        }
      ]}
    >
      {props.children}
    </button>
  );
}

/**
 * A labelled number field that reports a value when it is committed (Enter or leaving the
 * field), not on every keystroke, so each change is one undo step. Values outside `min` and
 * `max` are clamped; text that is not a number is ignored.
 */
export function NumberField(props: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Decimal places shown. */
  digits?: number;
}) {
  return (
    <label class="flex items-center justify-between gap-2 text-xs text-[#b5b5b5]">
      <span>{props.label}</span>
      <span class="flex items-center gap-1.5">
        <input
          type="number"
          value={props.value.toFixed(props.digits ?? 1)}
          step={props.step ?? 0.5}
          min={props.min}
          max={props.max}
          onChange={(event) => {
            const value = Number.parseFloat(event.currentTarget.value);

            if (Number.isFinite(value)) {
              props.onCommit(Math.min(Math.max(value, props.min ?? -Infinity), props.max ?? Infinity));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          class="h-7 w-20 rounded-md border border-solid border-[#3d3d3d] bg-[#1b1b1b] px-2 text-right text-xs text-[#f0f0f0] outline-none focus:border-[#ffb020]"
        />
        <span class="w-5 text-[#8a8a8a]">{props.unit}</span>
      </span>
    </label>
  );
}

/** A titled group of controls in a side panel. */
export function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-2 border-0 border-b border-solid border-[#333] px-3 py-3">
      <h3 class="m-0 text-[10px] font-semibold tracking-wider text-[#8a8a8a] uppercase">{props.title}</h3>
      {props.children}
    </section>
  );
}

/** A modal dialog over the editor; clicking outside or Escape closes it. */
export function Dialog(props: { title: string; onClose: () => void; children: JSX.Element; width?: string }) {
  makeEventListener(window, 'keydown', (event) => {
    if (event.key === 'Escape') {
      props.onClose();
    }
  });

  return (
    <div
      class="absolute inset-0 z-20 grid place-items-center bg-black/45"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-label={props.title}
        class="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-solid border-[#3d3d3d] bg-[#232323] text-[#e6e6e6] shadow-2xl"
        style={{ width: props.width ?? '420px' }}
      >
        <header class="flex items-center justify-between border-0 border-b border-solid border-[#333] px-4 py-3">
          <h2 class="m-0 text-sm font-semibold">{props.title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => props.onClose()}
            class="grid h-6 w-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-base text-[#9a9a9a] hover:bg-[#333] hover:text-white"
          >
            ×
          </button>
        </header>
        <div class="overflow-auto">{props.children}</div>
      </div>
    </div>
  );
}
