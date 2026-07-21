import { For, Show, type JSX } from 'solid-js';
import type { NestedItem } from '.';
import { Item } from './Item';

/** Renders the complete parsed tree as a non-virtualized comparison. */
export function OriginalList(props: {
  /** Root SVG element records. */
  items: readonly NestedItem[];
  /** Reports whether an element's descendants are visible. */
  isExpanded: (item: NestedItem) => boolean;
  /** Changes an element's expanded state. */
  onExpandedChange: (item: NestedItem, expanded: boolean) => void;
  /** Changes one flattened SVG attribute. */
  onAttributeChange: (item: NestedItem, name: string, value: string) => void;
}) {
  return (
    <div class="flex flex-1 flex-col">
      <div class="bg-gray-200 p-2 text-xs font-medium">Non-virtualized (for comparison)</div>
      <div class="flex-1 overflow-auto bg-gray-50">
        <div class="flex flex-col gap-2 p-2">{renderItems(props.items, props)}</div>
      </div>
    </div>
  );
}

function renderItems(items: readonly NestedItem[], props: Parameters<typeof OriginalList>[0]): JSX.Element {
  return (
    <For each={items}>
      {(item) => (
        <Item
          index={item.index}
          title={`<${item.component}> · node ${item.index}`}
          data={readStringProperties(item)}
          onAttributeChange={(name, value) => props.onAttributeChange(item, name, value)}
          expanded={item.children.length > 0 ? props.isExpanded(item) : undefined}
          onExpandedChange={item.children.length > 0 ? (expanded) => props.onExpandedChange(item, expanded) : undefined}
        >
          <Show when={item.children.length > 0 && props.isExpanded(item)}>{renderItems(item.children, props)}</Show>
        </Item>
      )}
    </For>
  );
}

function readStringProperties(item: NestedItem): Record<string, string> {
  return Object.fromEntries(
    Object.entries(item).filter(
      (entry): entry is [string, string] => entry[0] !== 'component' && typeof entry[1] === 'string'
    )
  );
}
