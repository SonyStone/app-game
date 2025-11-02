import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { IDs } from './list-of-ids';
import { Tree } from './tree';

const exampleTrees = [
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

  return (
    <div class="flex flex-col">
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
      <ul>
        <Tree root={root()}>
          {(props) => {
            const [toggle, setToggle] = createSignal(true);

            createEffect(() => {
              console.log('❓ Toggle', toggle());
            });

            return (
              <li data-node-id={props.node.id}>
                <div class="flex items-center gap-2">
                  <span>
                    {props.node.id}{' '}
                    {props.node.children?.length ? `(children: ${props.node.children.length})` : '(no children)'}
                  </span>
                  <button
                    class="rounded border px-1"
                    onClick={() => {
                      console.log('❓ setToggle', !toggle());
                      setToggle(!toggle());
                    }}
                  >
                    {toggle() ? 'Hide' : 'Show'}
                  </button>
                  <img height={30} width={30} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=${props.node.id}`} />
                </div>
                <Show when={toggle()}>
                  <ul class="ps-8">{props.children}</ul>
                </Show>
              </li>
            );
          }}
        </Tree>
      </ul>
    </div>
  );
}
