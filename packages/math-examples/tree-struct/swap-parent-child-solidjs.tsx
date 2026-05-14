import { ComponentProps, createSignal, onMount } from 'solid-js';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'parent-div': ComponentProps<'div'>;
      'child-div': ComponentProps<'div'>;
    }
  }
}

export function SwapParentChildSolidJS() {
  let containerRef: HTMLDivElement | undefined;
  let parentRef: HTMLDivElement | undefined;
  let childRef: HTMLDivElement | undefined;

  const [isParentFirst, setIsParentFirst] = createSignal(true);

  // Function to manually reorder DOM nodes
  const swapElements = () => {
    if (!containerRef || !parentRef || !childRef) return;

    if (isParentFirst()) {
      // Currently: Parent contains Child
      // Switch to: Child contains Parent
      containerRef.appendChild(childRef);
      childRef.appendChild(parentRef);
    } else {
      // Currently: Child contains Parent
      // Switch to: Parent contains Child
      containerRef.appendChild(parentRef);
      parentRef.appendChild(childRef);
    }

    setIsParentFirst(!isParentFirst());
  };

  onMount(() => {
    // Initial setup: Parent contains Child
    if (parentRef && childRef) {
      parentRef.appendChild(childRef);
    }
  });

  return (
    <div>
      <h2>Swap Parent Child Example (SolidJS Way)</h2>
      <button class="mb-4 rounded bg-blue-500 px-4 py-2 text-white" onClick={swapElements}>
        Swap
      </button>
      <div class="flex" ref={containerRef}>
        <parent-div ref={parentRef} class="border-red m-1 flex flex-col border p-1">
          Parent
          <img height={20} width={20} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=1`} />
        </parent-div>
        <child-div ref={childRef} class="border-blue m-1 flex flex-col border p-1">
          Child
          <img height={20} width={20} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=2`} />
        </child-div>
      </div>
    </div>
  );
}
