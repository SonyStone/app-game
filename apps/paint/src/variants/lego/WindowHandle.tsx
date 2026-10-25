import { createSignal, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './WindowHandle.module.css';

/** A plate's stud-free handle. Drags in every mode; names become editable only in Edit. */
export function WindowHandle(props: {
  name: string;
  collapsed: boolean;
  editing: boolean;
  /** The fitted plate width; tiny plates use a compact grip and collapse button. */
  width: number;
  onDrag: (event: PointerEvent) => void;
  onCollapse: () => void;
  onRename: (name: string) => void;
}) {
  const [renaming, setRenaming] = createSignal(false);
  const keep = (input: HTMLInputElement) => {
    const name = input.value.trim();
    setRenaming(false);
    if (name && name !== props.name) {
      props.onRename(name);
    }
  };

  return (
    <div
      class={styles.handle}
      data-compact={props.width < 100 ? '' : undefined}
      data-window-handle
      data-collapsed={props.collapsed ? '' : undefined}
      role="toolbar"
      aria-label={`${props.name} window`}
      onPointerDown={(event) => {
        if (!(event.target instanceof Element) || event.target.closest('button, input')) {
          return;
        }

        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        props.onDrag(event);
      }}
    >
      <span class={styles.grip} aria-hidden="true">
        <SketchIcon name="grip" size={16} />
      </span>
      <Show
        when={renaming() && props.editing}
        fallback={
          <Show when={props.editing} fallback={<span class={styles.name}>{props.name}</span>}>
            <button
              class={styles.name}
              type="button"
              aria-label={`Rename ${props.name}`}
              title="Rename window"
              onClick={() => setRenaming(true)}
            >
              {props.name}
            </button>
          </Show>
        }
      >
        <input
          class={styles.field}
          aria-label="Window name"
          maxlength={64}
          value={props.name}
          ref={(input) => queueMicrotask(() => input.select())}
          onBlur={(event) => keep(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }

            if (event.key === 'Escape') {
              event.stopPropagation();
              setRenaming(false);
            }
          }}
        />
      </Show>
      <button
        class={styles.collapse}
        type="button"
        aria-label={`${props.collapsed ? 'Expand' : 'Collapse'} ${props.name}`}
        aria-expanded={props.collapsed ? 'false' : 'true'}
        onClick={props.onCollapse}
      >
        <SketchIcon name={props.collapsed ? 'down' : 'up'} size={18} />
      </button>
    </div>
  );
}
