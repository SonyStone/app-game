import { SquareGrid, TabsFooter, TabsScrollBody, TabsViewport } from '@app-game/solid-tabs';
import { createSignal, For, Show } from 'solid-js';
import { ExplorationBoard } from './ExplorationBoard';
import { Dial } from './Dial';
import type { DemoFolder } from './folders';
import { Icon } from './Icon';
import ArrowDownLeftIcon from './icons/arrow-down-left.svg';
import GoalsShape from './icons/goals-folder.svg';
import RecordIcon from './icons/record.svg';
import styles from './FolderContent.module.css';

/**
 * Each mounted panel retains controls, additions, query, and scroll position when closed.
 * `scrollable` enables keyboard focus and mouse/pen dragging for the fullscreen scrollport;
 * touch and wheel scrolling stay native. The framed preview leaves gestures to the deck.
 */
export function FolderContent(props: {
  folder: DemoFolder;
  onNext: () => void;
  scrollable?: boolean;
  /** Shows the preview link on the active fullscreen card; modified clicks retain native navigation. */
  onPreview?: ((event: MouseEvent) => void) | undefined;
}) {
  const [additions, setAdditions] = createSignal(0);
  const [palette, setPalette] = createSignal(0);
  const [searching, setSearching] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const count = () => props.folder.count + additions();
  const colors = () =>
    palette() === 0 && props.folder.dark
      ? (['#ff1e1e', '#ffdb36', '#70d652'] as const)
      : (palettes[palette() % palettes.length] ?? palettes[0]);
  const files = () => [
    'First explorations',
    'Collected references',
    'Working ideas',
    'Final composition',
    ...Array.from({ length: additions() }, (_, i) => `Untitled idea ${i + 1}`)
  ];
  const matches = () => files().filter((name) => name.toLowerCase().includes(query().toLowerCase()));

  return (
    <div
      data-folder-theme={props.folder.dark ? 'dark' : 'light'}
      class={`${styles.folderContent} ${props.folder.layout === 'orbits' ? styles.layoutOrbits : ''} ${props.folder.dark ? styles.layoutDark : ''}`}
    >
      <TabsViewport
        class={styles.creativeViewport!}
        scrollable={props.scrollable ?? false}
        label={`${props.folder.name} content`}
      >
        <TabsScrollBody>
          <SquareGrid class={styles.creativeBoard!} columns={15} rows={13}>
            <div class={styles.boardGrid} aria-hidden="true" />
            <Show when={!props.folder.dark && props.folder.layout === 'studio'}>
              <For each={['1 / 6', '1 / 10', '5 / 2', '5 / 6 / 7 / 7', '5 / 10 / 7 / 11', '5 / 15', '8 / 2']}>
                {(area) => <span class={styles.boardTone} style={{ 'grid-area': area }} aria-hidden="true" />}
              </For>
            </Show>
            <div class={styles.dialGroup}>
              <For each={props.folder.layout === 'orbits' ? [0, 1, 2, 3] : [0, 1, 2]}>
                {(index) => (
                  <div class={styles.dialCell} data-index={index}>
                    <span
                      class={styles.colorDot}
                      style={{
                        background:
                          props.folder.layout === 'orbits' && palette() === 0
                            ? ['#ff1e1e', '#fafbf9', '#78dd58', '#df924a'][index]
                            : colors()[index % 3]
                      }}
                    />
                    <Dial label={`${props.folder.name} dial ${index + 1}`} angle={[-90, -22, 54, 21][index] ?? 0} />
                  </div>
                )}
              </For>
            </div>
            <span class={`${styles.miniRecord} ${styles.recordOne}`} aria-hidden="true">
              <RecordIcon />
            </span>
            <span class={`${styles.miniRecord} ${styles.recordTwo}`} aria-hidden="true">
              <RecordIcon />
            </span>
            <Show when={props.folder.dark}>
              <span class={`${styles.miniRecord} ${styles.recordThree}`} aria-hidden="true">
                <RecordIcon />
              </span>
            </Show>
            <div class={styles.boardNavigation}>
              <span class={styles.numberToken}>{props.folder.dark ? '1' : '2'}</span>
              <button class={styles.roundControl} aria-label="Open next folder" onClick={props.onNext}>
                <Icon name={props.folder.dark ? 'arrowDownLeft' : 'arrowUpRight'} />
              </button>
            </div>
            <h1 class={styles.boardTitle}>{props.folder.title}</h1>
            <div class={styles.boardCaption}>
              <span
                class={styles.colorDot}
                style={{
                  background: props.folder.dark
                    ? colors()[1]
                    : props.folder.layout === 'orbits'
                      ? '#edb0e6'
                      : colors()[0]
                }}
              />
              {props.folder.label}
            </div>
            <span class={styles.squareToken}>
              <span>{props.folder.layout === 'orbits' || props.folder.dark ? '3' : '5'}</span>
            </span>
            <div class={styles.createCaption}>
              <span>
                Create
                <br />
                Button Place
              </span>
            </div>
            <button class={styles.paletteControl} onClick={() => setPalette((value) => value + 1)}>
              <span class={styles.roundControl}>
                <Icon name="arrowRight" />
              </span>
              <span>
                Create
                <br />
                Colors Button
              </span>
            </button>
            <button
              class={`${styles.nextControl} ${styles.roundControl}`}
              aria-label="Open next folder"
              onClick={props.onNext}
            >
              <Icon name="arrowDown" />
            </button>
            <Show when={props.folder.layout === 'orbits'}>
              <button class={styles.goalsFolder} onClick={() => setAdditions((value) => value + 1)}>
                <GoalsShape aria-hidden="true" />
                <span class={styles.goalsLabel}>Goals</span>
                <span class={styles.goalsCount}>{additions() ? `${additions()} new ideas` : 'Add an idea'}</span>
              </button>
              <span class={`${styles.orbitNumber} ${styles.orbitNumberOne}`}>8</span>
              <span class={`${styles.orbitNumber} ${styles.orbitNumberTwo}`}>6</span>
              <span class={`${styles.orbitNumber} ${styles.orbitNumberThree}`}>
                <span>7</span>
              </span>
            </Show>
            <div class={styles.boardExtension} aria-hidden="true">
              <div class={`${styles.collectionTile} ${styles.collectionTileFirst}`}>
                <GoalsShape />
                <span class={styles.collectionLabel}>
                  Collected
                  <br />
                  references
                </span>
                <span class={styles.collectionIndex}>01</span>
              </div>
              <span class={styles.collectionHeading}>Small collections</span>
              <div class={styles.collectionSwatches}>
                <For each={colors()}>{(color) => <span style={{ background: color }} />}</For>
              </div>
              <span class={styles.collectionNote}>Keep a little curiosity.</span>
              <span class={`${styles.miniRecord} ${styles.collectionRecord}`}>
                <RecordIcon />
              </span>
              <span class={styles.collectionArrow}>
                <Icon name="arrowUpRight" />
              </span>
              <div class={`${styles.collectionTile} ${styles.collectionTileSecond}`}>
                <GoalsShape />
                <span class={styles.collectionLabel}>
                  Working
                  <br />
                  ideas
                </span>
                <span class={styles.collectionIndex}>02</span>
              </div>
            </div>
            <Show when={props.scrollable}>
              <ExplorationBoard colors={colors()} onPalette={() => setPalette((value) => value + 1)} />
            </Show>
          </SquareGrid>
        </TabsScrollBody>
      </TabsViewport>
      <TabsFooter class={styles.folderFooter!}>
        <div class={styles.fileCount}>
          <span aria-live="polite">{count()}</span>
          <span>Files</span>
        </div>
        <Show when={props.onPreview}>
          <a
            class={`${styles.screenRouteControl} ${styles.previewReturn}`}
            href="/"
            aria-label="Back to preview"
            onClick={(event) => props.onPreview?.(event)}
          >
            <span class={styles.previewReturnIcon}>
              <ArrowDownLeftIcon class={styles.icon} aria-hidden="true" />
            </span>
            <span>Preview</span>
          </a>
        </Show>
        <div class={styles.folderDate}>
          {props.folder.id === 'music' ? '01 Jan — 29' : props.folder.date}
          <br />
          {props.folder.year || 'Des'}
        </div>
        <button
          class={styles.addControl}
          aria-label={`Add an idea to ${props.folder.name}`}
          onClick={() => setAdditions((value) => value + 1)}
        >
          <Icon name="plus" />
        </button>
        <button
          class={styles.searchControl}
          aria-label={`Search ${props.folder.name}`}
          aria-expanded={searching() ? 'true' : 'false'}
          onClick={() => setSearching((value) => !value)}
        >
          <Icon name={searching() ? 'x' : 'search'} />
        </button>
      </TabsFooter>
      <Show when={searching()}>
        <div
          class={styles.searchPanel}
          data-tabs-no-drag=""
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setSearching(false);
              document.querySelector<HTMLButtonElement>(`#panel-${props.folder.id} .search-control`)?.focus();
            }
          }}
        >
          <label for={`search-${props.folder.id}`}>Find something in {props.folder.name}</label>
          <input
            id={`search-${props.folder.id}`}
            type="search"
            placeholder="Search your ideas…"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            ref={(element) => queueMicrotask(() => element.focus())}
          />
          <ul>
            <For each={matches()} fallback={<li>No matching ideas.</li>}>
              {(name) => (
                <li>
                  {name}
                  <span>Idea</span>
                </li>
              )}
            </For>
          </ul>
          <p>
            {matches().length} sample ideas · {count()} files in this folder
          </p>
        </div>
      </Show>
    </div>
  );
}

const palettes = [
  ['#ff1e1e', '#ffdb36', '#7fa477'],
  ['#bb94de', '#639bcc', '#e59656'],
  ['#94d979', '#f0a8d8', '#f9faf6']
] as const;
