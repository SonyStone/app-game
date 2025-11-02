import { ComponentProps, JSX } from 'solid-js';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'parent-div': ComponentProps<'div'>;
      'child-div': ComponentProps<'div'>;
    }
  }
}

export function SwapParentChild() {
  const parent = Parent({}) as HTMLDivElement;
  const child = Child({}) as HTMLDivElement;

  parent.appendChild(child);

  return (
    <div>
      <h2>Swap Parent Child Example</h2>
      <button
        class="mb-4 rounded bg-blue-500 px-4 py-2 text-white"
        onClick={() => {
          if (parent.contains(child)) {
            parent.replaceWith(child);
            child.appendChild(parent);
          } else {
            child.replaceWith(parent);
            parent.appendChild(child);
          }
        }}
      >
        Swap
      </button>
      <button
        class="mb-4 rounded bg-blue-500 px-4 py-2 text-white"
        onClick={() => {
          if (parent.contains(child)) {
            parent.parentElement?.moveBefore(child, parent);
            child.moveBefore(parent, null); // null = move to end
          } else {
            child.parentElement?.moveBefore(parent, child);
            parent.moveBefore(child, null);
          }
        }}
      >
        Swap 2
      </button>
      <div class="flex">{parent}</div>
    </div>
  );
}

function Parent(
  props: Partial<{
    children: JSX.Element;
  }>
) {
  console.log('Parent component created');
  return (
    <parent-div class="border-red m-1 flex flex-col border p-1">
      Parent
      <img height={20} width={20} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=1`} />
      {props.children}
    </parent-div>
  );
}

function Child(
  props: Partial<{
    children: JSX.Element;
  }>
) {
  console.log('Child component created');
  return (
    <child-div class="border-blue m-1 flex flex-col border p-1">
      Child
      <img height={20} width={20} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=2`} />
      {props.children}
      <iframe
        width="100"
        height="100"
        src="https://www.youtube.com/embed/XvoENpR9cCQ?si=o2i6MvxugD-O5yyv"
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    </child-div>
  );
}
