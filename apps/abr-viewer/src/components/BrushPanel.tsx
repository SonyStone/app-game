import { createProjection, createSignal, Show } from 'solid-js';
import { BlockTree, type BlockProps } from 'solid-nest';
import { createRootNode, filterTree, type GroupNode, type TreeNode } from '../lib/brush-tree';
import type { Workspace } from '../lib/workspace';
import styles from './BrushPanel.module.css';
import { BrushTreeGroup } from './BrushTreeGroup';
import { BrushTreeItem } from './BrushTreeItem';

/** Persistent brush collection. Filtering changes visibility without changing the document order. */
export function BrushPanel(props: {
  workspace: Workspace;
  onImport: () => void;
  onExport: (scope: GroupNode) => void;
}) {
  const [query, setQuery] = createSignal('');
  const [height, setHeight] = createSignal(46);
  // Reconcile immutable history snapshots by node ID. A stable root and surviving node
  // proxies keep solid-nest from remounting every canvas when one brush is edited.
  const tree = createProjection<GroupNode>(
    () =>
      query().trim()
        ? { ...props.workspace.root(), children: filterTree(props.workspace.root().children, query()) }
        : props.workspace.root(),
    createRootNode()
  );
  return (
    <section class={styles.brushes} aria-label="Brushes">
      <header class={styles.panelHeading}>
        <h2>Brushes</h2>
        <button onClick={props.onImport}>Import…</button>
      </header>
      <div class={styles.search}>
        <input
          aria-label="Search brushes"
          placeholder="Search Brushes"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div class={styles.collection} aria-label="Brush collection">
        <Show
          when={props.workspace.root().children.length}
          fallback={
            <div class={styles.empty}>
              <p>Drop .abr files here</p>
              <button onClick={props.onImport}>Import brushes…</button>
            </div>
          }
        >
          <Show when={tree.children.length} fallback={<p class={styles.empty}>No matching brushes</p>}>
            <BlockTree<string, TreeNode>
              root={tree}
              getKey={(node) => node.id}
              getChildren={(node) => (node.kind === 'group' && node.expanded ? node.children : undefined)}
              getOptions={(node) => ({
                tag: node.kind,
                accepts: node.id === tree.id ? ['group'] : ['group', 'brush'],
                spacing: 3,
                layout: node.id === tree.id ? 'list' : 'wrap'
              })}
              selection={{ blocks: props.workspace.selection() }}
              onSelectionChange={(event) => {
                if (event.kind !== 'blocks') return;
                props.workspace.setSelection(event.blocks);
                props.workspace.setActiveId(event.key);
              }}
              onReorder={(event) => {
                if (!query().trim()) props.workspace.reorder(event);
              }}
              onRemove={(event) => props.workspace.remove(event.keys)}
              transitionDuration={120}
              multiselect
              dropzone={InsertionMarker}
              placeholder={EmptyGroup}
            >
              {(item: BlockProps<string, TreeNode>) => (
                <>
                  <Show when={item.block.kind === 'group' ? item.block : undefined}>
                    {(group) => (
                      <BrushTreeGroup
                        block={group()}
                        selected={item.selected}
                        dragging={item.dragging}
                        childrenSlot={item.children}
                        onToggleExpand={props.workspace.toggleGroup}
                        onExportGroup={props.onExport}
                        onDeleteGroup={(group) => props.workspace.remove([group.id])}
                        onRenameGroup={(group, name) => props.workspace.rename(group.id, name)}
                        onAddGroup={props.workspace.addGroup}
                      />
                    )}
                  </Show>
                  <Show when={item.block.kind === 'brush' ? item.block : undefined}>
                    {(brush) => (
                      <BrushTreeItem
                        block={brush()}
                        selected={item.selected}
                        dragging={item.dragging}
                        height={height()}
                        onActivate={(select) => {
                          props.workspace.setActiveId(brush().id);
                          if (select) props.workspace.setSelection([brush().id]);
                        }}
                      />
                    )}
                  </Show>
                </>
              )}
            </BlockTree>
          </Show>
        </Show>
      </div>
      <footer class={styles.collectionTools}>
        <label>
          Preview size
          <input
            type="range"
            aria-label="Preview size"
            min="32"
            max="84"
            value={height()}
            onInput={(event) => setHeight(+event.currentTarget.value)}
          />
        </label>
        <button onClick={() => props.workspace.addGroup()}>New group</button>
        <button disabled={!props.workspace.selection().length} onClick={() => props.workspace.duplicate()}>
          Duplicate
        </button>
        <button disabled={!props.workspace.selection().length} onClick={() => props.workspace.remove()}>
          Delete
        </button>
      </footer>
    </section>
  );
}

/** Visible destination while rearranging presets. */
function InsertionMarker() {
  return <div class={styles.insertionMarker} />;
}

/** Gives empty folders a usable drop target. */
function EmptyGroup() {
  return <div class={styles.emptyGroup}>Drop brushes here</div>;
}
