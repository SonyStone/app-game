import type { PatternResource } from '@app-game/abr-parser/browser';
import { createMemo, For, Show } from 'solid-js';
import type { BrushWithPreview } from '../../../../lib/abr';
import { brushPreviewResources } from '../../../brush-preview/resources';
import { record } from '../../brush-form-schema';
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
    <details ref={picker} class="abr-pattern-picker">
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
      <div class="abr-resource-grid abr-pattern-grid" role="group" aria-label="Texture patterns">
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

/** Shows the actual secondary sample, including embedded tips absent from the preset list. */
export function DualBrushPicker(props: {
  brush: BrushWithPreview;
  brushes: BrushWithPreview[];
  onSelect: (brush: BrushWithPreview) => void;
}) {
  const tips = createMemo(() => [
    ...new Map(
      props.brushes
        .filter((brush) => !['dBrush', 'dTips'].includes(String(record(brush.settings.Brsh).__classId)))
        .map((brush) => [brush.sampledDataUuid || brush.id, brush])
    ).values()
  ]);
  const selectedTip = () => record(record(props.brush.settings.dualBrush).Brsh);
  const isSelected = (brush: BrushWithPreview) => {
    const selected = selectedTip();
    if (selected.sampledData) return selected.sampledData === brush.sampledDataUuid;
    const tip = record(brush.settings.Brsh);
    return (
      !brush.sampledDataUuid && tip.__classId === selected.__classId && JSON.stringify(tip) === JSON.stringify(selected)
    );
  };
  const selectedName = () =>
    tips().find(isSelected)?.name ||
    String(selectedTip()['Nm  '] || (selectedTip().sampledData ? 'Embedded tip' : 'Round tip'));
  const resources = createMemo(() => {
    const source = brushPreviewResources({
      ...props.brush,
      settings: {
        ...props.brush.settings,
        useTexture: false,
        dualBrush: { ...record(props.brush.settings.dualBrush), useDualBrush: true }
      }
    });
    return source;
  });
  return (
    <div class="abr-dual-picker">
      <div class="abr-resource-selection">
        <ResourceThumbnail kind="dual" label="Selected dual brush tip preview" resources={resources()} />
        <span>{selectedName()}</span>
      </div>
      <div class="abr-resource-grid" role="group" aria-label="Dual brush tips">
        <For each={tips()}>
          {(brush) => (
            <button
              type="button"
              title={brush.name}
              aria-label={brush.name}
              aria-pressed={isSelected(brush) ? 'true' : 'false'}
              onClick={() => props.onSelect(brush)}
            >
              <ResourceThumbnail
                kind="tip"
                label={`${brush.name} tip`}
                tip={brush.brushTip}
                hardness={brush.hardness}
              />
              <span>{Math.round(brush.diameter ?? 30)}</span>
            </button>
          )}
        </For>
        <Show when={!tips().length}>
          <span class="abr-feature-note">Import brushes to choose a second tip.</span>
        </Show>
      </div>
    </div>
  );
}
