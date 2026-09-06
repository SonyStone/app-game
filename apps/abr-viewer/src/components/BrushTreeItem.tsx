import type { JSX } from '@solidjs/web';
/**
 * MARK: BrushTreeItem
 *
 * A single brush card in the tree view. Renders inside solid-nest's
 * BlockTree — receives block props from the parent render function.
 * Shows preview thumbnail, name, key properties.
 */

import { Show } from 'solid-js';
import type { BrushWithPreview } from '../lib/abr';
import type { BrushNode } from '../lib/brush-tree';

export type BrushTreeItemProps = {
  block: BrushNode;
  selected: boolean;
  dragging: boolean;
  onClickBrush: (brush: BrushWithPreview) => void;
};

export function BrushTreeItem(props: BrushTreeItemProps): JSX.Element {
  const brush = () => props.block.brush;

  const formatValue = (value: number | undefined, unit: string = '') => {
    if (value === undefined) return '—';
    return `${Math.round(value * 100) / 100}${unit}`;
  };

  return (
    <div
      data-drag-handle
      data-brush-id={brush().id}
      class={`group bg-ps-bg cursor-grab touch-none overflow-hidden rounded-lg border transition-all duration-150 active:cursor-grabbing ${
        props.selected ? 'border-ps-accent ring-ps-accent ring-1' : 'border-ps-border hover:border-ps-border-light'
      } ${props.dragging ? 'opacity-50' : ''}`}
      onDblClick={() => props.onClickBrush(brush())}
    >
      {/* Brush Image Preview */}
      <div class="checkered-bg relative h-32">
        <Show
          when={brush().imageDataUrl}
          fallback={
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="p-2 text-center">
                <div
                  class={`mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full ${
                    brush().type === 'computed' ? 'bg-ps-bg-lighter' : 'bg-ps-bg-light'
                  }`}
                >
                  <Show
                    when={brush().type === 'computed'}
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
                <p class="text-ps-text-muted text-[10px]">{brush().type === 'computed' ? 'Computed' : 'No preview'}</p>
              </div>
            </div>
          }
        >
          <img
            src={brush().imageDataUrl}
            alt={brush().name}
            class="absolute inset-0 h-full w-full object-contain p-1"
            style={{ 'image-rendering': 'pixelated' }}
          />
        </Show>

        {/* Selection indicator */}
        <Show when={props.selected}>
          <div class="bg-ps-accent border-ps-accent absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded border">
            <svg class="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </Show>

        {/* Type badge */}
        <div
          class={`absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] ${
            brush().type === 'computed' ? 'bg-purple-900/70 text-purple-200' : 'bg-blue-900/70 text-blue-200'
          }`}
        >
          {brush().type}
        </div>
      </div>

      {/* Brush Info */}
      <div class="border-ps-border-dark border-t p-2">
        <h3 class="text-ps-text-bright mb-1 truncate text-xs font-medium" title={brush().name}>
          {brush().name}
        </h3>

        <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Diameter</span>
            <span class="text-ps-text">{formatValue(brush().diameter, 'px')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Spacing</span>
            <span class="text-ps-text">{formatValue(brush().spacing, '%')}</span>
          </div>
        </div>

        <Show when={brush().brushTip}>
          <div class="border-ps-border-dark mt-1 flex justify-between border-t pt-1 text-[10px]">
            <span class="text-ps-text-muted">Tip</span>
            <span class="text-ps-text">
              {brush().brushTip!.width}×{brush().brushTip!.height}
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
}
