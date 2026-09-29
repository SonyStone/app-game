# Server integration

## Import

```ts
import {
	createFlightDataCollector,
	type FlightDataCollectorOptions,
} from "@solidjs/router/server";
```

Keep this server-only entry out of client bundles.
The server entry imports the request-event storage integration.

## `createFlightDataCollector`

Creates the `collectFlightData` hook for the Solid server-function handler.

```ts
function createFlightDataCollector(
	options: FlightDataCollectorOptions | RouterInstanceLike
): CollectFlightDataHook;
```

Pass a `createRouter` instance:

```ts
const collectFlightData = createFlightDataCollector(Router);
```

Or pass an options object:

```ts
interface FlightDataCollectorOptions {
	routes:
		| RouteDefinition
		| readonly RouteDefinition[]
		| (() => RouteDefinition | readonly RouteDefinition[]);
	rootPreload?: RoutePreloadFunc;
	base?: string;
}
```

`routes` can be built lazily by a thunk.
`rootPreload` corresponds to the router config's `preload`.
`base` corresponds to the router config's `base`.

## Register with server functions

```ts
import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server";

configureServerFunctionsServer({
	collectFlightData: createFlightDataCollector(Router),
});
```

The collector:

1. Reads the target and revalidation keys from the server-function outcome.
2. Resolves lazy route subtrees matched by the previous or target URL.
3. Runs the root preload with `intent: "initial"`.
4. Runs target route preloads with `intent: "preload"`.
5. Returns collected keyed query values.

Returns `undefined` when the outcome has no target URL or no collected values.
The collector logs errors from lazy resolution or preload collection.
The errors do not replace the mutation outcome.

The server-function handler folds the returned data into the mutation response.
A mounted client router consumes the data when single flight is enabled.

## Types

The server entry re-exports:

```ts
type CollectFlightDataHook;
type ServerFunctionOutcome;
```

`CollectFlightDataHook` and `ServerFunctionOutcome` originate from `@solidjs/web/server-functions/server`.

## Related

* [Data APIs](data.md)
* [`createRouter`](router-factory.md#createrouter)
