import { For, type JSX } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { markdownComponents } from '../markdown-components';
import StoreContent from './stores.md?markdown';

export default function StorePage(): JSX.Element {
  return <StoreContent components={{ ...markdownComponents, StoreDemo }} />;
}

type Todo = { id: number; text: string; done: boolean };

function StoreDemo(): JSX.Element {
  const [todos, setTodos] = createStore<Todo[]>([
    { id: 1, text: 'Learn createStore', done: false },
    { id: 2, text: 'Try produce()', done: false },
    { id: 3, text: 'Use reconcile()', done: false }
  ]);

  let nextId = 4;
  let inputRef!: HTMLInputElement;

  const addTodo = () => {
    const text = inputRef.value.trim();
    if (!text) return;
    setTodos(
      produce((draft) => {
        draft.push({ id: nextId++, text, done: false });
      })
    );
    inputRef.value = '';
  };

  const toggle = (id: number) =>
    setTodos(
      (t) => t.id === id,
      'done',
      (d) => !d
    );

  const remove = (id: number) => setTodos((ts) => ts.filter((t) => t.id !== id));

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex gap-2">
        <input
          ref={inputRef}
          placeholder="New todo…"
          class="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
        />
        <Button size="sm" onClick={addTodo}>
          Add
        </Button>
      </div>
      <ul class="flex flex-col gap-1.5">
        <For each={todos}>
          {(todo) => (
            <li class="flex items-center gap-2 rounded-lg bg-neutral-800/50 px-3 py-2">
              <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} class="accent-violet-500" />
              <span class={`flex-1 text-sm ${todo.done ? 'text-neutral-600 line-through' : 'text-neutral-200'}`}>
                {todo.text}
              </span>
              <button class="text-xs text-neutral-600 hover:text-red-400" onClick={() => remove(todo.id)}>
                ✕
              </button>
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
