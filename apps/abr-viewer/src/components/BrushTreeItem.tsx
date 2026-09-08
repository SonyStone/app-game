import { createMemo } from 'solid-js';
import { brushToFormValues } from '../features/brush-detail/brush-form-schema';
import { useColorProfile } from '../features/brush-detail/ColorProfile';
import { BrushPreviewCanvas } from '../features/brush-detail/components/panel-components/BrushPreviewCanvas';
import { settingGroups } from '../features/brush-detail/settings-fields';
import type { BrushNode } from '../lib/brush-tree';
import { BrushToolIcon } from './BrushToolIcon';

/** A compact, draggable preset with a rendered stroke and a persistent selection outline. */
export function BrushTreeItem(props: {
  block: BrushNode;
  selected: boolean;
  dragging: boolean;
  height: number;
  /** Keyboard activation also selects the preset; pointer selection is handled by the tree. */
  onActivate: (select?: boolean) => void;
}) {
  const colors = useColorProfile();
  const values = createMemo(() => brushToFormValues(props.block.brush, colors?.converter()));
  const toolLabel = () =>
    settingGroups.tool.type.options?.find((option) => option.value === values().tool.type)?.label ?? values().tool.type;
  return (
    <div
      data-drag-handle
      data-brush-id={props.block.id}
      class={`abr-preset ${props.selected ? 'is-selected' : ''} ${props.dragging ? 'is-dragging' : ''}`}
      role="button"
      tabindex="0"
      aria-label={props.block.name}
      aria-pressed={props.selected ? 'true' : 'false'}
      title={`${props.block.name} · ${Math.round(props.block.brush.diameter ?? 30)} px`}
      onClick={() => props.onActivate()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onActivate(true);
        }
      }}
    >
      <BrushPreviewCanvas
        brush={props.block.brush}
        values={values()}
        height={props.height}
        backgroundColor="#333333"
        thumbnail
      />
      <span class="abr-preset-name">{props.block.name}</span>
      <span class="abr-preset-tool" title={`Tool: ${toolLabel()}`}>
        <BrushToolIcon type={values().tool.type} label={`Tool: ${toolLabel()}`} />
      </span>
    </div>
  );
}
