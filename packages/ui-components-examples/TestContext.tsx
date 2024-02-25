import { createContext, useContext } from 'solid-js';
import { JSX } from 'solid-js/jsx-runtime';
import { createStore } from 'solid-js/store';

type Counter = [{
  count: number
}, {
  increment(): void,
  decrement(): void,
}]

export const CounterContext = createContext([{ count: 0 }, {}] as Counter);

interface Props extends JSX.HTMLAttributes<HTMLButtonElement> {
  count?: number,
}

export function CounterProvider(props: Props) {
  const [state, setState] = createStore({ count: props.count || 0 });
  const store = [
    state,
    {
      increment() {
        setState("count", (c) => c + 1);
      },
      decrement() {
        setState("count", (c) => c - 1);
      },
    },
  ] as Counter;

  return (
    <CounterContext.Provider value={store}>
      {props.children}
    </CounterContext.Provider>
  );
}

export function Counter() {
  const [state, { increment, decrement }] = useContext(CounterContext);

  return <button onClick={increment}>{state.count}</button>
}