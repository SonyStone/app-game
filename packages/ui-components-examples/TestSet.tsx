import { createSignal, For } from 'solid-js';

export function TestSet() {

  const [list, setList] = createSignal<Set<string>>(new Set(['123', 'qwe']), { equals: () => false });

  const remove = (item: string) => {
    const set = list();
    set.delete(item)
    setList(set);
  }

  const add = (item: string) => {
    const set = list()
    set.add(item)
    setList(set);
  }

  return <>
    <button onClick={() => add('asd' + Math.random())}>add</button>
    <For each={[...list()]}>{
      (item) => <div>{item} <button onClick={() => remove(item)}>remove</button></div>
    }</For>
  </>
}