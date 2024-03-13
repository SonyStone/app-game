import { BreadcrumbProps, Breadcrumbs } from '@packages/ui-components/breadcrumbs/breadcrumbs';
import MatButton from '@packages/ui-components/button/MatButton';
import { MatFormField } from '@packages/ui-components/form-field/MatFormField';
import { Menu } from '@packages/ui-components/menu/menu';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { Meta, Title } from '@solidjs/meta';
import { For, Show, createSignal } from 'solid-js';
import { numberPrecisionDragInput } from './number-precision-drag-input';

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
  const [value, setValue] = createSignal(0);

  return (
    <>
      <Title>Components</Title>
      <Meta name="example" content="whatever" />

      <div class="flex flex-col gap-4 p-4">
        responsive breadcrumbs:
        <div class="w-2/3 flex flex-col gap-4 ">
          <input
            type="range"
            value={width()}
            min={0}
            max={100}
            onInput={(e) => setWidth(parseFloat((e.target as any).value))}
          />
          <input
            class="border rounded p-2"
            type="number"
            value={width()}
            min={0}
            step={10}
            max={100}
            onInput={(e) => setWidth(parseFloat((e.target as any).value))}
            ref={(ref) => {
              numberPrecisionDragInput(ref, { value: width, onChange: setWidth });
            }}
          />
          <div class="border p-4 rounded" style={{ width: width() + `%` }}>
            native:
            <nav class="truncate text-start">
              <For each={BREADCRUMBS}>
                {(item, index) => (
                  <>
                    <a class="truncate relative rounded px-1 hover:bg-light" href={item.href}>
                      {item.text}
                      <Ripple />
                    </a>
                    <Show when={index() !== BREADCRUMBS.length - 1}>
                      <span class="px-1">&gt;</span>
                    </Show>
                  </>
                )}
              </For>
            </nav>
            javascript:
            <Breadcrumbs items={BREADCRUMBS} />
          </div>
        </div>
        {/* -- */}
        <div class="flex flex-col">
          buttons with ripple:
          <div class="flex gap-2">
            <MatButton variant="outlined" color="primary">
              click me too!
            </MatButton>
            <MatButton variant="outlined" color="secondary">
              click me!
            </MatButton>
            <MatButton variant="contained" color="secondary">
              click me!
            </MatButton>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          form field (work in progress):
          <MatFormField></MatFormField>
        </div>
        {/* -- */}
        <div class="flex flex-col gap-2 w-100 place-content-center">
          middle click input
          <input
            class="border rounded p-2 w-100"
            ref={(ref) => {
              numberPrecisionDragInput(ref, { value: value, onChange: setValue });
            }}
            type="number"
            value={value()}
            onInput={(e) => setValue(parseFloat(e.target.value))}
          />
        </div>
        <div class="flex flex-col">
          aria menu:
          <Menu />
        </div>
      </div>
    </>
  );
};
