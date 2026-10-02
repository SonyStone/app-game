<Header>

# Stores <Badge>State</Badge>

<Description>
  createStore provides fine-grained reactivity for nested objects and arrays. Solid 2 updates stores by mutating a
  draft inside the setter callback.
</Description>

</Header>

<Section>

## createStore basics

`createStore` returns a reactive proxy and a setter. Import it from `solid-js` in Solid 2.

```ts
import { createStore } from 'solid-js';

const [state, setState] = createStore({
  user: { name: 'Alice', age: 30 },
  items: [
    { id: 1, done: false },
    { id: 2, done: true }
  ]
});

console.log(state.user.name);
setState((draft) => {
  draft.user.name = 'Bob';
});
setState((draft) => {
  draft.items[0].done = true;
});
```

</Section>

<Section>

## Live Demo

<StoreDemo />

</Section>

<Section>

## Targeted updates

A focused update writes one path of the draft. Only computations that read that path re-run. Solid 2 removed the
`storePath` helper, which emulated the Solid 1 `setState('user', 'name', value)` form; plain draft writes cover the
same cases.

```ts
setState((draft) => {
  draft.count = 5;
});
setState((draft) => {
  draft.count += 1;
});
setState((draft) => {
  draft.user.address.city = 'London';
});
setState((draft) => {
  draft.list[1] = 'London';
});
setState((draft) => {
  for (const item of draft.items) {
    if (item.done) {
      item.archived = true;
    }
  }
});
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
