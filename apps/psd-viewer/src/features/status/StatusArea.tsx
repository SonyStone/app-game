import { For, Show } from 'solid-js';
import type { LayerNote } from '../layers';
import type { PsdResultOf, RenderedPixels } from '../psd-worker';
import styles from './StatusArea.module.css';

/**
 * What the current render could not reproduce exactly: the renderer's refusal naming the unsupported feature, the
 * approximations an approximate render made, and the layer and document settings the exact render refuses, with what
 * the approximate render does instead. Layer names select their layer.
 */
export function StatusArea(props: {
  render: PsdResultOf<RenderedPixels> | undefined;
  layerNotes: LayerNote[];
  documentNotes: string[];
  onSelect: (index: number) => void;
  /** Identifies windowed rendering for provenance and unsupported-operation guidance. */
  windowed?: boolean;
  /** Persistent saved snapshots are never presented as a preview awaiting a current layer render. */
  sourceBacked?: boolean;
}) {
  const failure = () => (props.render && !props.render.ok ? props.render.error : undefined);
  const approximations = () => (props.render?.ok ? props.render.value.approximations : []);
  const windowed = () => props.windowed || (props.render?.ok && props.render.value.window !== undefined);
  const quality = () => (props.render?.ok ? props.render.value.quality : undefined);
  const saved = () => props.render?.ok && props.render.value.window?.source === 'savedComposite';
  const clean = () => !failure() && !approximations().length && !props.layerNotes.length && !props.documentNotes.length;
  return (
    <section
      class={styles.status}
      aria-label="Renderer status"
      data-windowed={windowed() ? 'true' : undefined}
      data-render-state={
        !props.render
          ? 'unrendered'
          : failure()
            ? 'failed'
            : saved()
              ? props.sourceBacked
                ? 'saved'
                : 'preview'
              : approximations().length
                ? 'approximate'
                : 'exact'
      }
    >
      <Show when={quality()}>
        {(progress) => (
          <p role="status" aria-label="Tile refinement">
            {props.sourceBacked
              ? 'Saved coverage'
              : progress().kind === 'pointPreview'
                ? 'Coarse preview'
                : progress().coarse
                  ? 'Coarse coverage · refining'
                  : 'Fresh coverage'}{' '}
            · {progress().completed}/{progress().required} tiles
            {' · '}
            {progress().kind === 'pointPreview'
              ? `point samples every ${progress().step} source pixels`
              : progress().step === 1
                ? 'source pixels'
                : `filtered LOD ${Math.log2(progress().step)}`}
          </p>
        )}
      </Show>
      <Show when={failure()}>
        {(error) => (
          <p class={styles.error}>
            <strong>{error().kind === 'unsupported' ? 'Not rendered — unsupported:' : 'Render failed:'}</strong>{' '}
            {error().message}
            <Show when={error().kind === 'unsupported'}>
              <span>
                {' '}
                {windowed()
                  ? 'Try other render settings, or Approximate unsupported settings.'
                  : "Photoshop's merged image is still shown in the Photoshop view; try other render settings, or Approximate unsupported settings."}
              </span>
            </Show>
          </p>
        )}
      </Show>
      <Show when={approximations().length}>
        <p class={styles.approximate}>
          <strong>
            {saved()
              ? props.sourceBacked
                ? 'Saved composite:'
                : 'Temporary saved preview:'
              : 'Not exactly as in Photoshop:'}
          </strong>{' '}
          {saved()
            ? props.sourceBacked
              ? 'may be stale; settings and visibility do not alter saved pixels.'
              : 'may be stale; replacing with a fresh layer render.'
            : 'This render approximates what is listed below.'}
          <Show when={!windowed()}> Photoshop's own image is in the Photoshop view.</Show>
        </p>
        <ul class={styles.approximate} aria-label="Approximations">
          <For each={approximations()}>
            {(text) => (
              <li>
                <strong>Approximated:</strong> {text}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.layerNotes.length || props.documentNotes.length}>
        <ul class={styles.notes} aria-label="Refused or approximated">
          <For each={props.documentNotes}>{(note) => <li>{note}</li>}</For>
          <For each={props.layerNotes}>
            {(note) => (
              <li>
                <button type="button" onClick={() => props.onSelect(note.index)}>
                  {note.name || '(unnamed)'}
                </button>
                : {note.note}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={clean() && props.render?.ok}>
        <p class={styles.clean}>Exact path: every layer and setting of this document is one the renderer reproduces.</p>
      </Show>
    </section>
  );
}
