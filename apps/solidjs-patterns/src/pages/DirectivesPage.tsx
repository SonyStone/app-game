import { type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';

// ============================================================================
// MARK: Directives Page
// ============================================================================

export default function DirectivesPage(): JSX.Element {
  return (
    <PatternLayout
      title="Directives"
      badge="Advanced"
      description="SolidJS directives are functions that run on DOM element creation, providing a clean way to attach imperative behavior."
    >
      <PatternSection
        title="Creating a directive"
        description="A directive is a function (el, accessor) where el is the DOM element and accessor returns the value passed to use:directiveName."
      >
        <CodeBlock
          language="tsx"
          code={`import { Accessor } from 'solid-js';

// Must declare the type for TypeScript
declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      clickOutside: () => void;
    }
  }
}

// Directive function
function clickOutside(el: Element, accessor: Accessor<() => void>) {
  const handler = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) accessor()?.();
  };
  document.addEventListener('click', handler);
  onCleanup(() => document.removeEventListener('click', handler));
}

// Usage
function Dropdown() {
  const [open, setOpen] = createSignal(false);
  return (
    <div use:clickOutside={() => setOpen(false)}>
      ...
    </div>
  );
}`}
        />
      </PatternSection>

      <PatternSection
        title="Directives with options"
        description="Pass an options object or reactive value through the use: prop."
      >
        <CodeBlock
          language="tsx"
          code={`declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      tooltip: { text: string; position?: 'top' | 'bottom' };
    }
  }
}

function tooltip(el: HTMLElement, accessor: Accessor<{ text: string; position?: string }>) {
  createEffect(() => {
    const opts = accessor();
    el.title = opts.text;
    // reactive — updates when opts changes
  });
}

// Usage
<button use:tooltip={{ text: 'Save document', position: 'top' }}>
  Save
</button>`}
        />
      </PatternSection>

      <PatternSection title="autoFocus directive" description="A simple directive to focus an element on mount.">
        <CodeBlock
          language="tsx"
          code={`declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      autoFocus: boolean;
    }
  }
}

function autoFocus(el: HTMLElement, accessor: Accessor<boolean>) {
  createEffect(() => {
    if (accessor()) el.focus();
  });
}

// Usage
<input use:autoFocus={true} placeholder="Auto-focused" />`}
        />
      </PatternSection>

      <Callout type="info" title="Import directives to prevent tree-shaking">
        If a directive is imported but only used in JSX (via <code class="rounded bg-white/10 px-1">use:</code>), some
        bundlers may tree-shake it. Import it explicitly:{' '}
        <code class="rounded bg-white/10 px-1">import './directives/clickOutside'</code> or reference it in a variable
        to keep it alive.
      </Callout>
    </PatternLayout>
  );
}
