# @solid-primitives/db-store

Source version: `1.1.4`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/db-store/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


A primitive that creates a synchronized store from a database:

`createDbStore` - creates a store synchronized to a database.
`supabaseAdapter` - adapter for [supabase](https://supabase.com/) database connections to synchronize stores from.

## Installation

```bash
npm install @solid-primitives/db-store
# or
yarn add @solid-primitives/db-store
# or
pnpm add @solid-primitives/db-store
```

## How to use it

```ts
const [dbStore, setDbStore] = createDbStore({
  adapter: supabaseAdapter(client),
  table: "todos",
  defaultFields: ['id', 'userid']
  filter: ({ userid }) => userid === user.id,
  onError: handleErrors,
});
```

The store is automatically initialized and optimistically updated both ways. Due to how databases work, the store can only ever contain an array of entries.

> [!WARNING]
> Since the order of items in the database cannot be guaranteed, the same is true for the items in the store.

> [!NOTE]
> It can take some time for the database editor to show updates. They are processed a lot faster.

### Handling default fields

The `id` field needs to be set by the database, so even if you set it, it needs to be overwritten in any case. There might be other fields that the server sets by default, e.g. a user ID. It is not required to set those for your rows manually; one can also treat its absence as a sign that an insertion is not yet done in the database.

By default, only 'id' is handled as default field. If you have additional default fields, you need to use the `defaultField` option to convey them; otherwise default fields not set by the client might break the reconciliation of newly added fields.

### Handling errors

If any change could not be successfully committed to the database, the `onError` handler is called with an Error. If the caught error was an error itself, it is used directly, else what was encountered will be set as cause for an Error "unknown error". The error will also be augmented with a "data" property containing the update, an "action" property containing "insert", "update" or "delete" and a "server" flag property that is true if the error happened while sending data to the server.

### Write your own adapter

Your adapter must have the following properties:

```tsx
export type DbAdapterUpdate<Row extends DbRow> = { old?: Partial<Row>; new?: Partial<Row> };

export type DbAdapter<Row> = {
  insertSignal: () => DbAdapterUpdate<Row> | undefined;
  updateSignal: () => DbAdapterUpdate<Row> | undefined;
  deleteSignal: () => DbAdapterUpdate<Row> | undefined;
  init: () => Promise<Row[]>;
  insert: (data: DbAdapterUpdate<Row>) => PromiseLike<any>;
  update: (data: DbAdapterUpdate<Row>) => PromiseLike<any>;
  delete: (data: DbAdapterUpdate<Row>) => PromiseLike<any>;
};
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/db-store/CHANGELOG.md)

## Plans

This is an early draft; in the future, more adapters are planned: mongodb, prism, firebase, aws?
