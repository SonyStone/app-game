A component receives a props object through a call like `Comp(props)`. When a prop
comes from a signal or another getter, Solid tries to keep that access lazy instead of eagerly reading it at
the call site.

In simplified terms, JSX like `{'rotate={props.subsecond}'}` becomes a getter on the
props object. The component is then invoked through `untrack`, which avoids creating
an accidental subscription just because the component was called.

```ts
function Hand(props: { rotate: number; class?: string; length: number; width: number }) {
  return (
    <div
      class={props.class}
      style={{
        transform: `rotate(${props.rotate}deg)`,
        width: `${props.width}px`,
        height: `${props.length}px`
      }}
    />
  );
}

export function App(props: { subsecond: number }): JSX.Element {
  return <Hand rotate={props.subsecond} class="subsecond" length={85} width={5} />;
}

export function App2(props: { subsecond: number }): JSX.Element {
  return createComponent(Hand, {
    get rotate() {
      return props.subsecond;
    },
    class: 'subsecond',
    length: 85,
    width: 5
  });
}
```
