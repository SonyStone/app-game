import { SquareGrid, Tabs, TabsFooter, TabsScrollBody, TabsViewport } from '@app-game/solid-tabs';
import { render } from '@solidjs/web';
import { createSignal, For } from 'solid-js';
import styles from './plain.module.css';

const notebooks = [
  { id: 'ideas', title: 'Ideas', color: '#dce9e2', subtitle: 'Leave yourself a little room to think.' },
  { id: 'reading', title: 'Reading', color: '#f0e5ce', subtitle: 'Keep the lines you want to return to.' },
  { id: 'projects', title: 'Projects', color: '#dce4f0', subtitle: 'A place for work in progress.' },
  { id: 'notes', title: 'Notes', color: '#ebe0ee', subtitle: 'Start with a thought.' }
];

/** A second consumer with no folder skin, demo data, SVG loader or application controller. */
function Notebook() {
  return (
    <main>
      <header>
        <a href="/">← Folder example</a>
        <span>Solid Tabs / Notebook</span>
      </header>
      <p class={styles.help}>
        Drag sideways to scroll the row. Pull down to spread the tabs, then drag sideways to reorder. Pull up to gather
        them again.
      </p>
      <Tabs
        items={notebooks}
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
      </Tabs>
    </main>
  );
}

/** Each mounted notebook retains its editable text and count when another tab opens. */
function Note(props: { item: (typeof notebooks)[number]; active: () => boolean; next: () => void }) {
  const [count, setCount] = createSignal(0);
  return (
    <>
      <TabsViewport label={`${props.item.title} pages`}>
        <TabsScrollBody>
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
        </TabsScrollBody>
      </TabsViewport>
      <TabsFooter class={styles.noteFooter!}>
        <button onClick={() => setCount((value) => value + 1)}>Saved thoughts · {count()}</button>
        <button onClick={props.next} disabled={!props.active()}>
          Next notebook ↓
        </button>
      </TabsFooter>
    </>
  );
}

render(() => <Notebook />, document.getElementById('root')!);

document.body.classList.add(styles.page!);
