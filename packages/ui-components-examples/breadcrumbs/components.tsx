import { BreadcrumbProps, Breadcrumbs } from '@packages/ui-components/breadcrumbs/breadcrumbs';
import { createSignal } from 'solid-js';

const BREADCRUMBS: BreadcrumbProps[] = [
  { href: '/users', icon: 'folder-close', text: '1 Home Page' },
  { href: '/users/janet', icon: 'folder-close', text: '2 General Hospital' },
  { href: '/users/janet/deep', icon: 'folder-close', text: '3 The Surgical Setup' },
  {
    href: '/users/janet/deep/deep',
    icon: 'folder-close',
    text: '4 Department of Otorhinolaryngology and head and neck surgery'
  },
  { icon: 'document', text: 'image.jpg' }
];

export default () => {
  const [width, setWidth] = createSignal(100);

  return (
    <div class="flex flex-col gap-4 p-2">
      <div class="w-2/3 flex flex-col gap-4 p-2">
        <input
          type="range"
          value={width()}
          min={0}
          max={100}
          onInput={(e) => setWidth(parseFloat((e.target as any).value))}
        />
        <input
          type="number"
          value={width()}
          min={0}
          step={10}
          max={100}
          onInput={(e) => setWidth(parseFloat((e.target as any).value))}
        />
        <div class="border m-4 p-4 rounded" style={{ width: width() + `%` }}>
          <Breadcrumbs items={BREADCRUMBS} />
        </div>
      </div>
    </div>
  );
};
