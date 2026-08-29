<Header>

# Stores <Badge>State</Badge>

<Description>
  createStore provides fine-grained reactivity for nested objects and arrays. Solid 2 uses storePath for targeted
  updates and draft callbacks for grouped mutations.
</Description>

</Header>

<Section>

## createStore basics

`createStore` returns a reactive proxy and a setter. Import it from `solid-js` in Solid 2.

```ts
import { createStore, storePath } from 'solid-js';

const [state, setState] = createStore({
  user: { name: 'Alice', age: 30 },
  items: [
    { id: 1, done: false },
    { id: 2, done: true }
  ]
});

console.log(state.user.name);
setState(storePath('user', 'name', 'Bob'));
setState(storePath('items', 0, 'done', true));
```

</Section>

<Section>

## Live Demo

<StoreDemo />

</Section>

<Section>

## storePath

`storePath` describes a focused update. Its final argument can be a value or an updater function.

```ts
setState(storePath('count', 5));
setState(storePath('count', (count) => count + 1));
setState(storePath('user', 'address', 'city', 'London'));
setState(storePath('list', 1, 'London'));
setState(storePath('items', (item) => item.done, 'archived', true));
```

</Section>

<Section>

## Draft callbacks

Pass a callback directly to the store setter when several mutations belong to one update. This replaces the Solid 1
mutation wrapper.

```ts
const [todos, setTodos] = createStore([
  { id: 1, text: 'Learn Solid 2', done: false },
  { id: 2, text: 'Build something', done: false }
]);

setTodos((draft) => {
  draft[0].done = true;
  draft.push({ id: 3, text: 'Ship it!', done: false });
  draft.splice(1, 1);
});
```

</Section>

<Section>

## reconcile external data

`reconcile` diffs incoming data against the existing store and preserves unchanged reactive nodes.

```ts
import { createStore, reconcile } from 'solid-js';

const [data, setData] = createStore({ items: [] });

async function reload() {
  const fresh = await fetchItems();
  setData(reconcile({ items: fresh }));
}
```

</Section>

<Callout type="warning" title="Don't destructure store values">
  Destructuring a store loses reactivity. Read nested values through the store proxy: `state.user.name`.
</Callout>
