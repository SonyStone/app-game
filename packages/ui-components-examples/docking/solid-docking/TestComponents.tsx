import { ComponentProps, JSX } from 'solid-js';
import { DockingNode } from '../SolidDockingExample';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'test-component-1': ComponentProps<'div'>;
      'test-component-2': ComponentProps<'div'>;
      'test-component-3': ComponentProps<'div'>;
      'test-component-4': ComponentProps<'div'>;
      'test-component-5': ComponentProps<'div'>;
    }
  }
}

export function Component1(): JSX.Element {
  return (
    <test-component-1 class="grid gap-2 overflow-auto border border-green-400 p-2 text-sm text-neutral-300">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">src</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">components</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">Docking.tsx</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">createDockLayoutStore.ts</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">src</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">components</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">Docking.tsx</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">createDockLayoutStore.ts</div>
    </test-component-1>
  );
}

export function Component2(): JSX.Element {
  return (
    <test-component-2 class="@container flex flex-col space-y-1 border border-blue-400 text-neutral-300 @3xs:space-y-3">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 p-1 text-[10px] @3xs:px-3 @3xs:py-2 @3xs:text-sm">
        Results point to stable ids, not raw JSX children.
      </div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 p-1 text-[10px] @3xs:px-3 @3xs:py-2 @3xs:text-sm">
        Layout mutations only move ids between tab groups and split nodes.
      </div>
    </test-component-2>
  );
}

export function Component3(props: { layout: DockingNode }): JSX.Element {
  return (
    <test-component-3 class="@container flex overflow-auto border border-red-400">
      <pre class="w-full bg-neutral-950/70 p-3 text-xs leading-tight text-neutral-300 @3xs:text-sm @3xs:leading-normal">
        {JSON.stringify(props.layout, null, 2)}
      </pre>
    </test-component-3>
  );
}

export function Component4(): JSX.Element {
  return (
    <test-component-4 class="@container flex flex-col space-y-2 border border-white p-2 font-mono text-xs text-neutral-300">
      <div>{'>'} edge-drop to create new splits</div>
      <div>{'>'} group handle now drags the whole tab stack</div>
      <div>{'>'} outer layout edges accept drop targets</div>
      <div>{'>'} persist layout JSON</div>
    </test-component-4>
  );
}

export function Component5(): JSX.Element {
  return (
    <test-component-5 class="flex flex-col space-y-2 border border-white p-2 text-sm text-neutral-300">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">No drag/drop yet.</div>
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
        No floating groups or popout windows yet.
      </div>
    </test-component-5>
  );
}
