import { For, type JSX } from 'solid-js';
import { template } from 'solid-js/web';

import OverviewContent from './overview.mdx?markdown';

type MetricTone = 'teal' | 'blue' | 'amber' | 'rose';

interface OverviewMetric {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: MetricTone;
}

interface DiagramNode {
  readonly title: string;
  readonly detail: string;
}

interface DiagramColumn {
  readonly title: string;
  readonly nodes: readonly DiagramNode[];
}

interface RoadmapItem {
  readonly phase: string;
  readonly title: string;
  readonly detail: string;
  readonly estimate: string;
}

interface ExampleCard {
  readonly title: string;
  readonly problem: string;
  readonly pattern: string;
  readonly outcome: string;
}

interface PatternCard {
  readonly title: string;
  readonly question: string;
  readonly editorShape: string;
  readonly benefit: string;
}

interface AlternativeCard {
  readonly title: string;
  readonly goodFor: string;
  readonly limit: string;
  readonly verdict: string;
}

const metrics = [
  {
    label: 'Changed app paths',
    value: '147',
    detail: 'Current local app worktree snapshot: 45 modified paths, 2 deleted paths, and 100 untracked paths.',
    tone: 'teal'
  },
  {
    label: 'Foundation status',
    value: '65-75%',
    detail: 'Estimated progress through the architecture foundation roadmap, not full Illustrator-level product scope.',
    tone: 'blue'
  },
  {
    label: 'Test surface',
    value: '249 tests',
    detail: 'Latest architecture pass: 53 Solid SVG Editor test files and 249 tests passed.',
    tone: 'amber'
  },
  {
    label: 'Build gate',
    value: 'Passed',
    detail: 'The overview should continue to pass the normal TypeScript and Vite production build.',
    tone: 'rose'
  }
] as const satisfies readonly OverviewMetric[];

const systemColumns = [
  {
    title: 'User And UI',
    nodes: [
      {
        title: 'Pointer, keyboard, menus',
        detail: 'The user clicks, drags, types shortcuts, opens panels, or chooses menu items.'
      },
      {
        title: 'TopBar, Sidebar, Viewport',
        detail: 'UI components ask the kernel for services instead of owning editor logic directly.'
      }
    ]
  },
  {
    title: 'Kernel Services',
    nodes: [
      {
        title: 'documents',
        detail: 'Owns tabs, active SVG document, code text, import, export, formatting, and document indexes.'
      },
      {
        title: 'selection and commands',
        detail: 'Owns selected targets, command dispatch, transactions, undo, redo, and command events.'
      },
      {
        title: 'viewport and UI',
        detail: 'Owns zoom, view rectangle, overlays, modals, context menus, file host state, and workbench state.'
      }
    ]
  },
  {
    title: 'Registries',
    nodes: [
      {
        title: 'contributions',
        detail: 'Collects actions, commands, tools, panels, shortcuts, menus, modals, settings, SVG capabilities, and renderers.'
      },
      {
        title: 'package diagnostics',
        detail: 'Reports duplicate IDs, dependency failures, blocked packages, compatibility, migrations, updates, and registry health.'
      }
    ]
  },
  {
    title: 'SVG Model',
    nodes: [
      {
        title: 'immutable tree',
        detail: 'The SVG source of truth is a tree of SVG nodes updated through explicit operations.'
      },
      {
        title: 'derived indexes',
        detail: 'Resource graph, diagnostics, inherited style data, and spatial index make tools faster and simpler.'
      }
    ]
  }
] as const satisfies readonly DiagramColumn[];

const actionFlow = [
  {
    title: '1. Input',
    detail: 'A pointer event, shortcut, menu item, panel button, or context-menu item starts the action.'
  },
  {
    title: '2. Tool Or Contribution',
    detail: 'A viewport tool, action contribution, or command contribution decides whether it can handle the request.'
  },
  {
    title: '3. Command',
    detail: 'The user-facing command provides a label, enablement check, durability metadata, and operation creation.'
  },
  {
    title: '4. Operation',
    detail: 'Plain data describes the SVG edit: set an attribute, insert a node, move nodes, update text, or replace the root.'
  },
  {
    title: '5. History',
    detail: 'The history entry stores before/after roots, operations, inverse operations, merge keys, and fallback snapshots.'
  },
  {
    title: '6. Render',
    detail: 'The document updates, derived indexes rebuild, selection remains valid, and the renderer shows the new SVG.'
  }
] as const satisfies readonly DiagramNode[];

const packageSteps = [
  {
    title: 'Package manifest',
    detail: 'id, name, version, editorApiVersion, dependencies, migrations, description, homepage'
  },
  {
    title: 'Compatibility checks',
    detail: 'API version, required migrations, dependency versions, missing dependencies, dependency cycles'
  },
  {
    title: 'Activation state',
    detail: 'active packages contribute features; disabled or blocked packages stay visible but do not affect live registries'
  },
  {
    title: 'Contribution install',
    detail: 'active package contributions join the same registries used by core editor features'
  },
  {
    title: 'Update policy',
    detail: 'available updates are shown, accepted update keys are persisted, and replacement happens on startup'
  }
] as const satisfies readonly DiagramNode[];

const roadmapItems = [
  {
    phase: 'Now',
    title: 'Make the branch reviewable',
    detail: 'Run browser smoke tests, review the dirty tree, split coherent commits, and keep build/test as the gate.',
    estimate: '2-4 focused days'
  },
  {
    phase: 'Next',
    title: 'Finish package lifecycle',
    detail: 'Add install/download UX, real migration transforms, live unload/reload, and package trust boundaries.',
    estimate: '1-2 weeks'
  },
  {
    phase: 'Foundation',
    title: 'Retire compatibility bridges',
    detail: 'Remove old snapshot fallback, legacy command adapters, and selectedIds-only assumptions after the new paths are stable.',
    estimate: '3-6 weeks'
  },
  {
    phase: 'Product',
    title: 'Grow pro editor features',
    detail: 'Add artboards, guides, snapping, pen and node editing, text editing, gradients, layers, symbols, masks, filters, and asset management.',
    estimate: '6-12+ months'
  }
] as const satisfies readonly RoadmapItem[];

const examples = [
  {
    title: 'Add a panel',
    problem: 'Old style: edit the shell, sidebar, panel switcher, and tests manually.',
    pattern: 'New style: contribute a panel with an id, label, order, icon, and render function.',
    outcome: 'The sidebar reads the registry and renders the panel without learning about the feature internally.'
  },
  {
    title: 'Add a document edit',
    problem: 'Old style: dispatch a closure that mutates the root in a way history cannot inspect.',
    pattern: 'New style: create operation data such as svg.set-attribute or svg.move-nodes.',
    outcome: 'History can invert, merge, replay, test, and eventually serialize the edit.'
  },
  {
    title: 'Add SVG knowledge',
    problem: 'Old style: expand hard-coded metadata and switch statements across inspector, handles, and validation.',
    pattern: 'New style: contribute element defaults, attributes, controls, handles, bounds, validators, and resource references.',
    outcome: 'The inspector, add menu, document diagnostics, handles, and resource graph learn the new capability together.'
  },
  {
    title: 'Add a package',
    problem: 'Old style: load external behavior directly and hope it works.',
    pattern: 'New style: install a manifest-backed package with API version, dependencies, migrations, and contributions.',
    outcome: 'The host can explain why a package is active, disabled, blocked, ready to update, or waiting for migration.'
  }
] as const satisfies readonly ExampleCard[];

const patternCards = [
  {
    title: 'Composition root',
    question: 'Where is the app assembled?',
    editorShape: 'The shell creates services, builds the kernel, registers contributions, and then gets out of the way.',
    benefit: 'Startup wiring is visible in one place, while feature logic stays inside smaller modules.'
  },
  {
    title: 'Kernel services',
    question: 'How does feature code talk to the editor?',
    editorShape: 'Panels, commands, tools, menus, and packages ask the kernel for documents, selection, history, viewport, and UI services.',
    benefit: 'A feature does not need to import private shell state or know how every other feature is implemented.'
  },
  {
    title: 'Contribution registries',
    question: 'How do new features appear in the UI?',
    editorShape: 'A feature contributes panels, actions, commands, shortcuts, SVG capabilities, renderers, and settings into typed registries.',
    benefit: 'The sidebar, toolbar, command palette, and settings UI can grow by reading registries instead of hard-coded lists.'
  },
  {
    title: 'Operation-backed commands',
    question: 'How does a user action become an undoable edit?',
    editorShape: 'A command creates plain operation data such as set attribute, insert node, move nodes, or replace root.',
    benefit: 'History, tests, diagnostics, plugins, and future collaboration can inspect the edit instead of guessing what a function did.'
  },
  {
    title: 'Typed domain model',
    question: 'What exactly is selected or edited?',
    editorShape: 'Selection is a typed target: whole node, path command, path anchor, and later text range, gradient stop, guide, or artboard.',
    benefit: 'The editor can gain professional editing modes without adding one fragile global variable per mode.'
  },
  {
    title: 'Ports and adapters',
    question: 'What can be swapped later?',
    editorShape: 'Rendering, measurement, file hosting, package loading, and persistence sit behind boundaries instead of being mixed into UI code.',
    benefit: 'The app can later add better renderers, safer package loading, browser file APIs, or headless tests without rewriting every tool.'
  }
] as const satisfies readonly PatternCard[];

const alternatives = [
  {
    title: 'Keep a big component shell',
    goodFor: 'A demo, prototype, or single-person experiment where speed matters more than future change.',
    limit: 'Every new feature edits the same shell, selection state, toolbar code, and command handlers.',
    verdict: 'Fast at the start, but it becomes the student-project shape we are trying to grow out of.'
  },
  {
    title: 'Plain MVC or MVVM',
    goodFor: 'Separating UI rendering from state in a normal business app.',
    limit: 'It does not automatically solve plugins, undo history, SVG capabilities, package lifecycle, or tool-specific input.',
    verdict: 'Useful vocabulary, but not enough by itself for an Illustrator-class editor.'
  },
  {
    title: 'One Redux-style global store',
    goodFor: 'Clear state transitions, time travel, and predictable UI updates.',
    limit: 'A large editor still needs extension points, domain services, renderer boundaries, and package diagnostics around that store.',
    verdict: 'Good inspiration for actions and reducers; incomplete as the whole architecture.'
  },
  {
    title: 'Entity Component System',
    goodFor: 'Games, simulations, and scenes where many objects share small reusable behaviors.',
    limit: 'SVG has document order, XML-like structure, inherited style, resource references, and precise undo semantics.',
    verdict: 'Could help internal performance indexes later, but it should not replace the SVG document model.'
  },
  {
    title: 'Full event sourcing',
    goodFor: 'Audit logs, replay, collaboration, and long-term history reconstruction.',
    limit: 'It adds storage, migrations, event-versioning, replay correctness, and operational complexity from day one.',
    verdict: 'Operation-backed commands borrow the useful part first: edits are data. Full event sourcing can come later if needed.'
  },
  {
    title: 'Plugin-first microkernel',
    goodFor: 'A mature platform where almost everything, including core features, loads as packages.',
    limit: 'It is heavy before the core editor contracts are stable and can slow down basic product work.',
    verdict: 'This is the long-term direction, but the app should stabilize kernel contracts before making everything external.'
  },
  {
    title: 'Renderer-first canvas or WebGPU app',
    goodFor: 'Huge documents, custom effects, and advanced rendering performance.',
    limit: 'A faster renderer does not solve commands, selection, undo, plugins, SVG semantics, or package safety.',
    verdict: 'Important later, but renderer speed should sit behind the architecture instead of defining it.'
  },
  {
    title: 'Use an existing editor framework',
    goodFor: 'Rich-text editors, code editors, or document editors with an existing matching domain model.',
    limit: 'SVG editing needs geometry, XML-like nodes, visual tools, path handles, gradients, masks, and renderer integration.',
    verdict: 'Study frameworks like ProseMirror, Lexical, and VS Code; adapt their ideas instead of forcing SVG into the wrong model.'
  }
] as const satisfies readonly AlternativeCard[];

const metricToneClasses = {
  teal: 'border-teal-600 bg-teal-50 text-teal-950',
  blue: 'border-sky-600 bg-sky-50 text-sky-950',
  amber: 'border-amber-500 bg-amber-50 text-amber-950',
  rose: 'border-rose-500 bg-rose-50 text-rose-950'
} as const satisfies Record<MetricTone, string>;

const shikiThemeStyle = [
  '--shiki-background: #111816',
  '--shiki-foreground: #dbe8e2',
  '--shiki-token-comment: #7d948b',
  '--shiki-token-character: #d7ba7d',
  '--shiki-token-regexp-character: #d16969',
  '--shiki-token-escape: #d7ba7d',
  '--shiki-token-constant-language: #4fc1ff',
  '--shiki-token-number: #b5cea8',
  '--shiki-token-regexp: #d16969',
  '--shiki-token-function: #dcdcaa',
  '--shiki-token-label: #c586c0',
  '--shiki-token-selector: #d7ba7d',
  '--shiki-token-tag: #4ec9b0',
  '--shiki-token-header: #569cd6',
  '--shiki-token-invalid: #f48771',
  '--shiki-token-keyword: #569cd6',
  '--shiki-token-control: #c586c0',
  '--shiki-token-keyword-special: #c586c0',
  '--shiki-token-operator: #dbe8e2',
  '--shiki-token-word-operator: #569cd6',
  '--shiki-token-storage: #569cd6',
  '--shiki-token-modifier: #569cd6',
  '--shiki-token-storage-type: #569cd6',
  '--shiki-token-string: #ce9178',
  '--shiki-token-string-tag: #ce9178',
  '--shiki-token-string-value: #ce9178',
  '--shiki-token-string-regexp: #d16969',
  '--shiki-token-type: #4ec9b0',
  '--shiki-token-type-meta: #4ec9b0',
  '--shiki-token-template-delimiter: #dbe8e2',
  '--shiki-token-template: #ce9178',
  '--shiki-token-property: #9cdcfe',
  '--shiki-token-variable: #9cdcfe',
  '--shiki-token-language-variable: #569cd6',
  '--shiki-token-constant-variable: #4fc1ff',
  '--shiki-token-object-key: #9cdcfe',
  '--shiki-semantic-custom-literal: #ce9178',
  '--shiki-semantic-new-operator: #c586c0',
  '--shiki-semantic-number-literal: #b5cea8',
  '--shiki-semantic-string-literal: #ce9178'
].join('; ');

const markdownComponents = {
  wrapper(props: { readonly children: JSX.Element }): JSX.Element {
    return (
      <main class="min-h-screen bg-[#f6f7f2] px-4 py-6 text-[#16211c] sm:px-6 lg:px-8">
        <article class="mx-auto grid max-w-7xl gap-8">{props.children}</article>
      </main>
    );
  },
  h1(props: JSX.IntrinsicElements['h1']): JSX.Element {
    return <h1 class="m-0 max-w-5xl text-4xl font-850 leading-none tracking-0 text-[#121b17] sm:text-6xl" {...props} />;
  },
  h2(props: JSX.IntrinsicElements['h2']): JSX.Element {
    return (
      <h2
        class="m-0 border-t border-[#d8e2dc] pt-8 text-2xl font-820 leading-tight tracking-0 text-[#1b332b] sm:text-3xl"
        {...props}
      />
    );
  },
  h3(props: JSX.IntrinsicElements['h3']): JSX.Element {
    return <h3 class="m-0 text-lg font-800 leading-tight tracking-0 text-[#20372f]" {...props} />;
  },
  p(props: JSX.IntrinsicElements['p']): JSX.Element {
    return <p class="m-0 max-w-4xl text-base leading-7 text-[#33463e]" {...props} />;
  },
  strong(props: JSX.IntrinsicElements['strong']): JSX.Element {
    return <strong class="font-780 text-[#17231e]" {...props} />;
  },
  a(props: JSX.IntrinsicElements['a']): JSX.Element {
    const isExternal = typeof props.href === 'string' && /^https?:\/\//.test(props.href);
    const className = `font-760 text-[#245f9a] underline decoration-[#86b6d8] decoration-2 underline-offset-3 hover:text-[#173f67] ${
      props.class ?? ''
    }`;

    return (
      <a
        {...props}
        class={className}
        target={isExternal ? '_blank' : props.target}
        rel={isExternal ? 'noreferrer' : props.rel}
      />
    );
  },
  ul(props: JSX.IntrinsicElements['ul']): JSX.Element {
    return <ul class="m-0 grid max-w-4xl list-disc gap-2 pl-6 text-base leading-7 text-[#33463e]" {...props} />;
  },
  ol(props: JSX.IntrinsicElements['ol']): JSX.Element {
    return <ol class="m-0 grid max-w-4xl list-decimal gap-2 pl-6 text-base leading-7 text-[#33463e]" {...props} />;
  },
  li(props: JSX.IntrinsicElements['li']): JSX.Element {
    return <li {...props} />;
  },
  code(props: JSX.IntrinsicElements['code']): JSX.Element {
    return <code class="rounded bg-[#e7ece8] px-1.5 py-0.5 text-[0.9em] text-[#17352b]" {...props} />;
  },
  blockquote(props: JSX.IntrinsicElements['blockquote']): JSX.Element {
    return (
      <blockquote
        class="m-0 max-w-4xl border-l-4 border-[#2f7d65] bg-white px-5 py-4 text-base leading-7 text-[#33463e]"
        {...props}
      />
    );
  },
  Section(props: { readonly title?: string; readonly children: JSX.Element }): JSX.Element {
    return (
      <section class="grid gap-4 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.07)] sm:p-6">
        {props.title ? <h2 class="m-0 border-0 p-0 text-2xl font-820 leading-tight text-[#1b332b]">{props.title}</h2> : null}
        {props.children}
      </section>
    );
  },
  OverviewHero,
  StatusGrid,
  SystemMap,
  PatternStackDiagram,
  ArchitectureAlternatives,
  ActionFlowDiagram,
  PackageLifecycleDiagram,
  ExampleCards,
  RoadmapTimeline,
  Shiki
} as const;

export default function OverviewPage(): JSX.Element {
  return <OverviewContent components={markdownComponents} />;
}

function OverviewHero(): JSX.Element {
  return (
    <header class="grid gap-5 rounded-[8px] border border-[#d8e2dc] border-l-6 border-l-[#2f7d65] bg-white p-6 shadow-[0_14px_34px_rgba(23,32,27,0.08)] sm:p-8">
      <p class="m-0 text-sm font-760 uppercase tracking-0 text-[#557064]">
        Solid SVG Editor architecture review - local worktree, July 4, 2026
      </p>
      <div class="grid gap-4">
        <h1 class="m-0 max-w-5xl text-4xl font-850 leading-none tracking-0 text-[#121b17] sm:text-6xl">
          What changed, why it matters, and what comes next
        </h1>
        <p class="m-0 max-w-4xl text-lg leading-7 text-[#31413a]">
          The app is being turned from a promising SVG editor prototype into an extension-ready editor platform. The
          main work is foundation code: durable commands, typed selection, contribution registries, renderer boundaries,
          SVG capability plugins, package diagnostics, and future professional tools.
        </p>
      </div>
    </header>
  );
}

function StatusGrid(): JSX.Element {
  return (
    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Architecture status">
      <For each={metrics}>
        {(metric) => (
          <article class={`grid min-h-34 content-start gap-2 rounded-[8px] border-l-5 p-4 ${metricToneClasses[metric.tone]}`}>
            <p class="m-0 text-xs font-760 uppercase tracking-0 opacity-75">{metric.label}</p>
            <p class="m-0 text-3xl font-830 leading-tight tracking-0">{metric.value}</p>
            <p class="m-0 text-sm leading-6 opacity-85">{metric.detail}</p>
          </article>
        )}
      </For>
    </section>
  );
}

function SystemMap(): JSX.Element {
  return (
    <section class="grid gap-4 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.07)]">
      <div class="grid gap-1">
        <h3 class="m-0 text-lg font-820 text-[#1b332b]">System map</h3>
        <p class="m-0 max-w-4xl text-sm leading-6 text-[#50645b]">
          Read left to right: user intent enters the UI, the kernel coordinates services, registries decide what is
          installed, and the SVG model remains the source of truth.
        </p>
      </div>
      <div class="grid gap-3 xl:grid-cols-4">
        <For each={systemColumns}>
          {(column, index) => (
            <div class="relative grid content-start gap-3 rounded-[8px] border border-[#d8e2dc] bg-[#fbfcf8] p-4">
              {index() < systemColumns.length - 1 ? (
                <div class="absolute right-[-17px] top-8 z-1 hidden h-8 w-8 place-items-center rounded-full border border-[#cbd7d1] bg-white text-[#2f7d65] xl:grid">
                  <span aria-hidden="true">-</span>
                </div>
              ) : null}
              <h4 class="m-0 text-sm font-820 uppercase tracking-0 text-[#2f7d65]">{column.title}</h4>
              <For each={column.nodes}>
                {(node) => (
                  <div class="grid gap-1 rounded-[7px] border border-[#d8e2dc] bg-white p-3">
                    <p class="m-0 text-sm font-780 text-[#17231e]">{node.title}</p>
                    <p class="m-0 text-sm leading-6 text-[#50645b]">{node.detail}</p>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

function ActionFlowDiagram(): JSX.Element {
  return (
    <section class="grid gap-4 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.07)]">
      <div class="grid gap-1">
        <h3 class="m-0 text-lg font-820 text-[#1b332b]">How one edit moves through the app</h3>
        <p class="m-0 max-w-4xl text-sm leading-6 text-[#50645b]">
          A drag, shortcut, menu action, or plugin command should all become the same kind of durable document change.
        </p>
      </div>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <For each={actionFlow}>
          {(step) => (
            <article class="grid content-start gap-2 rounded-[8px] border border-[#d8e2dc] bg-[#fdfdfb] p-4">
              <h4 class="m-0 text-sm font-820 text-[#245f9a]">{step.title}</h4>
              <p class="m-0 text-sm leading-6 text-[#3f5048]">{step.detail}</p>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

function PackageLifecycleDiagram(): JSX.Element {
  return (
    <section class="grid gap-4 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.07)]">
      <div class="grid gap-1">
        <h3 class="m-0 text-lg font-820 text-[#1b332b]">Package lifecycle</h3>
        <p class="m-0 max-w-4xl text-sm leading-6 text-[#50645b]">
          Packages are visible to the host even when they cannot safely install live contributions.
        </p>
      </div>
      <div class="grid gap-3 lg:grid-cols-5">
        <For each={packageSteps}>
          {(step, index) => (
            <article class="relative grid content-start gap-2 rounded-[8px] border border-[#d8e2dc] bg-[#fbfcf8] p-4">
              <p class="m-0 text-xs font-760 uppercase tracking-0 text-[#8a5a00]">Step {index() + 1}</p>
              <h4 class="m-0 text-sm font-820 text-[#17231e]">{step.title}</h4>
              <p class="m-0 text-sm leading-6 text-[#50645b]">{step.detail}</p>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

function ExampleCards(): JSX.Element {
  return (
    <section class="grid gap-3 md:grid-cols-2">
      <For each={examples}>
        {(example) => (
          <article class="grid content-start gap-3 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.06)]">
            <h3 class="m-0 text-lg font-820 text-[#1b332b]">{example.title}</h3>
            <Definition label="Problem" value={example.problem} />
            <Definition label="Pattern" value={example.pattern} />
            <Definition label="Outcome" value={example.outcome} />
          </article>
        )}
      </For>
    </section>
  );
}

function PatternStackDiagram(): JSX.Element {
  return (
    <section class="grid gap-4 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.07)]">
      <div class="grid gap-1">
        <h3 class="m-0 text-lg font-820 text-[#1b332b]">The pattern stack</h3>
        <p class="m-0 max-w-4xl text-sm leading-6 text-[#50645b]">
          Each pattern answers one practical editor question. Together they turn scattered feature code into a platform
          where new tools can plug into known places.
        </p>
      </div>
      <div class="grid gap-3 lg:grid-cols-2">
        <For each={patternCards}>
          {(pattern) => (
            <article class="grid content-start gap-3 rounded-[8px] border border-[#d8e2dc] bg-[#fbfcf8] p-4">
              <h4 class="m-0 text-sm font-820 uppercase tracking-0 text-[#2f7d65]">{pattern.title}</h4>
              <Definition label="Question" value={pattern.question} />
              <Definition label="In this editor" value={pattern.editorShape} />
              <Definition label="Why it helps" value={pattern.benefit} />
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

function ArchitectureAlternatives(): JSX.Element {
  return (
    <section class="grid gap-4 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.07)]">
      <div class="grid gap-1">
        <h3 class="m-0 text-lg font-820 text-[#1b332b]">Alternatives and tradeoffs</h3>
        <p class="m-0 max-w-4xl text-sm leading-6 text-[#50645b]">
          None of these alternatives are foolish. They are good in different contexts. The question is whether they can
          support a professional SVG editor with plugins, undo, precise selection, and long-term growth.
        </p>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <For each={alternatives}>
          {(alternative) => (
            <article class="grid content-start gap-3 rounded-[8px] border border-[#d8e2dc] bg-[#fdfdfb] p-4">
              <h4 class="m-0 text-base font-820 text-[#17231e]">{alternative.title}</h4>
              <Definition label="Good for" value={alternative.goodFor} />
              <Definition label="Limit" value={alternative.limit} />
              <Definition label="Verdict" value={alternative.verdict} />
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

function RoadmapTimeline(): JSX.Element {
  return (
    <section class="grid gap-3 rounded-[8px] border border-[#d8e2dc] bg-white p-5 shadow-[0_10px_28px_rgba(23,32,27,0.07)]">
      <For each={roadmapItems}>
        {(item) => (
          <article class="grid gap-3 border-b border-[#e2ebe6] pb-4 last:border-b-0 last:pb-0 md:grid-cols-[120px_minmax(0,1fr)_150px]">
            <p class="m-0 text-sm font-820 uppercase tracking-0 text-[#2f7d65]">{item.phase}</p>
            <div class="grid gap-1">
              <h3 class="m-0 text-base font-820 text-[#17231e]">{item.title}</h3>
              <p class="m-0 text-sm leading-6 text-[#50645b]">{item.detail}</p>
            </div>
            <p class="m-0 rounded-[7px] border border-[#d8e2dc] bg-[#fbfcf8] px-3 py-2 text-sm font-760 text-[#33463e]">
              {item.estimate}
            </p>
          </article>
        )}
      </For>
    </section>
  );
}

function Definition(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div class="grid gap-1">
      <p class="m-0 text-xs font-780 uppercase tracking-0 text-[#557064]">{props.label}</p>
      <p class="m-0 text-sm leading-6 text-[#3f5048]">{props.value}</p>
    </div>
  );
}

function Shiki(props: { readonly code: string; readonly language?: string; readonly html: string; readonly title?: string }): JSX.Element {
  return (
    <figure
      class="m-0 grid overflow-hidden rounded-[8px] border border-[#d8e2dc] bg-[#111816] shadow-[0_10px_28px_rgba(23,32,27,0.08)]"
      style={shikiThemeStyle}
    >
      <figcaption class="flex items-center justify-between gap-3 border-b border-white/10 bg-[#18231f] px-4 py-2 text-xs font-760 uppercase tracking-0 text-[#cfe1d8]">
        <span>{props.title ?? props.language ?? 'code'}</span>
        {props.language ? <span class="text-[#8fb4a4]">{props.language}</span> : null}
      </figcaption>
      <div class="overflow-auto text-sm leading-6 [&_pre]:m-0 [&_pre]:overflow-auto [&_pre]:bg-transparent! [&_pre]:p-4">
        {template(props.html)()}
      </div>
    </figure>
  );
}
