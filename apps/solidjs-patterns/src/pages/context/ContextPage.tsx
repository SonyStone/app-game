import { createContext, createSignal, useContext, type JSX } from 'solid-js';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { createPatternMarkdownComponents } from '../markdown-components';
import ContextContent from './context.md?markdown';

// ============================================================================
// MARK: Context Page
// ============================================================================

export default function ContextPage(): JSX.Element {
  return <ContextContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents({
  ContextDemo
});

// ============================================================================
// MARK: Live Demo
// ============================================================================

type CounterCtx = { count: () => number; inc: () => void; dec: () => void };
const DemoContext = createContext<CounterCtx>();

function DemoProvider(props: { children: JSX.Element }): JSX.Element {
  const [count, setCount] = createSignal(0);
  return (
    <DemoContext.Provider value={{ count, inc: () => setCount((c) => c + 1), dec: () => setCount((c) => c - 1) }}>
      {props.children}
    </DemoContext.Provider>
  );
}

function CounterDisplay(): JSX.Element {
  const ctx = useContext(DemoContext)!;
  return (
    <div class="flex items-center gap-3 rounded-lg bg-neutral-800/50 px-4 py-3">
      <span class="text-xs text-neutral-500">CounterDisplay reads context:</span>
      <span class="font-mono text-lg font-bold text-violet-300">{ctx.count()}</span>
    </div>
  );
}

function CounterButtons(): JSX.Element {
  const ctx = useContext(DemoContext)!;
  return (
    <div class="flex gap-2">
      <Button size="sm" variant="outline" onClick={ctx.dec}>
        −
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.inc}>
        +
      </Button>
    </div>
  );
}

function ContextDemo(): JSX.Element {
  return (
    <Card>
      <DemoProvider>
        <div class="flex flex-col gap-3">
          <p class="text-xs text-neutral-500">
            Both components below consume from the same <code class="rounded bg-white/10 px-1">DemoContext</code> — no
            prop drilling.
          </p>
          <CounterDisplay />
          <CounterButtons />
        </div>
      </DemoProvider>
    </Card>
  );
}
