import { createMemo, createSignal } from 'solid-js';

const [items, setItems] = createSignal([1, 2, 3, 4, 5]);

// ❌ Inline — recomputes every time the JSX reads it (may run twice)
// Also re-runs on EVERY render, even if items didn't change
return <div>{items().filter((x) => x > 2).length} items</div>;

// ✅ Memo — computed once per change, cached for multiple reads
const bigItems = createMemo(() => items().filter((x) => x > 2));
return (
  <div>
    {bigItems().length} items over 2{/* bigItems() can be called multiple times — same cached result */}
  </div>
);
