import { createMemo, For, Show } from 'solid-js';
import type { BrushWithPreview } from '../../../../lib/abr';
import { brushPreviewResources } from '../../../brush-preview/resources';
import { record } from '../../brush-form-schema';
import styles from './DualBrushPicker.module.css';
import { ResourceThumbnail } from './ResourceThumbnail';

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
      <div class={styles.resourceSelection}>
        <ResourceThumbnail kind="dual" label="Selected dual brush tip preview" resources={resources()} />
        <span>{selectedName()}</span>
      </div>
      <div class={styles.resourceGrid} role="group" aria-label="Dual brush tips">
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
          <span class={styles.featureNote}>Import brushes to choose a second tip.</span>
        </Show>
      </div>
    </div>
  );
}
