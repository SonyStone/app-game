import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup } from 'solid-js';
import { opacityByte, scrubPercent } from './interactions';
import styles from './LayersPanel.module.css';

/** Percentage entry and label scrubbing. A gesture commits once, on release or Enter; Escape restores the value. */
export function PercentField(props: {
  label: string;
  value: number | undefined;
  disabled: boolean;
  reason?: string;
  onCommit: (byte: number) => Promise<boolean>;
}) {
  let active = true;
  onCleanup(() => {
    active = false;
  });
  const [draft, setDraft] = createSignal(() =>
    props.value === undefined ? '' : String(Math.round((props.value * 100) / 255))
  );
  const [gesture, setGesture] = createSignal<{ pointer: number; x: number; initial: number; value: number }>();
  const reset = () => setDraft(props.value === undefined ? '' : String(Math.round((props.value * 100) / 255)));

  async function commit(value = Number(draft())) {
    const original = props.value === undefined ? '' : String(Math.round((props.value * 100) / 255));
    setGesture(undefined);
    if (draft() !== '' && Number.isFinite(value) && opacityByte(value) !== props.value) {
      const accepted = await props.onCommit(opacityByte(value));
      if (active) {
        setDraft(accepted ? String(Math.round((opacityByte(value) * 100) / 255)) : original);
      }
    }
  }

  createEventListener(window, 'pointermove', (event) => {
    const start = gesture();
    if (!start || event.pointerId !== start.pointer) {
      return;
    }
    const value = scrubPercent(start.initial, event.clientX - start.x, event.shiftKey);
    setGesture({ ...start, value });
    setDraft(String(value));
  });
  createEventListener(window, 'pointerup', (event) => {
    if (!gesture()) {
      setGesture(undefined);
      return;
    }
    if (event.pointerId === gesture()?.pointer) {
      void commit(gesture()!.value);
    }
  });
  createEventListener(window, ['pointercancel', 'blur'], () => {
    setGesture(undefined);
    reset();
  });
  createEventListener(window, 'keydown', (event) => {
    if (!gesture()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setGesture(undefined);
      reset();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void commit(gesture()!.value);
    }
  });

  return (
    <label title={props.reason} class={styles.percentField} data-scrubbing={Boolean(gesture())}>
      <span
        title={`Drag to change ${props.label}. Shift accelerates. Escape cancels.`}
        onPointerDown={(event) => {
          if (props.disabled || event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setGesture({ pointer: event.pointerId, x: event.clientX, initial: Number(draft()), value: Number(draft()) });
        }}
      >
        {props.label}
      </span>
      <input
        aria-label={`Layer ${props.label.toLowerCase()} percent`}
        type="number"
        min="0"
        max="100"
        placeholder="—"
        disabled={props.disabled}
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            reset();
            event.currentTarget.blur();
          }
        }}
        onBlur={reset}
      />
      %
    </label>
  );
}
