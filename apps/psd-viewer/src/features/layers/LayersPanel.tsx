import type { PsdLayerNode } from '@app-game/psd/viewer';
import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { LayerEditing } from '../editing/Editing';
import { ariaState } from '../shared/format';
import { createTreeEditing } from './createTreeEditing';
import { dropZone, moveCommands, moveDestination } from './interactions';
import styles from './LayersPanel.module.css';
import { collapsedGroups, filteredRows, kindLabels, layerRows, percent } from './layerTree';
import { PercentField } from './PercentField';

/** Searchable keyboard tree. At 300 records only the visible rows and an eight-row buffer mount. */
export function LayersPanel(props: {
  editing?: LayerEditing;
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

  const edit = createTreeEditing(props, () => rows().map(({ node }) => node));
  const [drag, setDrag] = createSignal<{ pointer: number; x: number; y: number; ids: number[]; active: boolean }>();
  const [drop, setDrop] = createSignal<{
    record: number;
    target: number;
    zone: ReturnType<typeof dropZone>;
    parent: number | null;
    index: number;
  }>();
  let suppressClick = false;
  const nodeSelected = (node: PsdLayerNode) =>
    edit.enabled() ? edit.selectedIds().includes(edit.idOf(node) ?? -1) : props.selected === node.index;
  const visible = (node: PsdLayerNode) => (edit.enabled() ? node.visible : props.visibleOf(node));
  const value = (property: 'opacity' | 'fill' | 'blend') => {
    const selected = edit.selectedLayers();
    const first = selected[0]?.[property];
    return selected.every((layer) => layer[property] === first) ? first : undefined;
  };
  const activeRecord = () =>
    edit.enabled()
      ? rows().find(({ node }) => edit.idOf(node) === edit.selectedIds().at(-1))?.node.index
      : props.selected;
  const canEdit = (node: PsdLayerNode) => !edit.busy() && edit.idOf(node) !== undefined;

  async function visibility(node: PsdLayerNode, next: boolean) {
    if (edit.enabled()) {
      if (edit.unavailable('visible') || edit.idOf(node) === undefined) {
        return;
      }
      return edit.apply([{ kind: 'visible', layerId: edit.idOf(node)!, visible: next }]);
    } else {
      props.onVisible(node, next);
      return true;
    }
  }

  createEventListener(
    () => (edit.enabled() ? window : undefined),
    'pointermove',
    (event) => {
      const start = drag();
      if (!start || start.pointer !== event.pointerId) {
        return;
      }
      if (!(event.buttons & 1)) {
        setDrag(undefined);
        setDrop(undefined);
        return;
      }
      // Ignore click jitter before starting a reorder gesture.
      if (!start.active && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) {
        return;
      }
      setDrag({ ...start, active: true });
      suppressClick = true;
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layer-index]');
      const node = row && rows().find(({ node }) => node.index === Number(row.dataset.layerIndex))?.node;
      const target = node && edit.layers().find((layer) => layer.id === edit.idOf(node));
      if (!row || !node || !target) {
        setDrop(undefined);
        return;
      }
      const rect = row.getBoundingClientRect();
      const zone = dropZone((event.clientY - rect.top) / rect.height, Boolean(node.children));
      const destination = moveDestination(edit.layers(), start.ids, target, zone);
      setDrop(destination ? { record: node.index, target: target.id, zone, ...destination } : undefined);
      const tree = element();
      if (tree) {
        const bounds = tree.getBoundingClientRect();
        if (event.clientY < bounds.top + 28) {
          tree.scrollTop -= 28;
        } else if (event.clientY > bounds.bottom - 28) {
          tree.scrollTop += 28;
        }
      }
    },
    { passive: true }
  );
  createEventListener(
    () => (edit.enabled() ? window : undefined),
    'pointerup',
    (event) => {
      const start = drag();
      if (!start) {
        setDrag(undefined);
        setDrop(undefined);
        return;
      }
      if (start.pointer !== event.pointerId) {
        return;
      }
      const destination = drop();
      if (start.active && destination) {
        const target = edit.layers().find((layer) => layer.id === destination.target);
        if (target) {
          void edit.apply(moveCommands(edit.layers(), start.ids, target, destination.zone));
        }
        if (destination.zone === 'inside') {
          toggle(destination.record, true);
        }
      }
      setDrag(undefined);
      setDrop(undefined);
    }
  );
  createEventListener(
    () => (edit.enabled() ? window : undefined),
    ['pointercancel', 'blur'],
    () => {
      setDrag(undefined);
      setDrop(undefined);
    }
  );
  createEventListener(
    () => (edit.enabled() ? window : undefined),
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        setDrag(undefined);
        setDrop(undefined);
      }
    }
  );

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

  function select(position: number, modifiers = { shiftKey: false, metaKey: false, ctrlKey: false }) {
    const row = rows()[position];
    if (!row) {
      return;
    }

    props.onSelect(row.node.index);
    if (edit.enabled()) {
      edit.select(row.node, modifiers);
    }
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

    const position = rows().findIndex(({ node }) =>
      edit.enabled() ? edit.idOf(node) === edit.selectedIds().at(-1) : node.index === props.selected
    );
    const row = rows()[position];
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Enter'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (event.key === 'ArrowDown') {
      select(Math.min(rows().length - 1, position + 1), event);
    } else if (event.key === 'ArrowUp') {
      select(Math.max(0, position - 1), event);
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
      void visibility(row.node, !visible(row.node));
    } else if (row && event.key === 'Enter') {
      props.onReveal();
    }
  }

  return (
    <>
      <Show when={edit.enabled()}>
        <div class={styles.editControls} aria-label="Selected layer controls">
          <select
            aria-label="Layer blend mode"
            disabled={edit.busy() || !edit.selectedIds().length || Boolean(edit.unavailable('blend'))}
            title={edit.unavailable('blend')}
            value={value('blend') ?? ''}
            onChange={(event) => {
              const input = event.currentTarget;
              const blend = input.value;
              const original = String(value('blend') ?? '');
              void edit
                .apply(edit.selectedLayers().map((layer) => ({ kind: 'blend', layerId: layer.id, blend })))
                .then((accepted) => {
                  if (!accepted) {
                    input.value = original;
                  }
                });
            }}
          >
            <option value="" disabled>
              Mixed
            </option>
            <For
              each={[
                'normal',
                'dissolve',
                'darken',
                'multiply',
                'colorBurn',
                'linearBurn',
                'darkerColor',
                'lighten',
                'screen',
                'colorDodge',
                'linearDodge',
                'lighterColor',
                'overlay',
                'softLight',
                'hardLight',
                'vividLight',
                'linearLight',
                'pinLight',
                'hardMix',
                'difference',
                'exclusion',
                'subtract',
                'divide',
                'hue',
                'saturation',
                'color',
                'luminosity',
                'passThrough'
              ]}
            >
              {(mode) => (
                <option
                  value={mode}
                  disabled={mode === 'passThrough' && edit.selectedLayers().some((layer) => !layer.group)}
                >
                  {mode === 'linearDodge'
                    ? 'Linear Dodge (Add)'
                    : mode.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
                </option>
              )}
            </For>
          </select>
          <For each={['opacity', 'fill'] as const}>
            {(property) => (
              <PercentField
                label={property === 'opacity' ? 'Opacity' : 'Fill'}
                value={typeof value(property) === 'number' ? Number(value(property)) : undefined}
                disabled={edit.busy() || !edit.selectedIds().length || Boolean(edit.unavailable(property))}
                reason={edit.unavailable(property)}
                onCommit={(byte) =>
                  edit.apply(
                    edit
                      .selectedLayers()
                      .map((layer) =>
                        property === 'opacity'
                          ? { kind: 'opacity', layerId: layer.id, opacity: byte }
                          : { kind: 'fill', layerId: layer.id, fill: byte }
                      )
                  )
                }
              />
            )}
          </For>
          <span>Shift selects a range · Cmd/Ctrl adds layers</span>
        </div>
      </Show>
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
            element()!.scrollTop = 0;
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
        <button
          disabled={edit.enabled() || props.selected === undefined}
          title="View-mode visibility preview"
          onClick={props.onSolo}
        >
          Solo
        </button>
        <button disabled={edit.enabled()} title="View-mode visibility preview" onClick={props.onReset}>
          Reset visibility
        </button>
        <p>
          {edit.enabled() ? 'Edit mode · eye changes are saved' : 'View mode · eye changes are transient'}.{' '}
          {rows().length} shown.
        </p>
      </div>
      <ul
        ref={setElement}
        class={styles.tree}
        role="tree"
        aria-label="Layers"
        aria-multiselectable={edit.enabled() ? 'true' : undefined}
        tabindex={0}
        aria-activedescendant={activeRecord() === undefined ? undefined : `layer-row-${activeRecord()}`}
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
              aria-selected={ariaState(nodeSelected(node))}
              aria-expanded={
                node.children ? ariaState(!collapsed().has(node.index) || Boolean(query() || kind())) : undefined
              }
            >
              <div
                class={[
                  styles.row,
                  {
                    [styles.selected]: nodeSelected(node),
                    [styles.hidden]: !visible(node) || ancestors.some((parent) => !visible(parent))
                  }
                ]}
                style={{ '--depth': ancestors.length }}
                data-layer-index={node.index}
                data-drop-zone={drop()?.record === node.index ? drop()?.zone : undefined}
                data-edit-id={edit.idOf(node)}
                onPointerDown={(event) => {
                  suppressClick = false;
                  if (
                    !canEdit(node) ||
                    event.button !== 0 ||
                    (event.target instanceof Element && event.target.closest('input,button'))
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const id = edit.idOf(node)!;
                  const selected = edit.selectedIds();
                  const keep = selected.includes(id) && !event.shiftKey && !event.metaKey && !event.ctrlKey;
                  if (!keep) {
                    edit.select(node, event);
                  }
                  if (edit.unavailable('structure')) {
                    props.onSelect(node.index);
                    element()?.focus();
                    return;
                  }
                  setDrag({
                    pointer: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    ids: keep ? edit.roots().map((layer) => layer.id) : [id],
                    active: false
                  });
                  props.onSelect(node.index);
                  element()?.focus();
                }}
                onClick={(event) => {
                  if (suppressClick) {
                    suppressClick = false;
                    return;
                  }
                  if (!edit.enabled()) {
                    props.onSelect(node.index);
                    element()?.focus();
                  } else if (!event.shiftKey && !event.metaKey && !event.ctrlKey && canEdit(node)) {
                    edit.select(node, event);
                  }
                }}
                onContextMenu={(event) => {
                  if (!edit.enabled()) {
                    return;
                  }
                  event.preventDefault();
                  if (!nodeSelected(node)) {
                    edit.select(node, { shiftKey: false, metaKey: false, ctrlKey: false });
                  }
                  edit.setMenu({
                    x: Math.min(event.clientX, window.innerWidth - 210),
                    y: Math.min(event.clientY, window.innerHeight - 150)
                  });
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
                  class={styles.eye}
                  data-editing={edit.enabled()}
                  aria-label={`Visible: ${node.name}`}
                  title={
                    edit.enabled()
                      ? (edit.unavailable('visible') ?? 'Edit saved visibility')
                      : 'Transient viewing override'
                  }
                  disabled={edit.enabled() && (!canEdit(node) || Boolean(edit.unavailable('visible')))}
                  checked={visible(node)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    void visibility(node, input.checked).then((accepted) => {
                      if (!accepted) {
                        input.checked = visible(node);
                      }
                    });
                  }}
                />
                <span class={styles.kind} data-kind={node.kind} title={kindLabels[node.kind]}>
                  {node.kind === 'text' ? 'T' : node.kind === 'group' ? '▤' : '▦'}
                </span>
                <Show
                  when={edit.renaming()?.id === edit.idOf(node) && edit.renaming()}
                  fallback={
                    <span
                      class={styles.name}
                      title={node.name}
                      onDblClick={(event) => {
                        if (canEdit(node)) {
                          event.stopPropagation();
                          edit.setRenaming({ id: edit.idOf(node)!, name: node.name });
                        }
                      }}
                    >
                      {node.clipped ? '↳ ' : ''}
                      {node.name || '(unnamed)'}
                    </span>
                  }
                >
                  {(renaming) => (
                    <input
                      aria-label="Rename layer inline"
                      class={styles.rename}
                      ref={(input) => {
                        queueMicrotask(() => {
                          input.focus();
                          input.select();
                        });
                      }}
                      value={renaming().name}
                      onInput={(event) => edit.setRenaming({ id: renaming().id, name: event.currentTarget.value })}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={() => edit.setRenaming(undefined)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          edit.setRenaming(undefined);
                          element()?.focus();
                        } else if (event.key === 'Enter') {
                          event.preventDefault();
                          const rename = renaming();
                          edit.setRenaming(undefined);
                          if (rename.name !== node.name) {
                            void edit.apply([{ kind: 'rename', layerId: rename.id, name: rename.name }]);
                          }
                          element()?.focus();
                        }
                      }}
                    />
                  )}
                </Show>
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
      <Show when={edit.menu()}>
        {(menu) => (
          <div
            data-layer-menu
            role="menu"
            aria-label="Layer actions"
            class={styles.menu}
            style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
          >
            <button
              role="menuitem"
              disabled={edit.busy() || Boolean(edit.groupReason())}
              title={edit.groupReason()}
              onClick={edit.group}
            >
              Group layers <kbd>⌘/Ctrl G</kbd>
            </button>
            <button
              role="menuitem"
              disabled={edit.busy() || Boolean(edit.ungroupReason())}
              title={edit.ungroupReason()}
              onClick={edit.ungroup}
            >
              Ungroup <kbd>⇧⌘/Ctrl G</kbd>
            </button>
            <button
              role="menuitem"
              disabled={edit.busy() || !edit.selectedIds().length || Boolean(edit.unavailable('structure'))}
              title={edit.unavailable('structure')}
              onClick={edit.remove}
            >
              Delete layers <kbd>Delete</kbd>
            </button>
          </div>
        )}
      </Show>
    </>
  );
}
