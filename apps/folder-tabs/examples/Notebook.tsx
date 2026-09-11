import { CardStack, CardStackFooter, CardStackScrollBody, CardStackViewport, SquareGrid } from '@app-game/card-stack';
import { createMemo, createSignal, For, Show } from 'solid-js';
import styles from './plain.module.css';

/** A second consumer with no folder skin, demo data, SVG loader or application controller. */
export function Notebook(props: { folderHref?: string; debug?: boolean } = {}) {
  const [cardCount, setCardCount] = createSignal(4);
  const [expandedLimit, setExpandedLimit] = createSignal(8);
  const [expandedSpacing, setExpandedSpacing] = createSignal(100);
  const notebooks = createMemo(() => ({ items: createNotebooks(cardCount()), limit: expandedLimit() }));
  return (
    <div class={styles.page} data-motion-workbench={props.debug ? '' : undefined}>
      <main>
        <header>
          <a href={props.folderHref ?? '/'}>← Folder example</a>
          <span>Card Stack / Notebook</span>
        </header>
        <p class={styles.help}>
          Drag sideways to scroll the row. Pull down to spread the tabs, then drag sideways to reorder. Pull up to
          gather them again.
        </p>
        <div class={styles.controls}>
          <label class={styles.cardCount}>
            Cards
            <select value={cardCount()} onChange={(event) => setCardCount(Number(event.currentTarget.value))}>
              <For each={[1, 2, 4, 7, 12, 20, 40, 80, 100]}>{(count) => <option value={count}>{count}</option>}</For>
            </select>
          </label>
          <label class={styles.cardCount}>
            Expanded cards
            <select value={expandedLimit()} onChange={(event) => setExpandedLimit(Number(event.currentTarget.value))}>
              <For each={[4, 6, 8, 12, 16, Infinity]}>
                {(count) => <option value={count}>{count === Infinity ? 'All' : count}</option>}
              </For>
            </select>
          </label>
          <label class={styles.spacing}>
            Expanded spacing
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={expandedSpacing()}
              aria-valuetext={`${expandedSpacing()}%`}
              onInput={(event) => setExpandedSpacing(event.currentTarget.valueAsNumber)}
            />
            <output>{expandedSpacing()}%</output>
          </label>
          <small>Card counts reset cards and the recording. Spacing updates live. Gather the row to reach all cards.</small>
        </div>
        <div class={props.debug ? styles.workbench : undefined}>
          <Show when={notebooks()} keyed>
            {(example) => (
              <CardStack
                debug={props.debug ?? false}
                items={example.items}
                maxExpandedCards={example.limit}
                expandedSpacing={expandedSpacing() / 100}
                label="Notebooks"
                class={styles.notebook!}
                initiallyCollapsed
                geometryUnit={8}
                tabWidth={24}
                tabHeight={5}
                tabOverlap={0}
                getLabel={(item) => item.title}
                renderTab={(item) => <span>{item.title}</span>}
                cardStyle={(item) => ({ '--tabs-surface': item.color })}
              >
                {(item, active, next) => <Note item={item} active={active} next={next} />}
              </CardStack>
            )}
          </Show>
        </div>
      </main>
    </div>
  );
}

/** Each mounted notebook retains its editable text and count when another tab opens. */
function Note(props: { item: ReturnType<typeof createNotebooks>[number]; active: () => boolean; next: () => void }) {
  const [count, setCount] = createSignal(0);
  return (
    <>
      <CardStackViewport label={`${props.item.title} pages`}>
        <CardStackScrollBody>
          <SquareGrid class={styles.noteGrid!} columns={6} rows={12}>
            <section class={styles.noteIntro}>
              <small>YOUR NOTEBOOK</small>
              <h1>{props.item.title}</h1>
              <p>{props.item.subtitle}</p>
            </section>
            <textarea aria-label={`${props.item.title} draft`} placeholder="Write something here…" />
            <For each={['Collect', 'Connect', 'Make', 'Reflect']}>
              {(label, index) => (
                <article class={styles.noteTile}>
                  <span>0{index() + 1}</span>
                  <h2>{label}</h2>
                </article>
              )}
            </For>
            <p class={styles.noteEnd}>The last page stays reachable behind the footer.</p>
          </SquareGrid>
        </CardStackScrollBody>
      </CardStackViewport>
      <CardStackFooter class={styles.noteFooter!}>
        <button onClick={() => setCount((value) => value + 1)}>Saved thoughts · {count()}</button>
        <button onClick={props.next} disabled={!props.active()}>
          Next notebook ↓
        </button>
      </CardStackFooter>
    </>
  );
}

/** Repeat the sample content with unique identities and labels for large-stack debugging. */
function createNotebooks(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const template = notebookTemplates[index % notebookTemplates.length]!;
    const copy = Math.floor(index / notebookTemplates.length) + 1;
    return {
      ...template,
      id: copy === 1 ? template.id : `${template.id}-${copy}`,
      title: copy === 1 ? template.title : `${template.title} ${copy}`
    };
  });
}

const notebookTemplates = [
  { id: 'ideas', title: 'Ideas', color: '#dce9e2', subtitle: 'Leave yourself a little room to think.' },
  { id: 'reading', title: 'Reading', color: '#f0e5ce', subtitle: 'Keep the lines you want to return to.' },
  { id: 'projects', title: 'Projects', color: '#dce4f0', subtitle: 'A place for work in progress.' },
  { id: 'notes', title: 'Notes', color: '#ebe0ee', subtitle: 'Start with a thought.' }
];
