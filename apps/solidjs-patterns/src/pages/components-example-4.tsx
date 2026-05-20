import { children, type JSX } from 'solid-js';

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
}