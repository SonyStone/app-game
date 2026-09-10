import type { PatternResource } from '@app-game/abr-parser/browser';
import { createMemo, For } from 'solid-js';
import styles from './TexturePicker.module.css';
import { ResourceThumbnail } from './ResourceThumbnail';

/** A selected pattern swatch opens the embedded pattern library without a modal. */
export function TexturePicker(props: {
  patterns: PatternResource[];
  selectedId: string;
  selectedName: string;
  disabled: boolean;
  onSelect: (pattern: PatternResource) => void;
}) {
  let picker!: HTMLDetailsElement;
  const selected = createMemo(() => props.patterns.find((pattern) => pattern.id === props.selectedId));
  return (
    <details ref={picker} class={styles.patternPicker}>
      <summary
        aria-label="Texture pattern"
        aria-disabled={props.disabled ? 'true' : 'false'}
        onClick={(event) => {
          if (props.disabled) event.preventDefault();
        }}
      >
        <ResourceThumbnail kind="pattern" label="Selected texture preview" resources={{ pattern: selected() }} />
        <span>{selected()?.name || props.selectedName || 'No embedded pattern'}</span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div
        class={`${styles.resourceGrid} ${styles.patternGrid}`}
        role="group"
        aria-label="Texture patterns"
      >
        <For each={props.patterns}>
          {(pattern) => (
            <button
              type="button"
              title={pattern.name}
              aria-label={pattern.name}
              aria-pressed={pattern.id === props.selectedId ? 'true' : 'false'}
              onClick={() => {
                props.onSelect(pattern);
                picker.open = false;
              }}
            >
              <ResourceThumbnail kind="pattern" label={`${pattern.name} texture`} resources={{ pattern }} />
            </button>
          )}
        </For>
      </div>
    </details>
  );
}
