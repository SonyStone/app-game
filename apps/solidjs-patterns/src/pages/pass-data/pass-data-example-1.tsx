import { JSX } from 'solid-js';
import { createComponent } from 'solid-js/web';

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
