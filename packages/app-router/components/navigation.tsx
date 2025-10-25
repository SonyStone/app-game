import { cn } from '@packages/utils/cn';
import { ComponentProps, For, mergeProps, splitProps } from 'solid-js';
import { Routes } from '../routes.interface';
import { LinkPreview } from './link-preview';

export function Navigation(props: Partial<{ routes: Routes[]; parentPath: string }> & ComponentProps<'div'>) {
  const [local, others] = splitProps(props, ['routes', 'parentPath', 'class']);
  const merged = mergeProps({ parentPath: '' }, local);

  return (
    <div class={cn('grid grid-cols-[repeat(auto-fill,_minmax(12rem,_1fr))] gap-4 p-4', local.class)} {...others}>
      <For each={merged.routes}>
        {({ path, name, Preview, children }) => (
          <>
            <LinkPreview path={merged.parentPath + path} name={name} as={Preview} />
            {/* <Show when={!!children}>
              <For each={children}>
                {(child) => <LinkPreview path={path + child.path} name={child.name} as={child.Preview} />}
              </For>
            </Show> */}
          </>
        )}
      </For>
    </div>
  );
}
