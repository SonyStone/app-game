# DragSensor API Experiments

This folder keeps alternative API shapes side by side. They share the same idea:
one drag scope/coordinator owns the active pointer session, and each target owns
its own source data and callbacks.

## 1. JSX Scope

File: `jsx.tsx`

Most ergonomic in component code. It uses `resolveFirst` to find the first child
`HTMLElement` and attaches `pointerdown` without changing the DOM shape.

```tsx
<DragSensorJSX.Scope threshold={6}>
  {(scope) => (
    <>
      <DragSensorJSX data={{ index }} onDragStart={onStart}>
        <button>Tab</button>
      </DragSensorJSX>

      <Proxy component={scope.activeSource()?.element} />
    </>
  )}
</DragSensorJSX.Scope>
```

Best when the target is naturally expressed as JSX.

## 2. Solid Primitive With Explicit Scope

File: `solid.ts`

Keeps JSX free of wrapper components. The caller creates a shared scope and binds
targets to refs.

```tsx
const scope = createDragSensorScope({ threshold: 6 });
let button!: HTMLButtonElement;

createDragSensorTarget(scope, () => button, {
  data: { index },
  onDragStart: onStart
});

return <button ref={button}>Tab</button>;
```

Best when several targets need one shared drag session and the caller wants the
scope object available.

## 3. Solid Primitive Without Explicit Scope

File: `solid.ts`

Creates a private scope internally. Shorter, but each call is isolated.

```tsx
let button!: HTMLButtonElement;

const sensor = createStandaloneDragSensorTarget(() => button, {
  data: { index },
  onDragStart: onStart
});

return <button ref={button}>Tab</button>;
```

Best for one-off draggable controls where multitarget coordination is not needed.

## 4. Ref Callback Binding

File: `solid.ts`

Returns a `ref` callback and the sensor handle together.

```tsx
const scope = createDragSensorScope({ threshold: 6 });
const drag = createDragSensorRef(
  {
    data: { index },
    onDragStart: onStart
  },
  scope
);

return <button ref={drag.ref}>Tab</button>;
```

Best when you want a self-contained object and do not want to declare `let ref`.

## 5. Single Function Binding

File: `solid.ts`

One entry point that accepts either a target accessor or returns a `ref` callback.

```tsx
const drag = createDragSensorBinding({
  scopeOptions: { threshold: 6 },
  data: { index },
  onDragStart: onStart
});

return <button ref={drag.ref}>Tab</button>;
```

Or with an existing shared scope:

```tsx
const scope = createDragSensorScope({ threshold: 6 });
const drag = createDragSensorBinding({
  scope,
  target: () => button,
  data: { index },
  onDragStart: onStart
});
```

Best as a convenience API, but it hides more decisions behind one function.

## 6. Directive Style

File: `solid.ts`

Uses Solid's `use:` directive pattern. The directive can be created with a shared
scope.

```tsx
const scope = createDragSensorScope({ threshold: 6 });
const dragSensor = createDragSensorDirective(scope);

return (
  <button use:dragSensor={{ data: { index }, onDragStart: onStart }}>
    Tab
  </button>
);
```

Best when you want markup to stay flat and declarative. The tradeoff is that
directive typing can be more awkward in app code.

## Current Lean

The JSX scope is the nicest consumer API for normal Solid components. The Solid
primitive with explicit scope is the clearest escape hatch. The single-function
binding is convenient, but maybe a little too magical.
