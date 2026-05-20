import { createSignal, Match, Show, Switch, type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { PatternLayout, PatternSection } from '../components/PatternLayout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

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
        <CodeBlock
          language="tsx"
          code={`import { Show } from 'solid-js';

// Basic condition
<Show when={isLoggedIn()}>
  <UserPanel />
</Show>

// With fallback
<Show when={user()} fallback={<LoginButton />}>
  {(u) => <UserPanel name={u().name} />}
  {/* Callback form — u() is narrowed (non-null) */}
</Show>

// ⚠ Avoid ternary for components — Show re-mounts on changes
// Bad: {condition() ? <HeavyComponent /> : null}
// Good: <Show when={condition()}><HeavyComponent /></Show>`}
        />
      </PatternSection>

      <PatternSection
        title="For vs Index"
        description="For re-creates items when the array changes (key by reference). Index is stable by position — good for static-length arrays."
      >
        <CodeBlock
          language="tsx"
          code={`import { For, Index } from 'solid-js';

// For — keyed by item identity (reference)
// Good for: lists that add/remove/reorder items
<For each={items()}>
  {(item, index) => (
    <li>{index() + 1}. {item.name}</li>
    // item is the value, index is an Accessor<number>
  )}
</For>

// Index — keyed by array position
// Good for: fixed-length lists, primitive arrays
<Index each={scores()}>
  {(score, index) => (
    // score is an Accessor (reactive), index is a number
    <span>#{index}: {score()}</span>
  )}
</Index>`}
        />
      </PatternSection>

      <PatternSection title="Switch / Match">
        <CodeBlock
          language="tsx"
          code={`import { Switch, Match } from 'solid-js';

// Switch renders the first matching Match
<Switch fallback={<p>Unknown status</p>}>
  <Match when={status() === 'loading'}>
    <Spinner />
  </Match>
  <Match when={status() === 'error'}>
    <ErrorMsg message={error()} />
  </Match>
  <Match when={status() === 'success'}>
    <DataView data={data()} />
  </Match>
</Switch>`}
        />
      </PatternSection>

      <PatternSection title="Dynamic" description="Render a component or HTML element determined at runtime.">
        <CodeBlock
          language="tsx"
          code={`import { Dynamic } from 'solid-js/web';

const [tag, setTag] = createSignal<'h1' | 'h2' | 'p'>('h1');

// Renders different elements based on tag()
<Dynamic component={tag()} class="heading">
  Hello World
</Dynamic>

// Works with components too
const widgets = { button: ButtonWidget, input: InputWidget };
<Dynamic component={widgets[type()]} {...widgetProps} />`}
        />
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
