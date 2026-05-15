import { For, Show, type JSX } from 'solid-js';

export type TreeDisplayNode = {
  label: string;
  color: string;
  isGroup: boolean;
};

export type TreeDisplayProps = {
  tree: Record<string, string[]>;
  nodes: Record<string, TreeDisplayNode>;
};

export function TreeDisplay(props: TreeDisplayProps): JSX.Element {
  function renderLevel(parentId: string, indent: number): JSX.Element {
    const kids = props.tree[parentId] ?? [];
    return (
      <For each={kids}>
        {(id) => {
          const node = props.nodes[id];
          if (!node) return null;
          return (
            <div>
              <div class="flex items-center gap-1.5 py-0.5" style={{ 'padding-left': `${indent * 16}px` }}>
                <span class="text-xs">{node.isGroup ? '📁' : '📄'}</span>
                <div class="h-2 w-2 rounded-full" style={{ background: node.color }} />
                <span class="text-xs text-neutral-400">{node.label}</span>
              </div>
              <Show when={node.isGroup}>{renderLevel(id, indent + 1)}</Show>
            </div>
          );
        }}
      </For>
    );
  }

  return (
    <div class="rounded-lg border border-white/10 bg-white/5 p-3">
      <div class="mb-2 text-xs font-semibold text-neutral-400">Tree Structure</div>
      <div class="font-mono">{renderLevel('root', 0)}</div>
    </div>
  );
}
