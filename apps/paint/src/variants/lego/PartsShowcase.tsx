import { createMemo, createSignal, For } from 'solid-js';
import { PreviewAttachment } from '../../features/brush-library/previewAttachment';
import { cellGap, type Span } from './board';
import { attachCataloguePreview, createCatalogueFixture } from './createCatalogueFixture';
import { createGrid, referenceCell, useGrid } from './grid';
import { LegoServicesContext } from './LegoServices';
import lego from './LegoStudio.module.css';
import { lookFits } from './looks';
import { PartFrame } from './PartFrame';
import { partDefinitions } from './parts';
import type { PartMode } from './parts/definition';
import styles from './PartsShowcase.module.css';

/** Registry-driven specimens at representative size steps, or a supported grid size selected in the toolbar. */
export function PartsShowcase() {
  const grid = useGrid();
  const fixture = createCatalogueFixture();
  const [columns, setColumns] = createSignal(0);
  const [rows, setRows] = createSignal(0);
  const specimens = createMemo(() =>
    catalogueSpecimens(
      fixture.presets[0]!.id,
      columns() && rows() ? { columns: columns(), rows: rows() } : undefined,
      true,
      grid
    )
  );

  return (
    <LegoServicesContext value={fixture.services}>
      <PreviewAttachment value={attachCataloguePreview}>
        <main
          class={[lego.editor, styles.showcase]}
          style={{
            '--lego-cell': `${grid.cell()}px`,
            '--lego-hit-size': `${referenceCell}px`,
            '--lego-gap': `${cellGap}px`
          }}
          data-parts-showcase=""
        >
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
                <option value="0">Size steps</option>
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
                <option value="0">Size steps</option>
                <For each={sizes}>{(size) => <option value={size}>{size}</option>}</For>
              </select>
            </label>
            <p>
              Size steps show compact, wide, square and natural layouts. Choose both dimensions to compare all looks
              that fit. Edit and preview tiles are inert.
            </p>
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
                            width: `${grid.length(specimen.span.columns)}px`,
                            height: `${grid.length(specimen.span.rows)}px`
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
                    <div class={styles.tile} style={{ width: `${grid.length(2)}px`, height: `${grid.length(2)}px` }}>
                      <PartFrame kind="unavailable:example" span={{ columns: 2, rows: 2 }} mode={mode} immediate />
                    </div>
                  </figure>
                  <figure data-specimen={`${mode}:broken`}>
                    <figcaption>Broken part</figcaption>
                    <div class={styles.tile} style={{ width: `${grid.length(2)}px`, height: `${grid.length(2)}px` }}>
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

/**
 * All kind/look pairs, optionally at representative size steps on `grid`. Uses the board look chooser's fit
 * predicate. The natural sizes are those of the default cell.
 */
export function catalogueSpecimens(
  presetId: string,
  span?: Span,
  sizeSteps = false,
  grid: Pick<ReturnType<typeof createGrid>, 'minimumSpan' | 'room'> = createGrid(() => undefined)
) {
  return partDefinitions.flatMap((definition) =>
    (definition.looks?.looks ?? [undefined]).flatMap((look) => {
      const minimum = look ? grid.minimumSpan(look.min) : { columns: 1, rows: 1 };
      const natural =
        definition.kind === 'color:wheel'
          ? { columns: 7, rows: 7 }
          : definition.family === 'value'
            ? { columns: 6, rows: 1 }
            : definition.family === 'action'
              ? { columns: 4, rows: 2 }
              : { columns: 6, rows: 3 };
      const candidates = span
        ? [span]
        : sizeSteps
          ? [minimum, { columns: 2, rows: 1 }, { columns: 2, rows: 2 }, natural]
          : [look ? minimum : { columns: 2, rows: 2 }];
      const seen = new Set<string>();
      return candidates
        .filter((size) => {
          const key = `${size.columns}x${size.rows}`;
          if (seen.has(key) || (look && !lookFits(look, grid.room(size)))) {
            return false;
          }

          seen.add(key);
          return true;
        })
        .map((size) => ({
          id: `${definition.kind}:${look?.id ?? 'default'}:${size.columns}x${size.rows}`,
          kind: definition.family === 'preset' ? `preset:${presetId}` : definition.kind,
          label: `${definition.label}${look ? ` / ${look.label}` : ''}`,
          look: look?.id,
          span: size
        }));
    })
  );
}

function BrokenSpecimen(): never {
  throw new Error('Deliberately broken gallery specimen');
}

const modes: readonly PartMode[] = ['live', 'edit', 'preview'];
const showcaseMaxSpan = 10;
const sizes = Array.from({ length: showcaseMaxSpan }, (_, index) => index + 1);
