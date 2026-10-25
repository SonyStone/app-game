import { createMemo, createSignal, For } from 'solid-js';
import { PreviewAttachment } from '../../features/brush-library/previewAttachment';
import { cellGap, maxSpan, pitch, type Span } from './board';
import { attachCataloguePreview, createCatalogueFixture } from './createCatalogueFixture';
import { LegoServicesContext } from './LegoServices';
import lego from './LegoStudio.module.css';
import { lookFits } from './looks';
import { PartFrame } from './PartFrame';
import { partDefinitions } from './parts';
import type { PartMode } from './parts/definition';
import styles from './PartsShowcase.module.css';

/** Registry-driven specimens at their minimum size, or any supported grid size selected in the toolbar. */
export function PartsShowcase() {
  const fixture = createCatalogueFixture();
  const [columns, setColumns] = createSignal(0);
  const [rows, setRows] = createSignal(0);
  const specimens = createMemo(() =>
    catalogueSpecimens(fixture.presets[0]!.id, columns() && rows() ? { columns: columns(), rows: rows() } : undefined)
  );

  return (
    <LegoServicesContext value={fixture.services}>
      <PreviewAttachment value={attachCataloguePreview}>
        <main class={[lego.editor, styles.showcase]} data-parts-showcase="">
          <header>
            <h1>LEGO parts</h1>
            <p>Every registered kind and look, with shared in-memory colors, brushes and layers.</p>
            <label>
              Columns{' '}
              <select
                aria-label="Columns"
                value={columns()}
                onChange={(event) => {
                  setColumns(Number(event.currentTarget.value));
                }}
              >
                <option value="0">Minimum</option>
                <For each={sizes}>{(size) => <option value={size}>{size}</option>}</For>
              </select>
            </label>
            <label>
              Rows{' '}
              <select
                aria-label="Rows"
                value={rows()}
                onChange={(event) => {
                  setRows(Number(event.currentTarget.value));
                }}
              >
                <option value="0">Minimum</option>
                <For each={sizes}>{(size) => <option value={size}>{size}</option>}</For>
              </select>
            </label>
            <p>Choose both dimensions to compare all looks that fit. Edit and preview tiles are inert.</p>
          </header>
          <For each={modes}>
            {(mode) => (
              <section aria-label={`${mode} specimens`}>
                <h2>{mode}</h2>
                <div class={styles.specimens}>
                  <For each={specimens()}>
                    {(specimen) => (
                      <figure data-specimen={`${mode}:${specimen.id}`}>
                        <figcaption>
                          {specimen.label} · {specimen.span.columns}×{specimen.span.rows}
                        </figcaption>
                        <div
                          class={styles.tile}
                          style={{
                            width: `${specimen.span.columns * pitch - cellGap}px`,
                            height: `${specimen.span.rows * pitch - cellGap}px`
                          }}
                        >
                          <PartFrame
                            kind={specimen.kind}
                            look={specimen.look}
                            span={specimen.span}
                            mode={mode}
                            immediate
                          />
                        </div>
                      </figure>
                    )}
                  </For>
                  <figure data-specimen={`${mode}:missing`}>
                    <figcaption>Missing part</figcaption>
                    <div class={styles.tile} style={{ width: '92px', height: '92px' }}>
                      <PartFrame kind="unavailable:example" span={{ columns: 2, rows: 2 }} mode={mode} immediate />
                    </div>
                  </figure>
                  <figure data-specimen={`${mode}:broken`}>
                    <figcaption>Broken part</figcaption>
                    <div class={styles.tile} style={{ width: '92px', height: '92px' }}>
                      <PartFrame kind="broken:example" span={{ columns: 2, rows: 2 }} mode={mode} immediate>
                        <BrokenSpecimen />
                      </PartFrame>
                    </div>
                  </figure>
                </div>
              </section>
            )}
          </For>
        </main>
      </PreviewAttachment>
    </LegoServicesContext>
  );
}

/** All kind/look pairs. Size choices use the same fit predicate as the board's look chooser. */
export function catalogueSpecimens(presetId: string, span?: Span) {
  return partDefinitions.flatMap((definition) =>
    (definition.looks?.looks ?? [undefined]).flatMap((look) => {
      if (span && look && !lookFits(look, span)) {
        return [];
      }

      return [
        {
          id: `${definition.kind}:${look?.id ?? 'default'}`,
          kind: definition.family === 'preset' ? `preset:${presetId}` : definition.kind,
          label: `${definition.label}${look ? ` / ${look.label}` : ''}`,
          look: look?.id,
          span: span ?? look?.min ?? { columns: 2, rows: 2 }
        }
      ];
    })
  );
}

function BrokenSpecimen(): never {
  throw new Error('Deliberately broken gallery specimen');
}

const modes: readonly PartMode[] = ['live', 'edit', 'preview'];
const sizes = Array.from({ length: maxSpan }, (_, index) => index + 1);
