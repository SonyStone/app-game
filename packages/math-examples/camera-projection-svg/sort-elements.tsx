import { JSX, children, createMemo } from 'solid-js';

// TODO: Only works for the first run
export const SortElements = (props: { children: JSX.Element }) => {
  const resolved = children(() => props.children);
  const sortedChildren = createMemo(() => {
    const sorted = (resolved() as HTMLElement[]).sort((a, b) => {
      const az = parseFloat(a.dataset['z'] ?? '0');
      const bz = parseFloat(b.dataset['z'] ?? '0');
      return az - bz;
    });

    return sorted;
  });

  return <>{sortedChildren()}</>;
};
