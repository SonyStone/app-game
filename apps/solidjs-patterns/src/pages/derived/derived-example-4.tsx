import { createMemo, createSignal } from 'solid-js';

const [data, setData] = createSignal({ x: 1, y: 2, z: 3 });

// Only notify when x or y change — ignore z
const position = createMemo(() => ({ x: data().x, y: data().y }), undefined, {
  equals: (a, b) => a.x === b.x && a.y === b.y
});

console.log(position());
