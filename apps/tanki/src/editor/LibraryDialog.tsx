import { createSignal, For, Show } from 'solid-js';
import type { TankiMap } from '../map/format';
import { deleteSavedMap, loadMapFromStorage, savedMapNames, saveMapToStorage } from '../map/storage';
import { Button, Dialog } from './ui';

/**
 * Maps saved in this browser: saves the current map under its name, opens or deletes the
 * others. Saving under a name that exists replaces that map.
 */
export function LibraryDialog(props: { map: TankiMap; onOpen: (map: TankiMap) => void; onClose: () => void }) {
  const [names, setNames] = createSignal(savedMapNames());
  const [message, setMessage] = createSignal<{ text: string; error: boolean }>();

  return (
    <Dialog title="Maps in this browser" onClose={props.onClose}>
      <div class="flex flex-col gap-3 p-4 text-xs">
        <div class="flex items-center justify-between gap-2 rounded-lg bg-[#2a2a2a] p-2.5">
          <span class="truncate text-[#cfcfcf]">
            Current: <b class="text-white">{props.map.name}</b>
          </span>
          <Button tone="accent" onClick={save}>
            {names().includes(props.map.name) ? 'Replace saved' : 'Save'}
          </Button>
        </div>
        <Show when={message()}>
          {(current) => <p class={['m-0', current().error ? 'text-[#ff8f8f]' : 'text-[#9fd99f]']}>{current().text}</p>}
        </Show>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          <For each={names()} fallback={<li class="py-4 text-center text-[#8a8a8a]">No saved maps yet.</li>}>
            {(name) => (
              <li class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#2a2a2a]">
                <span class="flex-1 truncate text-[#e6e6e6]">{name}</span>
                <Button onClick={() => open(name)}>Open</Button>
                <Button tone="danger" onClick={() => remove(name)} title={`Delete "${name}" from this browser`}>
                  Delete
                </Button>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Dialog>
  );

  function save() {
    const result = saveMapToStorage(props.map);
    setMessage(result.ok ? { text: `Saved "${props.map.name}".`, error: false } : { text: result.error, error: true });
    setNames(savedMapNames());
  }

  function open(name: string) {
    const result = loadMapFromStorage(name);

    if (result.ok) {
      props.onOpen(result.map);
    } else {
      setMessage({ text: result.error, error: true });
    }
  }

  function remove(name: string) {
    deleteSavedMap(name);
    setNames(savedMapNames());
    setMessage({ text: `Deleted "${name}".`, error: false });
  }
}
