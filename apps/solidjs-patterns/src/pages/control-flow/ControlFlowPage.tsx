import { createSignal, Match, Show, Switch, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { PatternLayout, PatternSection } from '../../components/PatternLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './control-flow-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './control-flow-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './control-flow-example-3.txt?shiki&lang=tsx';
import example4Html, {
  code as example4Code,
  language as example4Language
} from './control-flow-example-4.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Control Flow Page
// ============================================================================

export default function ControlFlowPage(): JSX.Element {
  return (
    <PatternLayout
      title="Control Flow"
      badge="Components"
      description="SolidJS provides built-in control flow components that work with its fine-grained reactivity system more efficiently than JS conditional expressions."
    >
      <PatternSection
        title="Show"
        description="Conditionally render content. The fallback prop renders when the condition is false."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="For vs Index"
        description="For re-creates items when the array changes (key by reference). Index is stable by position — good for static-length arrays."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Switch / Match">
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Dynamic" description="Render a component or HTML element determined at runtime.">
        <CodeBlock language={example4Language} code={example4Code}>
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Live Demo: Show & Switch">
        <ControlFlowDemo />
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

type Status = 'idle' | 'loading' | 'success' | 'error';

function ControlFlowDemo(): JSX.Element {
  const [status, setStatus] = createSignal<Status>('idle');
  const [showDetails, setShowDetails] = createSignal(false);

  const simulate = async (outcome: 'success' | 'error') => {
    setStatus('loading');
    await new Promise((r) => setTimeout(r, 800));
    setStatus(outcome);
  };

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setStatus('idle')}>
          Reset
        </Button>
        <Button size="sm" variant="default" onClick={() => simulate('success')}>
          Simulate Success
        </Button>
        <Button size="sm" variant="outline" onClick={() => simulate('error')}>
          Simulate Error
        </Button>
      </div>

      <Switch fallback={<StatusBadge label="idle" variant="secondary" />}>
        <Match when={status() === 'loading'}>
          <StatusBadge label="loading…" variant="warning" />
        </Match>
        <Match when={status() === 'success'}>
          <div class="flex flex-col gap-2">
            <StatusBadge label="success" variant="success" />
            <button
              class="self-start text-xs text-violet-400 hover:underline"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails() ? 'hide' : 'show'} details
            </button>
            <Show when={showDetails()}>
              <div class="rounded-lg bg-neutral-950 p-3 text-xs text-green-400">✓ Data loaded successfully</div>
            </Show>
          </div>
        </Match>
        <Match when={status() === 'error'}>
          <StatusBadge label="error" variant="destructive" />
        </Match>
      </Switch>
    </Card>
  );
}

function StatusBadge(props: {
  label: string;
  variant: 'secondary' | 'warning' | 'success' | 'destructive';
}): JSX.Element {
  return (
    <div class="flex items-center gap-2">
      <span class="text-xs text-neutral-500">status:</span>
      <Badge variant={props.variant}>{props.label}</Badge>
    </div>
  );
}
