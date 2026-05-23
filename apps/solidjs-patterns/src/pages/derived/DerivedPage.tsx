import { createMemo, createSignal, type JSX } from 'solid-js';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { createPatternMarkdownComponents } from '../markdown-components';
import DerivedContent from './derived.md?markdown';

// ============================================================================
// MARK: Derived Page
// ============================================================================

export default function DerivedPage(): JSX.Element {
  return <DerivedContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents({
  MemoDemo
});

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
      <p class="text-xs text-slate-500">Hypotenuse = √(a² + b²)</p>
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400">a =</span>
          <Button size="sm" variant="outline" onClick={() => setA((v) => v - 1)}>
            −
          </Button>
          <span class="text-basetext-violet-300 w-6 text-center font-mono">{a()}</span>
          <Button size="sm" variant="outline" onClick={() => setA((v) => v + 1)}>
            +
          </Button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400">b =</span>
          <Button size="sm" variant="outline" onClick={() => setB((v) => v - 1)}>
            −
          </Button>
          <span class="text-basetext-violet-300 w-6 text-center font-mono">{b()}</span>
          <Button size="sm" variant="outline" onClick={() => setB((v) => v + 1)}>
            +
          </Button>
        </div>
      </div>
      <div class="rounded-lg bg-slate-950 p-3 font-mono text-sm">
        <span class="text-slate-500">hypotenuse = </span>
        <span class="text-green-400">{hypotenuse().toFixed(4)}</span>
      </div>
    </Card>
  );
}
