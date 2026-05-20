import { For, type JSX } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import example1Html, { code as example1Code, language as example1Language } from './store-example-1.txt?shiki&lang=tsx';
import example2Html, { code as example2Code, language as example2Language } from './store-example-2.txt?shiki&lang=tsx';
import example3Html, { code as example3Code, language as example3Language } from './store-example-3.txt?shiki&lang=tsx';
import example4Html, { code as example4Code, language as example4Language } from './store-example-4.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Store Page
// ============================================================================

export default function StorePage(): JSX.Element {
  return (
    <PatternLayout
      title="Stores"
      badge="State"
      description="createStore provides fine-grained reactivity for nested objects and arrays. Only the specific paths that change trigger updates."
    >
      <PatternSection
        title="createStore basics"
        description="createStore returns a reactive proxy (getter) and a setter. Nested property access is tracked."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Live Demo">
        <StoreDemo />
      </PatternSection>

      <PatternSection
        title="Path syntax"
        description="setState accepts a path of keys, an updater function, or a combination."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="produce() — immer-style mutations"
        description="produce() allows writing imperative mutation code. It uses a draft that gets applied immutably."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="reconcile() — replace from external data"
        description="reconcile diffs incoming data against the existing store, updating only changed parts."
      >
        <CodeBlock language={example4Language} code={example4Code}>
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="warning" title="Don't destructure store values">
        Destructuring a store loses reactivity. Always access nested values through the store proxy:
        <br />
        <code class="rounded bg-white/10 px-1">
          const {'{'} name {'}'} = state.user
        </code>{' '}
        — breaks ❌
        <br />
        <code class="rounded bg-white/10 px-1">state.user.name</code> — works ✅
      </Callout>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

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
