/**
 * MARK: BrushTreeItem
 *
 * A single brush card in the tree view. Shows preview thumbnail,
 * name, key properties, and a selection checkbox.
 */

import { Show, type JSX } from 'solid-js';
import type { BrushWithPreview } from '~/lib/abr';

export type BrushTreeItemProps = {
  brush: BrushWithPreview;
  selected: boolean;
  depth: number;
  onSelect: (brush: BrushWithPreview, e: PointerEvent) => void;
  onClick: (brush: BrushWithPreview) => void;
  onDragStart: (brushId: string, e: DragEvent) => void;
};

export function BrushTreeItem(props: BrushTreeItemProps): JSX.Element {
  const formatValue = (value: number | undefined, unit: string = '') => {
    if (value === undefined) return '—';
    return `${Math.round(value * 100) / 100}${unit}`;
  };

  return (
    <div
      data-brush-id={props.brush.id}
      class={`group bg-ps-bg cursor-pointer overflow-hidden rounded-lg border transition-all duration-150 ${
        props.selected ? 'border-ps-accent ring-ps-accent ring-1' : 'border-ps-border hover:border-ps-border-light'
      }`}
      style={{ 'margin-left': `${props.depth * 16}px` }}
      draggable={true}
      onDragStart={(e) => props.onDragStart(props.brush.id, e)}
      onPointerDown={(e) => {
        // Checkbox-like selection on ctrl/shift click handled by onSelect
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          e.preventDefault();
          props.onSelect(props.brush, e);
        }
      }}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        props.onClick(props.brush);
      }}
    >
      {/* Brush Image Preview */}
      <div class="checkered-bg relative aspect-square">
        <Show
          when={props.brush.imageDataUrl}
          fallback={
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="p-2 text-center">
                <div
                  class={`mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full ${
                    props.brush.type === 'computed' ? 'bg-ps-bg-lighter' : 'bg-ps-bg-light'
                  }`}
                >
                  <Show
                    when={props.brush.type === 'computed'}
                    fallback={
                      <svg class="text-ps-text-muted h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
                        />
                      </svg>
                    }
                  >
                    <svg class="text-ps-text-muted h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                  </Show>
                </div>
                <p class="text-ps-text-muted text-[10px]">
                  {props.brush.type === 'computed' ? 'Computed' : 'No preview'}
                </p>
              </div>
            </div>
          }
        >
          <img
            src={props.brush.imageDataUrl}
            alt={props.brush.name}
            class="absolute inset-0 h-full w-full object-contain p-1"
            style={{ 'image-rendering': 'pixelated' }}
          />
        </Show>

        {/* Selection checkbox */}
        <div
          class={`absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded border transition-all ${
            props.selected
              ? 'bg-ps-accent border-ps-accent'
              : 'border-ps-border-light bg-black/40 opacity-0 group-hover:opacity-100'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            props.onSelect(props.brush, e as unknown as PointerEvent);
          }}
        >
          <Show when={props.selected}>
            <svg class="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </Show>
        </div>

        {/* Type badge */}
        <div
          class={`absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] ${
            props.brush.type === 'computed' ? 'bg-purple-900/70 text-purple-200' : 'bg-blue-900/70 text-blue-200'
          }`}
        >
          {props.brush.type}
        </div>
      </div>

      {/* Brush Info */}
      <div class="border-ps-border-dark border-t p-2">
        <h3 class="text-ps-text-bright mb-1 truncate text-xs font-medium" title={props.brush.name}>
          {props.brush.name}
        </h3>

        <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Diameter</span>
            <span class="text-ps-text">{formatValue(props.brush.diameter, 'px')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Spacing</span>
            <span class="text-ps-text">{formatValue(props.brush.spacing, '%')}</span>
          </div>
        </div>

        <Show when={props.brush.brushTip}>
          <div class="border-ps-border-dark mt-1 flex justify-between border-t pt-1 text-[10px]">
            <span class="text-ps-text-muted">Tip</span>
            <span class="text-ps-text">
              {props.brush.brushTip!.width}×{props.brush.brushTip!.height}
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
}
