<article>
  <header>

# Derived & Memo

    <Badge>Core</Badge>
    <Description>
      createMemo creates a derived reactive value that re-runs only when its dependencies change. Results are memoized
      and multiple reads return the cached value.
    </Description>

  </header>

  <section>

## createMemo

Memo tracks its reactive dependencies automatically. It only re-runs when a dependency changes and caches the result
between updates.

```tsx
import { createMemo, createSignal } from 'solid-js';

const [firstName, setFirstName] = createSignal('John');
const [lastName, setLastName] = createSignal('Doe');

// Only recomputes when firstName or lastName changes
const fullName = createMemo(() => `${firstName()} ${lastName()}`);

console.log(fullName()); // "John Doe"
setFirstName('Jane');
console.log(fullName()); // "Jane Doe" - recomputed
```

  </section>

  <section>

## Live Demo

    <MemoDemo />

  </section>

  <section>

## Memo vs Inline Expression

Use memo when the computation is expensive or when the result is read multiple times. Inline expressions recompute on
each read.

```tsx
import { createMemo, createSignal } from 'solid-js';

const [items, setItems] = createSignal([1, 2, 3, 4, 5]);

// Inline - recomputes every time the JSX reads it (may run twice)
// Also re-runs on EVERY render, even if items didn't change
return <div>{items().filter((x) => x > 2).length} items</div>;

// Memo - computed once per change, cached for multiple reads
const bigItems = createMemo(() => items().filter((x) => x > 2));
return (
  <div>
    {bigItems().length} items over 2{/* bigItems() can be called multiple times - same cached result */}
  </div>
);
```

  </section>

  <Callout type="tip" title="Memo = derived signal">
    Think of <code>createMemo</code> as a read-only signal whose value is derived from other reactive sources. It
    returns a getter just like <code>createSignal</code>.
  </Callout>

  <section>

## Chained Memos

Memos can depend on other memos, forming a reactive dependency graph.

```tsx
import { createMemo, createSignal } from 'solid-js';

const [price, setPrice] = createSignal(100);
const [qty, setQty] = createSignal(3);
const [discount, setDiscount] = createSignal(0.1);

const subtotal = createMemo(() => price() * qty());
const discountAmt = createMemo(() => subtotal() * discount());
const total = createMemo(() => subtotal() - discountAmt());

// total only recomputes when price, qty, or discount changes
console.log(total());
```

  </section>

  <section>

## Memo with equals

Control when downstream effects are notified by providing a custom equality check.

```tsx
import { createMemo, createSignal } from 'solid-js';

const [data, setData] = createSignal({ x: 1, y: 2, z: 3 });

// Only notify when x or y change - ignore z
const position = createMemo(() => ({ x: data().x, y: data().y }), undefined, {
  equals: (a, b) => a.x === b.x && a.y === b.y
});

console.log(position());
```

  </section>
</article>
