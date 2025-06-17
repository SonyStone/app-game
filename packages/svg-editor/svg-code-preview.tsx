import { Entries } from '@solid-primitives/keyed';
import { createSignal, For, Show } from 'solid-js';
import { SVGNode } from './svg-node';

// TODO: check for the right names
const OPENING_TAG = <>&lt;</>; // <
const END_TAG = <>&gt;</>; // >
const CLOSE_TAG = <>/&gt;</>; // />

export function SVGCodePreview(props: {
  node: SVGNode;
  depth?: number;
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
}) {
  const [collapsed, setCollapsed] = createSignal(false);
  const depth = props.depth ?? 0;
  const indent = '  '.repeat(depth);

  const hasChildren = props.node.children && props.node.children.length > 0;
  const isSelfClosing = !hasChildren;

  return (
    <div class="overflow-y-auto whitespace-break-spaces break-all font-mono text-xs" ref={props.ref}>
      {/* Opening tag */}
      <span>
        {indent}
        {hasChildren && (
          <button
            class="mr-1 w-3 select-none text-gray-400 hover:text-gray-600"
            onClick={() => setCollapsed(!collapsed())}
          >
            {collapsed() ? '▶' : '▼'}
          </button>
        )}
        {!hasChildren && <span class="ms-4" />}
        <span class="text-blue-600">{OPENING_TAG}</span>
        <span class="text-red-600">{props.node.component}</span>

        {/* Attributes */}
        <Entries of={props.node}>
          {(key, value) => (
            <Show when={key !== 'component' && key !== 'children'}>
              {' '}
              <span class="text-orange-600">{key}</span>
              <span class="text-blue-600">=</span>
              <span class="text-green-600">"{value()}"</span>
            </Show>
          )}
        </Entries>

        <span class="text-blue-600">{isSelfClosing ? CLOSE_TAG : END_TAG}</span>
      </span>

      {/* Children */}
      <Show when={hasChildren && !collapsed()}>
        <For each={props.node.children}>{(child) => <SVGCodePreview node={child} depth={depth + 1} />}</For>
      </Show>

      {/* Closing tag */}
      <Show when={!isSelfClosing && (!hasChildren || !collapsed())}>
        {indent}
        <span class="ms-4">
          <span class=" text-blue-600">{OPENING_TAG}/</span>
          <span class="text-red-600">{props.node.component}</span>
          <span class="text-blue-600">{END_TAG}</span>
        </span>
      </Show>
    </div>
  );
}
