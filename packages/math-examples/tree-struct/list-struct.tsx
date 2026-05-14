import { Key } from '@solid-primitives/keyed';
import { createMemo, createSignal, untrack } from 'solid-js';
import { IDs } from './list-of-ids';

const exampleLists = [
  [{ id: IDs[0] }, { id: IDs[1] }, { id: IDs[3] }, { id: IDs[2] }, { id: IDs[4] }, { id: IDs[5] }],
  [{ id: IDs[0] }, { id: IDs[5] }, { id: IDs[4] }, { id: IDs[2] }, { id: IDs[1] }, { id: IDs[3] }],
  [{ id: IDs[0] }, { id: IDs[3] }, { id: IDs[1] }, { id: IDs[2] }, { id: IDs[4] }, { id: IDs[5] }]
] as const;

export function ListStruct() {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const list = createMemo(() => exampleLists[currentIndex()]);

  return (
    <div class="flex flex-col">
      <div>List Struct Example</div>
      <button
        class="my-2 w-32 rounded-2xl border px-2"
        onClick={() => {
          // Cycle through example lists
          const currentIndex = exampleLists.indexOf(list());
          const nextIndex = (currentIndex + 1) % exampleLists.length;
          setCurrentIndex(nextIndex);
        }}
      >
        Next Example index {currentIndex()}
      </button>
      <ul>
        <Key each={list()} by={(item) => item.id}>
          {(item) => (
            <li class="flex items-center gap-2">
              {item().id}
              <img height={20} width={20} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=${untrack(item).id}`} />
            </li>
          )}
        </Key>
      </ul>
    </div>
  );
}
