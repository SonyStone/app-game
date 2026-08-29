import { cn } from '@app-game/utils';
import type { ComponentProps } from '@solidjs/web';
import { For, merge, omit } from 'solid-js';
import { Routes } from '../routes.interface';
import { LinkPreview } from './link-preview';

export function Navigation(props: Partial<{ routes: Routes[]; parentPath: string }> & ComponentProps<'div'>) {
  const others = omit(props, 'routes', 'parentPath', 'class');
  const merged = merge({ parentPath: '', routes: [] as Routes[] }, props);

  return (
    <div class={cn('grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4 p-4', props.class)} {...others}>
      <For each={merged.routes}>
        {({ path, name, Preview, children }) => (
          <>
            <LinkPreview path={resolvePreviewPath(merged.parentPath, path)} name={name} as={Preview} />
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

function resolvePreviewPath(parentPath: string, routePath: Routes['path']): string {
  const path = String(routePath);
  return parentPath === '.' ? path.replace(/^\/+/, '') : parentPath + path;
}
