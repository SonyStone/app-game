import { type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';

// ============================================================================
// MARK: Components Page
// ============================================================================

export default function ComponentsPage(): JSX.Element {
  return (
    <PatternLayout
      title="Component Patterns"
      badge="Components"
      description="Best practices for defining props, passing children, splitting props, and building reusable components in SolidJS."
    >
      <PatternSection
        title="Props & type definitions"
        description="Use type aliases (not interfaces). For exported components, define props type separately."
      >
        <CodeBlock
          language="tsx"
          code={`// ✅ Internal component — inline props
function Avatar(props: { name: string; size?: number }): JSX.Element {
  return <img src={avatar(props.name)} width={props.size ?? 32} />;
}

// ✅ Exported component — separate type
export type ButtonProps = {
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  children: JSX.Element;
  onClick?: () => void;
};

export function Button(props: ButtonProps): JSX.Element {
  return (
    <button disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}`}
        />
      </PatternSection>

      <PatternSection
        title="splitProps"
        description="splitProps separates your component's own props from props to forward. Essential for avoiding unknown DOM attribute warnings."
      >
        <CodeBlock
          language="tsx"
          code={`import { splitProps } from 'solid-js';

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input(props: InputProps): JSX.Element {
  // Split out 'label' — forward rest to <input>
  const [local, rest] = splitProps(props, ['label']);

  return (
    <div>
      {local.label && <label>{local.label}</label>}
      <input {...rest} />
    </div>
  );
}`}
        />
      </PatternSection>

      <PatternSection
        title="mergeProps — default values"
        description="mergeProps safely merges props with defaults, preserving reactivity of the original props."
      >
        <CodeBlock
          language="tsx"
          code={`import { mergeProps } from 'solid-js';

type CardProps = {
  title?: string;
  variant?: 'default' | 'outlined';
  children: JSX.Element;
};

export function Card(props: CardProps): JSX.Element {
  // Props with defaults — reactive to changes
  const merged = mergeProps({ variant: 'default' as const, title: 'Card' }, props);

  return (
    <div class={merged.variant === 'outlined' ? 'border' : 'bg-neutral-800'}>
      <h3>{merged.title}</h3>
      {merged.children}
    </div>
  );
}
// ❌ Don't use JS destructuring defaults — breaks reactivity:
// function Card({ title = 'Card', ...props }) { ... }`}
        />
      </PatternSection>

      <Callout type="danger" title="Never destructure props">
        Destructuring SolidJS props breaks reactivity because JSX accesses property getters lazily. Always use{' '}
        <code class="rounded bg-white/10 px-1">props.value</code> or{' '}
        <code class="rounded bg-white/10 px-1">splitProps</code> /{' '}
        <code class="rounded bg-white/10 px-1">mergeProps</code>.
      </Callout>

      <PatternSection
        title="children helper"
        description="Use the children() helper when you need to evaluate or inspect children — it memoizes them properly."
      >
        <CodeBlock
          language="tsx"
          code={`import { children, type JSX } from 'solid-js';

type RowProps = { children: JSX.Element };

function Row(props: RowProps): JSX.Element {
  // Memoize children — resolves lazy children/fragments
  const resolved = children(() => props.children);

  // Can now inspect/map resolved children
  const count = () => {
    const c = resolved();
    return Array.isArray(c) ? c.length : c ? 1 : 0;
  };

  return (
    <div>
      <span class="badge">{count()} items</span>
      {resolved()}
    </div>
  );
}`}
        />
      </PatternSection>

      <PatternSection
        title="Component as prop"
        description="Pass components as props using the Component<Props> type or JSX.Element for static content."
      >
        <CodeBlock
          language="tsx"
          code={`import { type Component, type JSX } from 'solid-js';

type ListProps<T> = {
  items: T[];
  renderItem: (item: T, index: () => number) => JSX.Element;
  fallback?: JSX.Element;
};

function List<T>(props: ListProps<T>): JSX.Element {
  return (
    <For each={props.items} fallback={props.fallback ?? <p>No items</p>}>
      {props.renderItem}
    </For>
  );
}

// Usage
<List
  items={users}
  renderItem={(user) => <UserCard name={user.name} />}
/>`}
        />
      </PatternSection>
    </PatternLayout>
  );
}
