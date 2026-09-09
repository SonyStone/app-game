import { createSignal, For, onSettled, Show } from 'solid-js';
import type { BrushResource } from '../composition/brushResources';
import type { PaintSession } from '../createPaintSession';

/** Compact tip-only library picker. Opening/closing the panel does not own imports or source pixels. */
export function BrushLibraryPanel(props: Pick<PaintSession, 'brushLibrary' | 'ready' | 'switchingRenderer'>) {
  const library = props.brushLibrary;
  const [search, setSearch] = createSignal('');
  let file!: HTMLInputElement;
  const disabled = () => !props.ready() || props.switchingRenderer() || library.busy();
  const items = () =>
    library.library()?.brushes.filter((brush) => brush.name.toLowerCase().includes(search().toLowerCase())) ?? [];
  return (
    <section class="paint-brush-library">
      <input
        ref={file}
        type="file"
        accept=".abr"
        aria-label="Import ABR file"
        hidden
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (picked) void library.importFile(picked);
        }}
      />
      <div class="paint-section-heading">
        <span>Brush tip</span>
        <button disabled={disabled()} onClick={() => file.click()}>
          Import ABR…
        </button>
      </div>
      <button
        class="paint-tip-choice"
        disabled={disabled()}
        aria-pressed={!library.selected() ? 'true' : 'false'}
        onClick={() => void library.choose(undefined)}
      >
        Soft round
      </button>
      <Show when={library.library()}>
        <p class="paint-panel-note paint-library-name" title={library.library()!.name}>
          {library.library()!.name}
        </p>
        <input
          class="paint-tip-search"
          type="search"
          aria-label="Find brush tip"
          placeholder="Find a tip…"
          value={search()}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
        <div class="paint-tip-list" aria-label="Imported brush tips">
          <For each={items()}>
            {(item) => (
              <button
                class="paint-tip-choice"
                disabled={disabled()}
                aria-pressed={library.selected() === item.id ? 'true' : 'false'}
                onClick={() => void library.choose(item.id)}
                title={item.name}
              >
                <TipPreview tip={library.library()!.tips.find((tip) => tip.id === item.tipId)!} />
                <span>{item.name}</span>
              </button>
            )}
          </For>
          <Show when={!items().length}>
            <p class="paint-panel-note">No matching tips.</p>
          </Show>
        </div>
        <p class="paint-panel-note">
          Tips only; Photoshop dynamics are not applied. The library lasts until this page reloads.
        </p>
        <Show when={library.library()!.skipped || library.library()!.notices}>
          <p class="paint-panel-note">
            {library.library()!.skipped} unsupported presets skipped. {library.library()!.notices} import notices.
          </p>
        </Show>
      </Show>
      <Show when={library.busy()}>
        <p role="status" class="paint-panel-note">
          Preparing brush…
        </p>
      </Show>
      <Show when={library.error()}>
        <p role="alert" class="paint-library-error">
          {library.error()}
        </p>
      </Show>
    </section>
  );
}

/** Bounded thumbnail sampling: never allocates a full-resolution canvas or an image URL per preset. */
function TipPreview(props: { tip: BrushResource }) {
  let canvas!: HTMLCanvasElement;
  onSettled(() => {
    const context = canvas.getContext('2d');
    if (!context) return;
    const { tip } = props;
    const scale = Math.min(44 / tip.width, 36 / tip.height);
    const width = Math.max(1, Math.round(tip.width * scale)),
      height = Math.max(1, Math.round(tip.height * scale));
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const sx = Math.min(tip.width - 1, Math.floor(((x + 0.5) * tip.width) / width));
        const sy = Math.min(tip.height - 1, Math.floor(((y + 0.5) * tip.height) / height));
        image.data.set([52, 75, 102, tip.pixels[sy * tip.width + sx]!], (y * width + x) * 4);
      }
    context.putImageData(image, Math.floor((48 - width) / 2), Math.floor((40 - height) / 2));
  });
  return <canvas ref={canvas} width={48} height={40} aria-hidden="true" />;
}
