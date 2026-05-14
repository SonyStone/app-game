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
  ref?: HTMLElement | ((el: HTMLElement) => void);
}) {
  function CodePreview(props: { node: SVGNode; depth?: number; lineNumber?: number }) {
    const [collapsed, setCollapsed] = createSignal(false);
    const depth = props.depth ?? 0;
    const indent = '  '.repeat(depth);

    const hasChildren = props.node.children && props.node.children.length > 0;
    const isSelfClosing = !hasChildren;

    return (
      <>
        {/* Opening tag */}
        <pre
          part="line"
          class="contain-layout absolute top-[calc(var(--tm-line-number)*12px)]"
          style={{ '--tm-line-number': props.lineNumber ?? 0 }}
        >
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
        </pre>

        {/* Children */}
        <Show when={hasChildren && !collapsed()}>
          <For each={props.node.children}>
            {(child, index) => (
              <CodePreview node={child} depth={depth + 1} lineNumber={props.lineNumber ?? 0 + index()} />
            )}
          </For>
        </Show>

        {/* Closing tag */}
        <Show when={!isSelfClosing && (!hasChildren || !collapsed())}>
          <pre part="line">
            {indent}
            <span class=" text-blue-600">{OPENING_TAG}/</span>
            <span class="text-red-600">{props.node.component}</span>
            <span class="text-blue-600">{END_TAG}</span>
          </pre>
        </Show>
      </>
    );
  }

  return (
    <div class="relative overflow-auto font-mono text-xs">
      <code
        part="code"
        class="z-1 contain-layout pointer-events-none absolute whitespace-break-spaces break-all"
        ref={props.ref}
      >
        <Show when={props.node.component}>
          <CodePreview node={props.node} />
        </Show>
      </code>
      <textarea
        rows="12"
        class="h-full w-full resize-none overflow-hidden whitespace-pre border-none bg-transparent p-0 outline-none"
      ></textarea>
    </div>
  );
}
