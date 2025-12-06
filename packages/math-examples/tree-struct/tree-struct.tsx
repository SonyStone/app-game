import { ComponentProps, createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { ImageCache, ImageCacheProvider, ImageStore } from './ImageCache';
import { IDs } from './list-of-ids';
import { Tree } from './tree';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'app-tree-struct': ComponentProps<'div'>;
    }
  }
}

export const exampleTrees = [
  {
    id: IDs[0],
    children: [
      { id: IDs[1], children: [{ id: IDs[3] }] },
      { id: IDs[2], children: [{ id: IDs[4] }, { id: IDs[5] }] }
    ]
  },
  {
    id: IDs[1],
    children: [{ id: IDs[0] }, { id: IDs[3] }, { id: IDs[4] }, { id: IDs[2] }, { id: IDs[5] }]
  },
  {
    id: IDs[0],
    children: [{ id: IDs[1] }, { id: IDs[3] }, { id: IDs[4] }, { id: IDs[2] }, { id: IDs[5] }]
  },
  {
    id: IDs[0],
    children: [
      { id: IDs[1], children: [{ id: IDs[3] }] },
      { id: IDs[2], children: [{ id: IDs[4] }, { id: IDs[5] }] }
    ]
  },
  {
    id: IDs[0],
    children: [
      { id: IDs[2], children: [{ id: IDs[4] }, { id: IDs[5] }] },
      { id: IDs[1], children: [{ id: IDs[3] }] }
    ]
  }
] as const;

export function TreeStruct() {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const root = createMemo(() => exampleTrees[currentIndex()]);
  const [toggle, setToggle] = createSignal(true);

  return (
    <app-tree-struct class="flex flex-col">
      <div>Tree Struct Example</div>
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
      <button class="rounded border px-1" onClick={() => setToggle(!toggle())}>
        {toggle() ? `Hide ` : `Show`}
      </button>
      <ImageCacheProvider>
        <ImageStore />
        <ul>
          <Show when={toggle()}>
            <Tree root={root()}>
              {(props) => {
                const [toggle, setToggle] = createSignal(true);

                return (
                  <li data-node-id={props.node.id}>
                    <TestCleanup resources={props.node.id} />
                    <div class="flex items-center gap-2">
                      <span>
                        {props.node.id}{' '}
                        <span class="text-gray-500">
                          [path: {props.path.length > 0 ? props.path.join(',') : 'root'}]
                        </span>{' '}
                        {props.childCount > 0 ? `(${props.childCount} descendants)` : '(leaf node)'}
                      </span>
                      {props.childCount > 0 && (
                        <button class="rounded border px-1" onClick={() => setToggle(!toggle())}>
                          {toggle() ? `Hide ${props.childCount}` : `Show ${props.childCount}`}
                        </button>
                      )}
                      <ImageCache
                        height={30}
                        width={30}
                        src={`https://api.dicebear.com/6.x/thumbs/svg?seed=${props.node.id}`}
                      />
                    </div>
                    <Show when={toggle()}>
                      <TestCleanup resources={props.children} />
                      <ul class="ps-8">{props.children}</ul>
                    </Show>
                  </li>
                );
              }}
            </Tree>
          </Show>
        </ul>
      </ImageCacheProvider>
    </app-tree-struct>
  );
}

function TestCleanup(props: { resources?: unknown }) {
  onCleanup(() => {
    console.log('Cleaning up resources...', props.resources);
  });

  return null;
}
