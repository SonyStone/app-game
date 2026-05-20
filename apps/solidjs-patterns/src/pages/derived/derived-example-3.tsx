import { createMemo, createSignal } from 'solid-js';

const [price, setPrice] = createSignal(100);
const [qty, setQty] = createSignal(3);
const [discount, setDiscount] = createSignal(0.1);

const subtotal = createMemo(() => price() * qty());
const discountAmt = createMemo(() => subtotal() * discount());
const total = createMemo(() => subtotal() - discountAmt());

// total only recomputes when price, qty, or discount changes
console.log(total());