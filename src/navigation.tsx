import { LinkPreview } from '@packages/ui-components/link-preview';
import { For, mergeProps } from 'solid-js';
import { Routes } from './routes.interface';

export default function Navigation(props: { routes: Routes[]; parentPath?: string }) {
  const merged = mergeProps({ parentPath: '' }, props);

  return (
    <div class="grid grid-cols-[repeat(auto-fit,_minmax(12rem,_1fr))] gap-4 p-4">
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
