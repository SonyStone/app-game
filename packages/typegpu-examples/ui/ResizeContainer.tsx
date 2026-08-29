import { Resizable, ResizableHandle, ResizablePanel } from '@app-game/components/ui/resizable';
import type { JSX } from '@solidjs/web';

/** Gives WebGPU canvases a stable viewport and an optional comparison panel. */
export function ResizeContainer(props: { children: JSX.Element }) {
  return (
    <Resizable class="h-[min(70vh,42rem)] min-h-80 flex-none overflow-hidden border-0">
      <ResizablePanel class="flex w-0 flex-grow flex-col overflow-hidden border-0" initialSize={0.3} minSize={0.1}>
        {props.children}
      </ResizablePanel>
      <ResizableHandle withHandle class="border-0 bg-inherit hover:bg-blue-400" />
      <ResizablePanel initialSize={0.7} />
    </Resizable>
  );
}
