import { ComponentProps, Show } from 'solid-js';
import type { BrushWithPreview } from '~/lib/abr';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'brush-card': ComponentProps<'div'>;
    }
  }
}

export function BrushCard(props: {
  brush: BrushWithPreview;
  index: number;
  onClick?: () => void;
  onDownloadImage?: () => void;
  selected?: boolean;
}) {
  const formatValue = (value: number | undefined, unit: string = '') => {
    if (value === undefined) return '—';
    return `${Math.round(value * 100) / 100}${unit}`;
  };

  return (
    <brush-card
      class={`brush-card group bg-ps-bg cursor-pointer overflow-hidden rounded-lg border transition-all duration-200 ${
        props.selected ? 'border-ps-accent ring-ps-accent ring-1' : 'border-ps-border hover:border-ps-border-light'
      } `}
      onClick={props.onClick}
    >
      {/* Brush Image Preview */}
      <div class="checkered-bg relative aspect-square">
        <Show
          when={props.brush.imageDataUrl}
          fallback={
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="p-4 text-center">
                <div
                  class={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${props.brush.type === 'computed' ? 'bg-ps-bg-lighter' : 'bg-ps-bg-light'} `}
                >
                  <Show
                    when={props.brush.type === 'computed'}
                    fallback={
                      <svg class="text-ps-text-muted h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    }
                  >
                    {/* Computed brush icon */}
                    <svg class="text-ps-text-muted h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                  </Show>
                </div>
                <p class="text-ps-text-muted text-xs">{props.brush.type === 'computed' ? 'Computed' : 'No preview'}</p>
              </div>
            </div>
          }
        >
          <img
            src={props.brush.imageDataUrl}
            alt={props.brush.name}
            class="absolute inset-0 h-full w-full object-contain p-2"
            style={{ 'image-rendering': 'pixelated' }}
          />

          {/* Download overlay */}
          <Show when={props.onDownloadImage}>
            <div class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDownloadImage?.();
                }}
                class="bg-ps-accent hover:bg-ps-accent-hover flex items-center gap-2 rounded px-3 py-2 text-sm text-white"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                PNG
              </button>
            </div>
          </Show>
        </Show>

        {/* Brush index badge */}
        <div class="text-ps-text-muted absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs">
          #{props.index + 1}
        </div>

        {/* Type badge */}
        <div
          class={`absolute top-2 right-2 rounded px-2 py-0.5 text-xs ${
            props.brush.type === 'computed' ? 'bg-purple-900/70 text-purple-200' : 'bg-blue-900/70 text-blue-200'
          } `}
        >
          {props.brush.type}
        </div>
      </div>

      {/* Brush Info */}
      <div class="border-ps-border-dark border-t p-3">
        <h3 class="text-ps-text-bright mb-2 truncate font-medium" title={props.brush.name}>
          {props.brush.name}
        </h3>

        <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Diameter</span>
            <span class="text-ps-text">{formatValue(props.brush.diameter, 'px')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Spacing</span>
            <span class="text-ps-text">{formatValue(props.brush.spacing, '%')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Hardness</span>
            <span class="text-ps-text">{formatValue(props.brush.hardness, '%')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Roundness</span>
            <span class="text-ps-text">{formatValue(props.brush.roundness, '%')}</span>
          </div>
        </div>

        {/* Brush tip size */}
        <Show when={props.brush.brushTip}>
          <div class="border-ps-border-dark mt-2 flex justify-between border-t pt-2 text-xs">
            <span class="text-ps-text-muted">Tip Size</span>
            <span class="text-ps-text">
              {props.brush.brushTip!.width} × {props.brush.brushTip!.height}px
            </span>
          </div>
        </Show>
      </div>
    </brush-card>
  );
}
