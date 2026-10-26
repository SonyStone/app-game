import type { PsdLayerNode } from '@app-game/psd/viewer';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { ariaState } from '../shared/format';
import styles from './LayersPanel.module.css';
import { collapsedGroups, filteredRows, kindLabels, layerRows, percent } from './layerTree';

/** Searchable keyboard tree. At 300 records only the visible rows and an eight-row buffer mount. */
export function LayersPanel(props: {
  layers: readonly PsdLayerNode[];
  visibleOf: (node: PsdLayerNode) => boolean;
  onVisible: (node: PsdLayerNode, visible: boolean) => void;
  selected: number | undefined;
  onSelect: (index: number) => void;
  onReveal: () => void;
  onFit: () => void;
  onSolo: () => void;
  onReset: () => void;
}) {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<number>>(() => new Set(collapsedGroups(props.layers)));
  const [query, setQuery] = createSignal('');
  const [kind, setKind] = createSignal('');
  const [scroll, setScroll] = createSignal(0);
  const [element, setElement] = createSignal<HTMLUListElement>();
  const size = createElementSize(element);
  const rows = createMemo(() => filteredRows(props.layers, collapsed(), query(), kind()));
  const virtual = () => layerRows(props.layers).length >= 300;
  const start = () => (virtual() ? Math.max(0, Math.min(rows().length - 1, Math.floor(scroll() / 28) - 8)) : 0);
  const end = () =>
    virtual() ? Math.min(rows().length, start() + Math.ceil((size.height ?? 600) / 28) + 16) : rows().length;

  function toggle(index: number, expand = collapsed().has(index)) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (expand) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  function select(position: number) {
    const row = rows()[position];
    if (!row) {
      return;
    }

    props.onSelect(row.node.index);
    const tree = element();
    if (tree) {
      const top = position * 28;
      if (top < tree.scrollTop || top + 28 > tree.scrollTop + tree.clientHeight) {
        tree.scrollTop = Math.max(0, top - tree.clientHeight / 2);
        setScroll(tree.scrollTop);
      }
    }
  }

  function keydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
      return;
    }

    const position = rows().findIndex(({ node }) => node.index === props.selected);
    const row = rows()[position];
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Enter'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (event.key === 'ArrowDown') {
      select(Math.min(rows().length - 1, position + 1));
    } else if (event.key === 'ArrowUp') {
      select(Math.max(0, position - 1));
    } else if (event.key === 'Home' || event.key === 'End') {
      select(event.key === 'Home' ? 0 : rows().length - 1);
    } else if (row && event.key === 'ArrowRight') {
      if (row.node.children && collapsed().has(row.node.index)) {
        toggle(row.node.index, true);
      } else if (row.node.children) {
        select(position + 1);
      }
    } else if (row && event.key === 'ArrowLeft') {
      if (row.node.children && !collapsed().has(row.node.index)) {
        toggle(row.node.index, false);
      } else {
        const parent = row.ancestors.at(-1);
        select(rows().findIndex(({ node }) => node.index === parent?.index));
      }
    } else if (row && event.key === ' ') {
      props.onVisible(row.node, !props.visibleOf(row.node));
    } else if (row && event.key === 'Enter') {
      props.onReveal();
    }
  }

  return (
    <>
      <div class={styles.controls}>
        <input
          aria-label="Search layers"
          type="search"
          placeholder="Search layers"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            element()!.scrollTop = 0;
            setScroll(0);
          }}
        />
        <select
          aria-label="Filter layer kind"
          value={kind()}
          onChange={(event) => {
            setKind(event.currentTarget.value);
            setScroll(0);
          }}
        >
          <option value="">All kinds</option>
          <For each={Object.entries(kindLabels)}>{([value, label]) => <option value={value}>{label}</option>}</For>
        </select>
        <button onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button
          onClick={() =>
            setCollapsed(
              new Set(
                layerRows(props.layers)
                  .filter(({ node }) => node.children)
                  .map(({ node }) => node.index)
              )
            )
          }
        >
          Collapse all
        </button>
        <button disabled={props.selected === undefined} onClick={props.onReveal}>
          Reveal bounds
        </button>
        <button disabled={props.selected === undefined} onClick={props.onFit}>
          Fit layer
        </button>
        <button disabled={props.selected === undefined} onClick={props.onSolo}>
          Solo
        </button>
        <button onClick={props.onReset}>Reset visibility</button>
        <p>Saved-record properties. Visibility overrides are transient. {rows().length} shown.</p>
      </div>
      <ul
        ref={setElement}
        class={styles.tree}
        role="tree"
        aria-label="Layers"
        tabindex={0}
        aria-activedescendant={props.selected === undefined ? undefined : `layer-row-${props.selected}`}
        onKeyDown={keydown}
        onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
      >
        <li role="none" style={{ height: `${start() * 28}px` }} />
        <For each={rows().slice(start(), end())}>
          {({ node, ancestors }) => (
            <li
              role="treeitem"
              id={`layer-row-${node.index}`}
              aria-level={ancestors.length + 1}
              aria-selected={ariaState(props.selected === node.index)}
              aria-expanded={
                node.children ? ariaState(!collapsed().has(node.index) || Boolean(query() || kind())) : undefined
              }
            >
              <div
                class={[
                  styles.row,
                  {
                    [styles.selected]: props.selected === node.index,
                    [styles.hidden]: !props.visibleOf(node) || ancestors.some((parent) => !props.visibleOf(parent))
                  }
                ]}
                style={{ '--depth': ancestors.length }}
                data-layer-index={node.index}
                onClick={() => {
                  props.onSelect(node.index);
                  element()?.focus();
                }}
              >
                <Show when={node.children} fallback={<span class={styles.disclosure} />}>
                  <button
                    class={styles.disclosure}
                    aria-label={`${collapsed().has(node.index) ? 'Expand' : 'Collapse'} ${node.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(node.index);
                    }}
                  >
                    {collapsed().has(node.index) ? '▸' : '▾'}
                  </button>
                </Show>
                <input
                  type="checkbox"
                  aria-label={`Visible: ${node.name}`}
                  checked={props.visibleOf(node)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => props.onVisible(node, event.currentTarget.checked)}
                />
                <span class={styles.kind} data-kind={node.kind} title={kindLabels[node.kind]}>
                  {node.kind === 'text' ? 'T' : node.kind === 'group' ? '▤' : '▦'}
                </span>
                <span class={styles.name} title={node.name}>
                  {node.clipped ? '↳ ' : ''}
                  {node.name || '(unnamed)'}
                </span>
                <span class={styles.badges}>
                  {node.mask || node.vectorMask ? '◐' : ''}
                  {node.notes.length ? ' !' : ''}
                </span>
                <span class={styles.meta}>{percent(node.opacity)}</span>
              </div>
            </li>
          )}
        </For>
        <li role="none" style={{ height: `${Math.max(0, rows().length - end()) * 28}px` }} />
      </ul>
    </>
  );
}
