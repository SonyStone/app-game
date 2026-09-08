import { createSignal, For, Show } from 'solid-js';
import type { DemoFolder } from './folders';
import { Icon } from './Icon';
import GoalsShape from './icons/goals-folder.svg';
import RecordIcon from './icons/record.svg';

/** Each mounted panel retains its controls, local additions, and search query when closed. */
export function FolderContent(props: { folder: DemoFolder; onNext: () => void }) {
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
    <div class={`folder-content layout-${props.folder.layout} ${props.folder.dark ? 'layout-dark' : ''}`}>
      <div class="creative-board">
        <div class="board-grid" aria-hidden="true" />
        <Show when={!props.folder.dark && props.folder.layout === 'studio'}>
          <For each={['1 / 6', '1 / 10', '5 / 2', '5 / 6 / 7 / 7', '5 / 10 / 7 / 11', '5 / 15', '8 / 2']}>
            {(area) => <span class="board-tone" style={{ 'grid-area': area }} aria-hidden="true" />}
          </For>
        </Show>
        <div class="dial-group">
          <For each={props.folder.layout === 'orbits' ? [0, 1, 2, 3] : [0, 1, 2]}>
            {(index) => (
              <div class={`dial-cell dial-cell-${index}`}>
                <span
                  class="color-dot"
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
        <span class="mini-record record-one" aria-hidden="true">
          <RecordIcon />
        </span>
        <span class="mini-record record-two" aria-hidden="true">
          <RecordIcon />
        </span>
        <Show when={props.folder.dark}>
          <span class="mini-record record-three" aria-hidden="true">
            <RecordIcon />
          </span>
        </Show>
        <div class="board-navigation">
          <span class="number-token">{props.folder.dark ? '1' : '2'}</span>
          <button class="round-control" aria-label="Open next folder" onClick={props.onNext}>
            <Icon name={props.folder.dark ? 'arrowDownLeft' : 'arrowUpRight'} />
          </button>
        </div>
        <h1 class="board-title">{props.folder.title}</h1>
        <div class="board-caption">
          <span
            class="color-dot"
            style={{
              background: props.folder.dark ? colors()[1] : props.folder.layout === 'orbits' ? '#edb0e6' : colors()[0]
            }}
          />
          {props.folder.label}
        </div>
        <span class="square-token">
          <span>{props.folder.layout === 'orbits' || props.folder.dark ? '3' : '5'}</span>
        </span>
        <div class="create-caption">
          <span>
            Create
            <br />
            Button Place
          </span>
        </div>
        <button class="palette-control" onClick={() => setPalette((value) => value + 1)}>
          <span class="round-control">
            <Icon name="arrowRight" />
          </span>
          <span>
            Create
            <br />
            Colors Button
          </span>
        </button>
        <button class="next-control round-control" aria-label="Open next folder" onClick={props.onNext}>
          <Icon name="arrowDown" />
        </button>
        <Show when={props.folder.layout === 'orbits'}>
          <button class="goals-folder" onClick={() => setAdditions((value) => value + 1)}>
            <GoalsShape aria-hidden="true" />
            <span class="goals-label">Goals</span>
            <span class="goals-count">{additions() ? `${additions()} new ideas` : 'Add an idea'}</span>
          </button>
          <span class="orbit-number orbit-number-one">8</span>
          <span class="orbit-number orbit-number-two">6</span>
          <span class="orbit-number orbit-number-three">
            <span>7</span>
          </span>
        </Show>
        <div class="board-extension" aria-hidden="true">
          <div class="collection-tile collection-tile-first">
            <GoalsShape />
            <span class="collection-label">
              Collected
              <br />
              references
            </span>
            <span class="collection-index">01</span>
          </div>
          <span class="collection-heading">Small collections</span>
          <div class="collection-swatches">
            <For each={colors()}>{(color) => <span style={{ background: color }} />}</For>
          </div>
          <span class="collection-note">Keep a little curiosity.</span>
          <span class="mini-record collection-record">
            <RecordIcon />
          </span>
          <span class="collection-arrow">
            <Icon name="arrowUpRight" />
          </span>
          <div class="collection-tile collection-tile-second">
            <GoalsShape />
            <span class="collection-label">
              Working
              <br />
              ideas
            </span>
            <span class="collection-index">02</span>
          </div>
        </div>
      </div>
      <footer class="folder-footer">
        <div class="file-count">
          <span aria-live="polite">{count()}</span>
          <span>Files</span>
        </div>
        <div class="folder-date">
          {props.folder.id === 'music' ? '01 Jan — 29' : props.folder.date}
          <br />
          {props.folder.year || 'Des'}
        </div>
        <button
          class="add-control"
          aria-label={`Add an idea to ${props.folder.name}`}
          onClick={() => setAdditions((value) => value + 1)}
        >
          <Icon name="plus" />
        </button>
        <button
          class="search-control"
          aria-label={`Search ${props.folder.name}`}
          aria-expanded={searching() ? 'true' : 'false'}
          onClick={() => setSearching((value) => !value)}
        >
          <Icon name={searching() ? 'x' : 'search'} />
        </button>
      </footer>
      <Show when={searching()}>
        <div
          class="search-panel"
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

/** A circular control; click or use arrow keys to rotate it in 30-degree increments. */
function Dial(props: { label: string; angle: number }) {
  const [angle, setAngle] = createSignal(props.angle);
  return (
    <button
      class="dial"
      aria-label={props.label}
      title="Click or use arrow keys to rotate"
      onClick={() => setAngle((value) => value + 30)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        setAngle((value) => value + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -30 : 30));
      }}
    >
      <span class="dial-rotor" style={{ '--angle': `${angle()}deg`, transform: `rotate(${angle()}deg)` }}>
        <span />
        <span />
      </span>
    </button>
  );
}

const palettes = [
  ['#ff1e1e', '#ffdb36', '#7fa477'],
  ['#bb94de', '#639bcc', '#e59656'],
  ['#94d979', '#f0a8d8', '#f9faf6']
] as const;
