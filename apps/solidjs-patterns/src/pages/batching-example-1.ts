import { batch, createEffect, createSignal } from 'solid-js';

const [x, setX] = createSignal(0);
const [y, setY] = createSignal(0);

createEffect(() => console.log(x(), y()));

// ❌ Without batch — effect runs twice
setX(1); // effect: 1, 0
setY(1); // effect: 1, 1

// ✅ With batch — effect runs once
batch(() => {
  setX(2); // queued
  setY(2); // queued
}); // effect: 2, 2 (single run)
