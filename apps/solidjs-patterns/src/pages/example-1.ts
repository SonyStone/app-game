import { createMemo, createSignal } from 'solid-js';

const [firstName, setFirstName] = createSignal('John');
const [lastName, setLastName] = createSignal('Doe');

// Only recomputes when firstName or lastName changes
const fullName = createMemo(() => `${firstName()} ${lastName()}`);

console.log(fullName()); // "John Doe"
setFirstName('Jane');
console.log(fullName()); // "Jane Doe" — recomputed
