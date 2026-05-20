import { For, type JSX } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

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
        <CodeBlock
          language="tsx"
          code={`import { createStore } from 'solid-js/store';

const [state, setState] = createStore({
  user: { name: 'Alice', age: 30 },
  items: [{ id: 1, done: false }, { id: 2, done: true }]
});

// Read nested values (tracked reactively)
console.log(state.user.name);   // 'Alice'
console.log(state.items[0].done); // false

// Update specific path — only that path's subscribers re-run
setState('user', 'name', 'Bob');
setState('items', 0, 'done', true);`}
        />
      </PatternSection>

      <PatternSection title="Live Demo">
        <StoreDemo />
      </PatternSection>

      <PatternSection
        title="Path syntax"
        description="setState accepts a path of keys, an updater function, or a combination."
      >
        <CodeBlock
          language="tsx"
          code={`const [state, setState] = createStore({ count: 0, list: ['a', 'b'] });

// Direct value
setState('count', 5);

// Functional update (receives current value)
setState('count', c => c + 1);

// Deep nested path
setState('user', 'address', 'city', 'London');

// Array item by index
setState('list', 1, 'London');

// All array items matching a predicate
setState('items', item => item.done, 'archived', true);`}
        />
      </PatternSection>

      <PatternSection
        title="produce() — immer-style mutations"
        description="produce() allows writing imperative mutation code. It uses a draft that gets applied immutably."
      >
        <CodeBlock
          language="tsx"
          code={`import { createStore, produce } from 'solid-js/store';

const [todos, setTodos] = createStore([
  { id: 1, text: 'Learn SolidJS', done: false },
  { id: 2, text: 'Build something', done: false }
]);

// Mutate multiple things at once
setTodos(produce(draft => {
  draft[0].done = true;
  draft.push({ id: 3, text: 'Ship it!', done: false });
  draft.splice(1, 1); // remove index 1
}));`}
        />
      </PatternSection>

      <PatternSection
        title="reconcile() — replace from external data"
        description="reconcile diffs incoming data against the existing store, updating only changed parts."
      >
        <CodeBlock
          language="tsx"
          code={`import { createStore, reconcile } from 'solid-js/store';

const [data, setData] = createStore({ items: [] });

async function refresh() {
  const fresh = await fetchItems();

  // Diff against existing — minimal updates
  setData('items', reconcile(fresh));
}
// vs setData('items', fresh) — replaces everything, loses reactivity`}
        />
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
