import { cn } from '@app-game/utils';
import type { ComponentProps } from '@solidjs/web';
import { For, merge, omit } from 'solid-js';
import type { Routes } from '../routes.interface';
import { LinkPreview } from './link-preview';

export function Navigation(props: Partial<{ routes: readonly Routes[]; parentPath: string }> & ComponentProps<'div'>) {
  const others = omit(props, 'routes', 'parentPath', 'class');
  const merged = merge({ parentPath: '', routes: [] as readonly Routes[] }, props);

  return (
    <div class={cn('grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4 p-4', props.class)} {...others}>
      <For each={merged.routes}>
        {({ path, name, Preview, children }) => (
          <>
            <LinkPreview path={merged.parentPath + String(path)} name={name} as={Preview} />
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
