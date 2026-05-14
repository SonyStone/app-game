import { ComponentProps, createMemo, createSignal, For, Show } from 'solid-js';
import { ImageCache, ImageCacheProvider, ImageStore } from './ImageCache';
import { TreeNode } from './tree';
import { exampleTrees } from './tree-struct';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'app-tree-struct-simple': ComponentProps<'div'>;
    }
  }
}

export function TreeStructSimple() {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const root = createMemo(() => exampleTrees[currentIndex()]);

  return (
    <app-tree-struct-simple class="flex flex-col">
      <div>Tree Struct Simple Example</div>
      <button
        class="my-2 w-32 rounded-2xl border px-2"
        onClick={() => {
          // Cycle through example roots
          const currentIndex = exampleTrees.indexOf(root());
          const nextIndex = (currentIndex + 1) % exampleTrees.length;
          setCurrentIndex(nextIndex);
        }}
      >
        Next Example index {currentIndex()}
      </button>
      <ul>
        <ImageCacheProvider>
          <ImageStore />
          <Item node={root()} />
        </ImageCacheProvider>
      </ul>
    </app-tree-struct-simple>
  );
}

function Item<T extends TreeNode>(props: { node: T }) {
  const [toggle, setToggle] = createSignal(true);

  return (
    <li data-node-id={props.node.id}>
      <div class="flex items-center gap-2">
        <span>{props.node.id} </span>

        <button class="rounded border px-1" onClick={() => setToggle(!toggle())}>
          {toggle() ? `Hide` : `Show`}
        </button>

        <ImageCache height={30} width={30} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=${props.node.id}`} />
      </div>
      <Show when={toggle()}>
        <ul class="ps-8">
          <For each={props.node.children}>{(child) => <Item node={child} />}</For>
        </ul>
      </Show>
    </li>
  );
}
