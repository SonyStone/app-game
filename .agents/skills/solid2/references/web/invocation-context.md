# getServerFunctionInvocation

Returns the identity of the server function that is currently executing.

## Import

```ts
import { getServerFunctionInvocation } from "@solidjs/web/server-functions";
```

## Type signature

```ts
function getServerFunctionInvocation(): ServerFunctionInvocation | undefined;
```

## Related types

### `ServerFunctionInvocation`

Identity of the currently executing server function call — see the
server entry. Named here so isomorphic code can import the type from
either entry.

```ts
interface ServerFunctionInvocation {
	id: string;
}
```

#### `id`

* **Type:** `string`
