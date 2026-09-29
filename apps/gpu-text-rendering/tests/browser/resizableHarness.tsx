import { Resizable, ResizableHandle, ResizablePanel } from '@app-game/components/ui/resizable';
import { render } from '@solidjs/web';
import { For, Show } from 'solid-js';

/**
 * Mounts `count` equal panels separated by 8 px handles, like the viewer's split panes, for resize checks. Inline styles
 * stand in for the utility classes Resizable relies on, which this app does not load.
 */
export function mountPanels(count: number, orientation: 'horizontal' | 'vertical' = 'horizontal') {
  const host = document.createElement('div');
  host.style.cssText = 'position: fixed; inset: 0; display: flex';
  document.body.append(host);

  return render(
    () => (
      <Resizable
        orientation={orientation}
        style={{
          display: 'flex',
          'flex-direction': orientation === 'vertical' ? 'column' : 'row',
          width: '100%',
          height: '100%'
        }}
      >
        <For each={Array.from({ length: count }, (_, index) => index)}>
          {(slot) => (
            <>
              <Show when={slot > 0}>
                <ResizableHandle orientation={orientation} style={{ flex: '0 0 8px' }} data-testid={`handle-${slot}`} />
              </Show>
              <ResizablePanel minSize={0.1} data-testid={`panel-${slot}`} />
            </>
          )}
        </For>
      </Resizable>
    ),
    host
  );
}
