import { Resizable, ResizableHandle, ResizablePanel } from '@packages/components/ui/resizable';
import { JSX } from 'solid-js';

export function ResizeContainer(props: { children: JSX.Element }) {
  return (
    <Resizable class="flex-1 overflow-hidden border-0">
      <ResizablePanel class="flex w-0 flex-grow flex-col overflow-hidden border-0" initialSize={0.3} minSize={0.1}>
        {props.children}
      </ResizablePanel>
      <ResizableHandle withHandle orientation="vertical" class="border-0 bg-inherit hover:bg-blue-400" />
      <ResizablePanel initialSize={0.7} />
    </Resizable>
  );
}
