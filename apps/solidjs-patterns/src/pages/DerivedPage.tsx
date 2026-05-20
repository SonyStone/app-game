import { createMemo, createSignal, type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

// ============================================================================
// MARK: Derived Page
// ============================================================================

export default function DerivedPage(): JSX.Element {
  return (
    <PatternLayout
      title="Derived & Memo"
      badge="Core"
      description="createMemo creates a derived reactive value that re-runs only when its dependencies change. Results are memoized — multiple reads return the cached value."
    >
      <PatternSection
        title="createMemo"
        description="Memo tracks its reactive dependencies automatically. It only re-runs when a dependency changes, and caches the result between updates."
      >
        <CodeBlock
          language="tsx"
          code={`import { createSignal, createMemo } from 'solid-js';

const [firstName, setFirstName] = createSignal('John');
const [lastName, setLastName] = createSignal('Doe');

// Only recomputes when firstName or lastName changes
const fullName = createMemo(() => \`\${firstName()} \${lastName()}\`);

console.log(fullName()); // "John Doe"
setFirstName('Jane');
console.log(fullName()); // "Jane Doe" — recomputed`}
        />
      </PatternSection>

      <PatternSection title="Live Demo">
        <MemoDemo />
      </PatternSection>

      <PatternSection
        title="Memo vs Inline Expression"
        description="Use memo when the computation is expensive or when the result is read multiple times. Inline expressions recompute on each read."
      >
        <CodeBlock
          language="tsx"
          code={`const [items, setItems] = createSignal([1, 2, 3, 4, 5]);

// ❌ Inline — recomputes every time the JSX reads it (may run twice)
// Also re-runs on EVERY render, even if items didn't change
return <div>{items().filter(x => x > 2).length} items</div>;

// ✅ Memo — computed once per change, cached for multiple reads
const bigItems = createMemo(() => items().filter(x => x > 2));
return (
  <div>
    {bigItems().length} items over 2
    {/* bigItems() can be called multiple times — same cached result */}
  </div>
);`}
        />
      </PatternSection>

      <Callout type="tip" title="Memo = derived signal">
        Think of <code class="rounded bg-white/10 px-1">createMemo</code> as a read-only signal whose value is derived
        from other reactive sources. It returns a getter just like{' '}
        <code class="rounded bg-white/10 px-1">createSignal</code>.
      </Callout>

      <PatternSection
        title="Chained Memos"
        description="Memos can depend on other memos, forming a reactive dependency graph."
      >
        <CodeBlock
          language="tsx"
          code={`const [price, setPrice] = createSignal(100);
const [qty, setQty] = createSignal(3);
const [discount, setDiscount] = createSignal(0.1);

const subtotal = createMemo(() => price() * qty());         // 300
const discountAmt = createMemo(() => subtotal() * discount()); // 30
const total = createMemo(() => subtotal() - discountAmt());    // 270

// total only recomputes when price, qty, or discount changes`}
        />
      </PatternSection>

      <PatternSection
        title="Memo with equals"
        description="Control when downstream effects are notified by providing a custom equality check."
      >
        <CodeBlock
          language="tsx"
          code={`const [data, setData] = createSignal({ x: 1, y: 2, z: 3 });

// Only notify when x or y change — ignore z
const position = createMemo(
  () => ({ x: data().x, y: data().y }),
  undefined,
  { equals: (a, b) => a.x === b.x && a.y === b.y }
);`}
        />
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

function MemoDemo(): JSX.Element {
  const [a, setA] = createSignal(3);
  const [b, setB] = createSignal(4);
  let memoCallCount = 0;

  const hypotenuse = createMemo(() => {
    memoCallCount++;
    return Math.sqrt(a() ** 2 + b() ** 2);
  });

  const [renderCount, setRenderCount] = createSignal(0);

  return (
    <Card class="flex flex-col gap-4">
      <p class="text-xs text-neutral-500">Hypotenuse = √(a² + b²)</p>
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-xs text-neutral-400">a =</span>
          <Button size="sm" variant="outline" onClick={() => setA((v) => v - 1)}>
            −
          </Button>
          <span class="w-6 text-center font-mono text-sm text-violet-300">{a()}</span>
          <Button size="sm" variant="outline" onClick={() => setA((v) => v + 1)}>
            +
          </Button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-neutral-400">b =</span>
          <Button size="sm" variant="outline" onClick={() => setB((v) => v - 1)}>
            −
          </Button>
          <span class="w-6 text-center font-mono text-sm text-violet-300">{b()}</span>
          <Button size="sm" variant="outline" onClick={() => setB((v) => v + 1)}>
            +
          </Button>
        </div>
      </div>
      <div class="rounded-lg bg-neutral-950 p-3 font-mono text-sm">
        <span class="text-neutral-500">hypotenuse = </span>
        <span class="text-green-400">{hypotenuse().toFixed(4)}</span>
      </div>
    </Card>
  );
}
