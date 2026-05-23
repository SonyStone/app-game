<Page
title="Stores"
badge="State"
description="createStore provides fine-grained reactivity for nested objects and arrays. Only the specific paths that change trigger updates."

>

  <Section
    title="createStore basics"
    description="createStore returns a reactive proxy (getter) and a setter. Nested property access is tracked."
  >

```ts
import { createStore } from 'solid-js/store';

const [state, setState] = createStore({
  user: { name: 'Alice', age: 30 },
  items: [
    { id: 1, done: false },
    { id: 2, done: true }
  ]
});

// Read nested values (tracked reactively)
console.log(state.user.name); // 'Alice'
console.log(state.items[0].done); // false

// Update specific path - only that path's subscribers re-run
setState('user', 'name', 'Bob');
setState('items', 0, 'done', true);
```

  </Section>

  <Section title="Live Demo">
    <StoreDemo />
  </Section>

  <Section
    title="Path syntax"
    description="setState accepts a path of keys, an updater function, or a combination."
  >

```ts
const [state, setState] = createStore({ count: 0, list: ['a', 'b'] });

// Direct value
setState('count', 5);

// Functional update (receives current value)
setState('count', (c) => c + 1);

// Deep nested path
setState('user', 'address', 'city', 'London');

// Array item by index
setState('list', 1, 'London');

// All array items matching a predicate
setState('items', (item) => item.done, 'archived', true);
```

  </Section>

  <Section
    title="produce() - immer-style mutations"
    description="produce() allows writing imperative mutation code. It uses a draft that gets applied immutably."
  >

```ts
import { createStore, produce } from 'solid-js/store';

const [todos, setTodos] = createStore([
  { id: 1, text: 'Learn SolidJS', done: false },
  { id: 2, text: 'Build something', done: false }
]);

// Mutate multiple things at once
setTodos(
  produce((draft) => {
    draft[0].done = true;
    draft.push({ id: 3, text: 'Ship it!', done: false });
    draft.splice(1, 1); // remove index 1
  })
);
```

  </Section>

  <Section
    title="reconcile() - replace from external data"
    description="reconcile diffs incoming data against the existing store, updating only changed parts."
  >

```ts
import { createStore, reconcile } from 'solid-js/store';

const [data, setData] = createStore({ items: [] });

async function refresh() {
  const fresh = await fetchItems();

  // Diff against existing - minimal updates
  setData('items', reconcile(fresh));
}
// vs setData('items', fresh) - replaces everything, loses reactivity
```

  </Section>

  <Callout type="warning" title="Don't destructure store values">
    Destructuring a store loses reactivity. Always access nested values through the store proxy:
    <br />
    <code>const {'{'} name {'}'} = state.user</code> - breaks
    <br />
    <code>state.user.name</code> - works
  </Callout>
</Page>
