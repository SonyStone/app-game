import type { JSX } from '@solidjs/web';
import { createStore, For, storePath } from 'solid-js';
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
    { id: 2, text: 'Try a draft callback', done: false },
    { id: 3, text: 'Use storePath()', done: false }
  ]);

  let nextId = 4;
  let inputRef!: HTMLInputElement;

  const addTodo = () => {
    const text = inputRef.value.trim();
    if (!text) return;
    setTodos((draft) => {
      draft.push({ id: nextId++, text, done: false });
    });
    inputRef.value = '';
  };

  const toggle = (id: number) =>
    setTodos(
      storePath(
        (todo) => todo.id === id,
        'done',
        (done) => !done
      )
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
