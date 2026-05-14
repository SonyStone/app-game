import { ComponentProps, createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'parent-div': ComponentProps<'div'>;
      'child-div': ComponentProps<'div'>;
    }
  }
}

export function SwapParentChildPortal() {
  let parentRef: HTMLDivElement | undefined;
  let childRef: HTMLDivElement | undefined;

  const [isParentFirst, setIsParentFirst] = createSignal(true);

  // Parent and Child components are created only once
  const ParentContent = () => {
    console.log('Parent component created');
    return (
      <parent-div ref={parentRef} class="border-red m-1 flex flex-col border p-1">
        Parent
        <img height={20} width={20} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=1`} />
        <Show when={isParentFirst()}>
          <Portal mount={parentRef}>{ChildContent()}</Portal>
        </Show>
      </parent-div>
    );
  };

  const ChildContent = () => {
    console.log('Child component created');
    return (
      <child-div ref={childRef} class="border-blue m-1 flex flex-col border p-1">
        Child
        <img height={20} width={20} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=2`} />
        <Show when={!isParentFirst()}>
          <Portal mount={childRef}>{ParentContent()}</Portal>
        </Show>
      </child-div>
    );
  };

  return (
    <div>
      <h2>Swap Parent Child Example (Portal Way)</h2>
      <button class="mb-4 rounded bg-blue-500 px-4 py-2 text-white" onClick={() => setIsParentFirst(!isParentFirst())}>
        Swap
      </button>
      <div class="flex">
        <Show when={isParentFirst()} fallback={ChildContent()}>
          {ParentContent()}
        </Show>
      </div>
    </div>
  );
}
