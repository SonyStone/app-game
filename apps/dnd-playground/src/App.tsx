import { ComponentProps, createEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { BlockTree } from 'solid-nest';
import {
  countBrushes,
  countGroups,
  createMockData,
  isGroup,
  type BrushBlock,
  type GroupBlock,
  type MyBlock
} from './mock-data';

// ============================================================================
// MARK: Tree helpers (same logic as solid-nest internals)
// ============================================================================

function findBlock(root: MyBlock, key: string): MyBlock | undefined {
  if (root.key === key) return root;
  if (root.type === 'group') {
    for (const child of root.children) {
      const found = findBlock(child, key);
      if (found) return found;
    }
  }
  return undefined;
}

function removeBlocks(root: MyBlock, keys: string[], collect?: MyBlock[]): void {
  if (root.type !== 'group') return;
  root.children = root.children.filter((child) => {
    if (!keys.includes(child.key)) {
      removeBlocks(child, keys, collect);
      return true;
    }
    collect?.push(child);
    return false;
  });
}

function insertBlocks(root: MyBlock, blocks: MyBlock[], place: { parent: string; before: string | null }): void {
  const parent = findBlock(root, place.parent);
  if (!parent || parent.type !== 'group') return;
  if (place.before !== null) {
    const idx = parent.children.findIndex((c) => c.key === place.before);
    parent.children.splice(idx, 0, ...blocks);
  } else {
    parent.children.push(...blocks);
  }
}

// ============================================================================
// MARK: App
// ============================================================================

export default function App(): JSX.Element {
  const [root, setRoot] = createStore<GroupBlock>(structuredClone(createMockData()));
  const [selection, setSelection] = createSignal<any>({});
  const [lastEvent, setLastEvent] = createSignal('None');

  return (
    <div class="bg-ps-bg-dark flex h-screen flex-col text-neutral-300 select-none">
      <Body class="m-0 bg-[#1e1e1e] text-[#b0b0b0]" />
      {/* Header */}
      <header class="bg-ps-bg flex items-center gap-4 border-b border-neutral-700 px-4 py-2">
        <h1 class="text-sm font-bold tracking-wide text-neutral-200 uppercase">DnD Playground</h1>
        <span class="text-xs text-neutral-500">
          {countBrushes(root)} brushes · {countGroups(root)} groups
        </span>
        <span class="ml-auto font-mono text-xs text-neutral-500">Last: {lastEvent()}</span>
      </header>

      {/* Instructions */}
      <div class="flex flex-wrap gap-3 border-b border-neutral-700/50 bg-neutral-800/50 px-4 py-1.5 text-[10px] text-neutral-500">
        <span>🖱 Click to select</span>
        <span>⌘/Ctrl+Click multi-select</span>
        <span>⇧+Click range select</span>
        <span>Drag to reorder/nest</span>
        <span>⌫ Delete selected</span>
      </div>

      {/* Tree */}
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <BlockTree
          root={root as any}
          getKey={(block: any) => block.key}
          getChildren={(block: any) => block.children}
          getOptions={(block: any) => {
            if (block.type === 'group')
              return { spacing: 4, tag: 'group', accepts: ['group', 'brush'], layout: 'list' };
            return { tag: 'brush' };
          }}
          selection={selection()}
          onSelectionChange={(event: any) => {
            setSelection(event);
            if (event.kind === 'blocks') {
              setLastEvent(`Select: ${event.blocks.length} [${event.mode}]`);
            } else if (event.kind === 'place') {
              setLastEvent(`Place: ${event.place.parent}`);
            } else {
              setLastEvent('Deselect');
            }
          }}
          onReorder={(event: any) => {
            setRoot(
              produce((draft: any) => {
                const blocks: any[] = [];
                removeBlocks(draft, event.keys, blocks);
                insertBlocks(draft, blocks, event.place);
              })
            );
            setLastEvent(`Reorder: [${event.keys.join(', ')}]`);
          }}
          onInsert={(event: any) => {
            setRoot(
              produce((draft: any) => {
                insertBlocks(draft, event.blocks, event.place);
              })
            );
            setLastEvent(`Insert: ${event.blocks.length} block(s)`);
          }}
          onRemove={(event: any) => {
            setRoot(
              produce((draft: any) => {
                removeBlocks(draft, event.keys);
              })
            );
            setLastEvent(`Remove: [${event.keys.join(', ')}]`);
          }}
          multiselect={true}
          transitionDuration={200}
          fixedHeightWhileDragging={true}
        >
          {(props: any) => {
            const block = props.block ?? props.data;
            if (isGroup(block)) {
              return (
                <GroupItem
                  block={block as GroupBlock}
                  selected={props.selected}
                  dragging={props.dragging}
                  children={props.children}
                />
              );
            }
            return <BrushItem block={block as BrushBlock} selected={props.selected} dragging={props.dragging} />;
          }}
        </BlockTree>
      </div>

      {/* Footer */}
      <footer class="bg-ps-bg flex items-center gap-2 border-t border-neutral-700 px-4 py-1.5 text-[10px] text-neutral-500">
        <span>Selected: {selection()?.blocks?.length ?? 0}</span>
        <span class="ml-auto">solid-nest v0.6.2 · DnD playground</span>
      </footer>
    </div>
  );
}

// ============================================================================
// MARK: GroupItem
// ============================================================================

function GroupItem(props: {
  block: GroupBlock;
  selected: boolean;
  dragging: boolean;
  children: JSX.Element;
}): JSX.Element {
  const [collapsed, setCollapsed] = createSignal(false);

  return (
    <div
      data-drag-handle
      data-block-type="group"
      class={`cursor-grab touch-none rounded border transition-colors duration-100 ${
        props.selected ? 'border-ps-accent bg-ps-accent/10' : 'border-neutral-700/60 bg-neutral-800/40'
      } ${props.dragging ? 'opacity-50' : ''}`}
    >
      {/* Header */}
      <div
        class={`flex items-center gap-1.5 px-2 py-1 active:cursor-grabbing ${
          props.selected ? 'bg-ps-accent/15' : 'hover:bg-neutral-700/30'
        }`}
      >
        {/* Collapse toggle — stopPropagation so it doesn't trigger selection/drag */}
        <button
          class="flex h-4 w-4 items-center justify-center text-[10px] text-neutral-400 hover:text-neutral-200"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed(!collapsed())}
        >
          {collapsed() ? '▶' : '▼'}
        </button>

        {/* Folder icon */}
        <span class="text-xs text-yellow-500/80">📁</span>

        {/* Name */}
        <span class="flex-1 truncate text-xs font-medium text-neutral-300">{props.block.name}</span>
      </div>

      {/* Children */}
      <Show when={!collapsed()}>
        <div class="pr-1 pb-1 pl-3">{props.children}</div>
      </Show>
    </div>
  );
}

// ============================================================================
// MARK: BrushItem
// ============================================================================

function BrushItem(props: { block: BrushBlock; selected: boolean; dragging: boolean }): JSX.Element {
  return (
    <div
      data-drag-handle
      data-block-type="brush"
      class={`flex w-20 cursor-grab touch-none flex-col items-center gap-1 rounded p-1.5 transition-colors duration-100 active:cursor-grabbing ${
        props.selected ? 'bg-ps-accent/20 outline-ps-accent outline-1' : 'hover:bg-neutral-700/40'
      } ${props.dragging ? 'opacity-50' : ''}`}
    >
      {/* Color swatch */}
      <div
        class="h-12 w-12 shrink-0 rounded border border-neutral-600/50"
        style={{ background: `hsl(${props.block.hue}, 45%, 40%)` }}
      />

      {/* Name */}
      <span class="w-full truncate text-center text-[10px] text-neutral-300">{props.block.name}</span>

      {/* Info */}
      <div class="flex items-center gap-1">
        <span class="text-[9px] text-neutral-500 tabular-nums">{props.block.diameter}px</span>
        <span
          class={`rounded-sm px-0.5 text-[8px] ${
            props.block.brushType === 'sampled' ? 'bg-purple-900/40 text-purple-400' : 'bg-blue-900/40 text-blue-400'
          }`}
        >
          {props.block.brushType === 'sampled' ? 'SMP' : 'CMP'}
        </span>
      </div>
    </div>
  );
}

function Body(props: Pick<ComponentProps<'body'>, 'class'>) {
  createEffect(() => {
    document.body.className = props.class || '';
  });

  onCleanup(() => {
    document.body.className = '';
  });

  return null;
}
