import type { PsdLayerNode } from '@app-game/psd/viewer';
import { createSignal, For, Show } from 'solid-js';
import { ariaState } from '../shared/format';
import styles from './LayersPanel.module.css';
import { collapsedGroups, kindLabels, percent, topFirst } from './layerTree';

/**
 * The layer tree, top first, like Photoshop's Layers panel: a visibility checkbox per layer and group, kind, blend mode
 * and opacity, badges for layer styles, masks and clipping, and a warning mark where the renderer leaves something
 * out. Groups start collapsed as saved and toggle with their disclosure button. `visibleOf` gives the visibility the
 * render uses; children of hidden groups are dimmed.
 */
export function LayersPanel(props: {
  layers: readonly PsdLayerNode[];
  visibleOf: (node: PsdLayerNode) => boolean;
  onVisible: (node: PsdLayerNode, visible: boolean) => void;
  selected: number | undefined;
  onSelect: (index: number) => void;
}) {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<number>>(() => new Set(collapsedGroups(props.layers)));
  const toggleGroup = (index: number) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(index)) {
        next.add(index);
      }

      return next;
    });

  const rows = (nodes: readonly PsdLayerNode[], depth: number, hiddenAbove: boolean) => (
    <For each={topFirst(nodes)}>
      {(node) => {
        const visible = () => props.visibleOf(node);
        const expanded = () => !collapsed().has(node.index);
        return (
          <li
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={ariaState(props.selected === node.index)}
            aria-expanded={node.children ? ariaState(expanded()) : undefined}
          >
            <div
              class={[
                styles.row,
                { [styles.selected]: props.selected === node.index, [styles.hidden]: !visible() || hiddenAbove }
              ]}
              style={{ '--depth': depth }}
              data-layer-index={node.index}
              onClick={() => props.onSelect(node.index)}
            >
              <Show when={node.children} fallback={<span class={styles.disclosure} />}>
                <button
                  type="button"
                  class={styles.disclosure}
                  aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${node.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleGroup(node.index);
                  }}
                >
                  {expanded() ? '▾' : '▸'}
                </button>
              </Show>
              <input
                type="checkbox"
                aria-label={`Visible: ${node.name}`}
                checked={visible()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => props.onVisible(node, event.currentTarget.checked)}
              />
              <span class={styles.kind} data-kind={node.kind} title={node.adjustment ?? kindLabels[node.kind]}>
                {kindGlyphs[node.kind]}
              </span>
              <span class={styles.name} title={node.name}>
                <Show when={node.clipped}>
                  <span class={styles.clip} title="Clipped to the layer below">
                    ↳
                  </span>
                </Show>
                {node.name || '(unnamed)'}
              </span>
              <span class={styles.badges}>
                <Show when={node.effects?.some((effect) => effect.enabled)}>
                  <span
                    title={node
                      .effects!.filter((effect) => effect.enabled)
                      .map((effect) => effect.name)
                      .join(', ')}
                  >
                    fx
                  </span>
                </Show>
                <Show when={node.mask || node.vectorMask}>
                  <span title={maskTitle(node)}>◐</span>
                </Show>
                <Show when={node.notes.length}>
                  <span class={styles.warning} title={node.notes.join('\n')}>
                    !
                  </span>
                </Show>
              </span>
              <span class={styles.meta}>
                {node.blendMode === 'normal' || node.blendMode === 'passThrough' ? '' : node.blendMode}{' '}
                {percent(node.opacity)}
              </span>
            </div>
            <Show when={node.children && expanded()}>
              <ul role="group">{rows(node.children!, depth + 1, hiddenAbove || !visible())}</ul>
            </Show>
          </li>
        );
      }}
    </For>
  );

  return (
    <ul class={styles.tree} role="tree" aria-label="Layers">
      {rows(props.layers, 0, false)}
    </ul>
  );
}

const kindGlyphs: Record<PsdLayerNode['kind'], string> = {
  group: '▤',
  adjustment: '◑',
  text: 'T',
  smartObject: '▣',
  shape: '◆',
  fill: '■',
  pixel: '▦'
};

function maskTitle(node: PsdLayerNode): string {
  const parts = [];
  if (node.mask) {
    parts.push(node.mask.disabled ? 'Layer mask (disabled)' : 'Layer mask');
  }

  if (node.vectorMask) {
    parts.push(node.vectorMask.disabled ? 'Vector mask (disabled)' : 'Vector mask');
  }

  return parts.join(', ');
}
