import { createEffect, createSignal } from 'solid-js';

import s from './CounterButton.module.css';

export function CounterButton() {
  const [count, setCount] = createSignal(0);

  console.log(`CounterButton update?`);

  const log = () => {
    console.log(`count`, count());
    return count();
  };

  createEffect(() => console.log('count =', count()));

  const html = (
    <p>
      <button class={s.button} type="button" onClick={() => setCount((count) => count + 1)}>
        count is: {log()}
      </button>
    </p>
  );

  return html;
}
