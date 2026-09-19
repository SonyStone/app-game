import type { PatternResource } from '@app-game/abr-brush/resources';
import { createMemo, For } from 'solid-js';
import { ResourceThumbnail } from './ResourceThumbnail';
import styles from './TexturePicker.module.css';

/** A selected pattern swatch opens the embedded pattern library without a modal. */
export function TexturePicker(props: {
  patterns: PatternResource[];
  selectedId: string;
  selectedName: string;
  disabled: boolean;
  onSelect: (pattern: PatternResource) => void;
}) {
  let picker!: HTMLDetailsElement;
  const selected = createMemo(() => props.patterns.find((pattern) => pattern.resource.id === props.selectedId));
  return (
    <details ref={picker} class={styles.patternPicker}>
      <summary
        aria-label="Texture pattern"
        aria-disabled={props.disabled ? 'true' : 'false'}
        onClick={(event) => {
          if (props.disabled) event.preventDefault();
        }}
      >
        <ResourceThumbnail
          kind="pattern"
          label="Selected texture preview"
          resources={{ pattern: selected()?.source }}
        />
        <span>{selected()?.resource.name || props.selectedName || 'No embedded pattern'}</span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div class={`${styles.resourceGrid} ${styles.patternGrid}`} role="group" aria-label="Texture patterns">
        <For each={props.patterns}>
          {(pattern) => (
            <button
              type="button"
              title={pattern.resource.name}
              aria-label={pattern.resource.name}
              aria-pressed={pattern.resource.id === props.selectedId ? 'true' : 'false'}
              onClick={() => {
                props.onSelect(pattern);
                picker.open = false;
              }}
            >
              <ResourceThumbnail
                kind="pattern"
                label={`${pattern.resource.name} texture`}
                resources={{ pattern: pattern.source }}
              />
            </button>
          )}
        </For>
      </div>
    </details>
  );
}
