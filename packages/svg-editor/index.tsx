import { Resizable, ResizableHandle, ResizablePanel } from '@packages/components/ui/resizable';
import { trackStore } from '@solid-primitives/deep';
import { createUndoHistory } from '@solid-primitives/history';
import { toObservable } from '@utils/to-observable';
import { toSignal } from '@utils/to-signal';
import { debounceTime } from 'rxjs';
import { createMemo } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import { TmTextarea } from 'tm-textarea/solid';
import { EditView } from './components/editor-view';
import { LayersView } from './components/layers-view';
import { Toolbar } from './components/toolbar';
import { SVGCodePreview } from './svg-code-preview';
import { SVGNode } from './svg-node';
import { svgParser } from './svg-parser';
import { useSvgSelect } from './use-svg-select';
import { useVirtualTree } from './use-virtual-tree';

// import exampleSvg from './ghostscript-tiger.svg?raw';
import exampleSvg from './example.svg?raw';

export default function SVGEditorApp() {
  const [state, setState] = createStore<SVGNode>(svgParser(exampleSvg));

  const map = useVirtualTree({ state, setState });
  const select = useSvgSelect<SVGNode>();

  const debounceState = toSignal(
    toObservable(
      createMemo(
        () => {
          trackStore(state);
          return state;
        },
        state,
        { equals: false }
      )
    ).pipe(debounceTime(500)),
    state
  );

  const history = createUndoHistory(
    () => {
      debounceState();
      const copy = structuredClone(unwrap(state));
      return () => setState(reconcile(copy));
    },
    { limit: 100 }
  );

  return (
    <div id="Display" class="flex h-screen w-full w-screen flex-col overflow-hidden">
      <Toolbar history={history} map={map} select={select} setState={setState} state={state} />
      <Resizable class="flex-1 overflow-hidden border-0">
        <ResizablePanel class="flex w-0 flex-grow flex-col overflow-hidden border-0" initialSize={0.5} minSize={0.1}>
          <Resizable orientation="vertical">
            <ResizablePanel
              class="flex h-0 flex-grow flex-col overflow-hidden border-0"
              initialSize={0.3}
              minSize={0.1}
            >
              <button
                class="select-none self-end rounded bg-blue-500 px-2 py-1 text-white hover:bg-blue-600"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(svgToString(state));
                    console.log('Text copied to clipboard successfully!');
                  } catch (err) {
                    console.error('Failed to copy text: ', err);
                  }
                }}
              >
                Copy
              </button>
              <SVGCodePreview node={state} />
            </ResizablePanel>
            <ResizableHandle withHandle orientation="vertical" class="border-0 bg-inherit hover:bg-blue-400" />
            <ResizablePanel
              class="flex h-0 flex-grow flex-col overflow-hidden border-0"
              initialSize={0.3}
              minSize={0.1}
            >
              <TmTextarea
                grammar="tsx"
                theme="min-light"
                value={svgToString(state, { indent: true, indentSize: 2 })}
                editable={true}
                style={{
                  padding: '10px',
                  'font-size': '12pt'
                }}
                onInput={(e) => setState(svgParser(e.currentTarget.value))}
              />
            </ResizablePanel>
            <ResizableHandle withHandle orientation="vertical" class="border-0 bg-inherit hover:bg-blue-400" />
            <ResizablePanel
              class="flex h-0 flex-grow select-none flex-col overflow-hidden border-0"
              initialSize={0.4}
              minSize={0.1}
            >
              <LayersView select={select} map={map} setState={setState} state={state} />
            </ResizablePanel>
          </Resizable>
        </ResizablePanel>
        <ResizableHandle withHandle class="border-0 bg-inherit hover:bg-blue-400" />
        <ResizablePanel class="w-0 flex-grow overflow-hidden border-0" initialSize={0.5} minSize={0.1}>
          <EditView select={select} state={state} />
        </ResizablePanel>
      </Resizable>
    </div>
  );
}

function svgToString(
  node: SVGNode,
  { indent = true, indentSize = 2, depth = 0 }: { indent?: boolean; indentSize?: number; depth?: number } = {}
): string {
  const indentStr = indent ? ' '.repeat(depth * indentSize) : '';
  const newline = indent ? '\n' : '';

  // Extract attributes excluding component, children, and id
  const attributes = Object.entries(node)
    .filter(([key]) => key !== 'component' && key !== 'children' && key !== 'id')
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');

  const attributesStr = attributes ? ` ${attributes}` : '';
  const hasChildren = node.children && node.children.length > 0;

  if (!hasChildren) {
    // Self-closing tag
    return `${indentStr}<${node.component}${attributesStr} />`;
  }

  // Container with children
  const childrenStr = node.children
    ?.map((child) => svgToString(child, { indent, indentSize, depth: depth + 1 }))
    .join(newline);

  return [`${indentStr}<${node.component}${attributesStr}>`, childrenStr, `${indentStr}</${node.component}>`].join(
    newline
  );
}
