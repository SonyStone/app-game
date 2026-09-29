# parseServerFunctionActionUrl / serverFunctionActionUrl / serverFunctionUrl

Reads the function id back out of a server-rendered action url.

## Import

```ts
import {
	parseServerFunctionActionUrl,
	serverFunctionActionUrl,
	serverFunctionUrl,
} from "@solidjs/web/server-functions";
```

## `parseServerFunctionActionUrl`

### Type signature

```ts
function parseServerFunctionActionUrl(url: string): string | null;
```

### Parameters

#### `url`

* **Type:** `string`

## `serverFunctionActionUrl`

The plain-HTTP address of a function: `<endpoint>/<id>[?args=...]`.

### Type signature

```ts
function serverFunctionActionUrl(
	fn: ServerFunction | string,
	...boundArgs: readonly unknown[]
): string;
```

### Parameters

#### `fn`

* **Type:** `ServerFunction | string`

#### `boundArgs`

* **Type:** `readonly unknown[]`

## `serverFunctionUrl`

Builds a server-function URL, optionally with JSON-safe bound arguments.

### Type signature

```ts
function serverFunctionUrl<A extends readonly unknown[]>(
	fn: ServerFunction<A, any>,
	...args: A
): string;
```

### Parameters

#### `fn`

* **Type:** `ServerFunction<A, any>`

#### `args`

* **Type:** `A`
