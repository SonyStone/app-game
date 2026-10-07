import { createEffect, createSignal, For } from 'solid-js';

import { defaultPreviewSizes } from '../../editor/defaults';
import { decorativeIconProps } from '../../editor/svg-icon';
import DeleteIcon from '../ui/icons/Delete.svg';
import PlusIcon from '../ui/icons/Plus.svg';

/**
 * GodSVG's icon previews: the exported SVG rasterized at each pixel size, shown pixel for pixel (scaled up without
 * smoothing on high-density screens) so small-size artifacts are visible. Sizes can be added, removed, sorted, and
 * reset to the defaults.
 */
export function IconPreviews(props: {
  readonly svgText: string;
  readonly sizes: readonly number[];
  readonly setSizes: (sizes: readonly number[]) => void;
}) {
  const [newSize, setNewSize] = createSignal('');
  const image = createDecodedImage(() => props.svgText);
  const sorted = () => props.sizes.every((size, index) => index === 0 || (props.sizes[index - 1] ?? 0) <= size);
  const isDefault = () => props.sizes.join(',') === defaultPreviewSizes.join(',');

  function addSize(): void {
    const size = Math.round(Number(newSize()));

    if (Number.isFinite(size) && size >= 1 && size <= 512) {
      props.setSizes([...props.sizes, size]);
      setNewSize('');
    }
  }

  return (
    <div class="grid gap-1.5 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5" data-testid="icon-previews">
      <div class="flex flex-wrap items-end gap-2.5">
        <For each={props.sizes}>
          {(size, index) => (
            <div class="group relative grid justify-items-center gap-0.5" data-testid={`icon-preview-${size}`}>
              <IconPreviewCanvas image={image()} size={size} />
              <span class="text-[10px] text-[var(--muted)]">{size}</span>
              <button
                type="button"
                class="absolute -top-1.5 -right-1.5 hidden h-4 w-4 cursor-pointer place-items-center rounded-full border border-[var(--soft-border)] bg-[var(--panel)] group-hover:grid"
                aria-label={`Remove ${size} px preview`}
                data-testid={`icon-preview-remove-${size}`}
                onClick={() => props.setSizes(props.sizes.filter((_, itemIndex) => itemIndex !== index()))}
              >
                <DeleteIcon {...decorativeIconProps} />
              </button>
            </div>
          )}
        </For>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
        <input
          class="h-5.5 w-14 rounded border border-[var(--soft-border)] bg-[#080b12] px-1 in-[.theme-light]:bg-[#f8fbff]"
          inputmode="numeric"
          placeholder="Size"
          aria-label="New preview size"
          data-testid="icon-preview-new-size"
          value={newSize()}
          onInput={(event) => setNewSize(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              addSize();
            }
          }}
        />
        <button type="button" class={smallButton} data-testid="icon-preview-add" onClick={addSize}>
          <PlusIcon {...decorativeIconProps} /> Add
        </button>
        <button
          type="button"
          class={smallButton}
          disabled={sorted()}
          data-testid="icon-preview-sort"
          onClick={() => props.setSizes([...props.sizes].sort((a, b) => a - b))}
        >
          Sort
        </button>
        <button type="button" class={smallButton} disabled={isDefault()} data-testid="icon-preview-reset" onClick={() => props.setSizes(defaultPreviewSizes)}>
          Reset
        </button>
      </div>
    </div>
  );
}

const smallButton =
  'inline-flex h-5.5 cursor-pointer items-center gap-1 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1.5 hover:border-[var(--accent)] disabled:cursor-default disabled:opacity-50';

/** Draws the image into a canvas of exactly `size` × `size` pixels. */
function IconPreviewCanvas(props: { readonly image: HTMLImageElement | undefined; readonly size: number }) {
  let canvas: HTMLCanvasElement | undefined;

  createEffect(
    () => ({ image: props.image, size: props.size }),
    ({ image, size }) => {
      const context = canvas?.getContext('2d');

      if (!canvas || !context) {
        return;
      }

      canvas.width = size;
      canvas.height = size;
      context.clearRect(0, 0, size, size);

      if (image) {
        const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      }
    }
  );

  return (
    <canvas
      ref={(element) => (canvas = element)}
      class="[background:repeating-conic-gradient(#8b93a7_0_25%,#303747_0_50%)_0_0/8px_8px] [image-rendering:pixelated]"
      style={{ width: `${props.size / devicePixelRatioOrOne()}px`, height: `${props.size / devicePixelRatioOrOne()}px` }}
    />
  );
}

/** One CSS pixel per device pixel when the screen allows it, so the canvas shows its real pixels. */
function devicePixelRatioOrOne(): number {
  return Math.max(1, Math.floor(globalThis.devicePixelRatio || 1));
}

/** Decodes the SVG text into an image; the object URL is revoked when the text changes or the owner is disposed. */
function createDecodedImage(text: () => string) {
  const [image, setImage] = createSignal<HTMLImageElement>();

  createEffect(text, (value) => {
    const url = URL.createObjectURL(new Blob([value], { type: 'image/svg+xml' }));
    const next = new Image();
    let cancelled = false;
    next.src = url;
    void next
      .decode()
      .then(() => {
        if (!cancelled) {
          setImage(next);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  });

  return image;
}
