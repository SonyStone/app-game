import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@packages/components/ui/dropdown-menu';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarShortcut,
  MenubarTrigger
} from '@packages/components/ui/menubar';
import { Resizable, ResizableHandle, ResizablePanel } from '@packages/components/ui/resizable';
import { captureStoreUpdates, trackStore } from '@solid-primitives/deep';
import { createUndoHistory } from '@solid-primitives/history';
import { createElementSize } from '@solid-primitives/resize-observer';
import { batch, createEffect, createMemo, createSignal, For, JSXElement, Match, Show, Switch } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { Dynamic } from 'solid-js/web';
import { SVGNode } from './svg-node';
import { DataWrapper, OutlinePreview, useSvgSelect } from './use-svg-select';
import { useVirtualTree } from './use-virtual-tree';

export default function SVGEditorApp() {
  return <Display />;
}

/**
 *
 * @returns
 */
function Display() {
  const [state, setState] = createStore<SVGNode>({
    id: 'svg-root',
    component: 'svg',
    width: '400',
    height: '400',
    viewBox: '0 0 400 400',
    xmlns: 'http://www.w3.org/2000/svg',
    children: [
      {
        component: 'line',
        x1: '0',
        y1: '80',
        x2: '100',
        y2: '20',
        stroke: 'black'
      },
      {
        component: 'line',
        x1: '0',
        y1: '180',
        x2: '100',
        y2: '120',
        stroke: 'black'
      },
      {
        component: 'g',
        transform: 'rotate(0)',
        children: [
          {
            component: 'path',
            stroke: 'red',
            d: 'M10 10 h 100 v 10 z'
          },
          {
            component: 'path',
            d: 'M 10 10 h 90 v 90 h -90 z'
          },
          {
            component: 'path',
            d: 'M 110 140 h 90 v 90 h -90 z',
            fill: 'yellow'
          },
          {
            component: 'path',
            d: 'M 10 10 h 90 v 90 h -90 z'
          },
          {
            component: 'path',
            d: 'M 110 140 h 90 v 90 h -90 z',
            fill: 'yellow'
          }
        ]
      }
    ]
  });

  const delta = createMemo(captureStoreUpdates(state));
  createEffect(() => {
    console.log(delta());
  });

  const map = useVirtualTree({ state, setState });
  const select = useSvgSelect<SVGNode>();

  const history = createUndoHistory(() => {
    trackStore(state);
    const copy = structuredClone(unwrap(state));
    return () => setState(reconcile(copy));
  });

  function PathInput(props: { value: string; onChange: (value: string) => void }) {
    return (
      <input
        type="text"
        class="w-full rounded border px-2 py-1 text-sm"
        value={props.value ?? ''}
        onInput={(e) => {
          props.onChange?.(e.target.value);
        }}
      />
    );
  }

  function ListItem(props: { child: SVGNode; children?: JSXElement }) {
    return (
      <li
        class={[
          'border-1.5 flex flex-shrink-0 flex-col overflow-hidden rounded bg-white  [&.selected]:border-blue-400 [&:not(:has(.group-child:hover))]:hover:bg-blue-50',
          select.selectedElementsIdsMap.has(props.child) ? 'selected' : ''
        ].join(' ')}
        onClick={(e) => {
          e.stopPropagation();
          batch(() => {
            if (!e.shiftKey) {
              select.selectedElementsIdsMap.clear();
            }
            select.selectedElementsIdsMap.add(props.child);
          });
        }}
      >
        <div class="border-b-1.5 flex w-full flex-grow place-items-center hover:bg-blue-200 [.selected>&]:border-blue-400">
          <DropdownMenu placement="bottom">
            <DropdownMenuTrigger class="px-1 py-0.5 text-xs hover:bg-blue-300">
              {select.selectedElementsIdsMap.has(props.child) ? '▣' : '▢'}
              {''}
              {props.child.component}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => {
                  map.get(props.child)?.updateParent(
                    produce((children: SVGNode[]) => {
                      children.push(structuredClone(unwrap(props.child)));
                    })
                  );
                }}
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  map.get(props.child)?.remove();
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div class="flex overflow-hidden">
          <svg width={40} height={40} viewBox="0 0 400 400" class="flex-shrink-0 border-e bg-white">
            <SVGRender {...props.child} />
          </svg>

          {/* TODO color picker??? */}
          <div class="flex min-w-0 flex-wrap">
            <div class="flex flex-1 place-items-baseline gap-1 font-mono text-xs">
              <span>stroke</span>
              <select
                value={props.child.stroke || 'black'}
                onChange={(e) => {
                  map.get(props.child)?.update('stroke', e.target.value);
                }}
              >
                <option value="black">Black</option>
                <option value="red">Red</option>
                <option value="blue">Blue</option>
              </select>
            </div>
            <div class="flex flex-1 place-items-baseline gap-1 font-mono text-xs">
              <span>fill</span>
              <select
                value={props.child?.fill || 'black'}
                onChange={(e) => {
                  map.get(props.child)?.update('fill', e.target.value);
                }}
              >
                <option value="black">Black</option>
                <option value="red">Red</option>
                <option value="blue">Blue</option>
              </select>
            </div>

            <Switch>
              <Match when={props.child.component === 'path'}>
                <div class="flex flex-1 place-items-baseline gap-1 font-mono text-xs">
                  <span>d</span>
                  <PathInput
                    value={props.child?.d || ''}
                    onChange={(e) => {
                      map.get(props.child)?.update('d', e);
                    }}
                  />
                </div>
              </Match>
            </Switch>
          </div>
        </div>

        <Show when={props.child.children}>
          <ul class="group-child flex w-full list-none flex-col gap-1 p-1">
            <For each={props.child.children}>{(subChild) => <ListItem child={subChild} />}</For>
          </ul>
        </Show>
      </li>
    );
  }

  function LayersView() {
    return (
      <>
        <DropdownMenu placement="bottom">
          <DropdownMenuTrigger>Add element</DropdownMenuTrigger>
          <DropdownMenuContent>
            <For each={['svg', 'path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', 'g']}>
              {(child) => (
                <DropdownMenuItem
                  onClick={() => {
                    setState(
                      'children',
                      produce((children) => {
                        children?.push({
                          component: child as SVGNode['component'],
                          children: []
                        });
                      })
                    );
                  }}
                >
                  {child}
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
        <ul id="Layers View" class="flex h-full list-none flex-col gap-2 overflow-y-auto p-2">
          <For each={state.children}>{(child) => <ListItem child={child}></ListItem>}</For>
        </ul>
      </>
    );
  }

  function Toolbar() {
    return (
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              disabled={!history.canUndo()}
              onClick={() => {
                history.undo();
              }}
            >
              Undo <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              onClick={() => {
                batch(() => {
                  for (const item of Array.from(select.selectedElementsIdsMap.keys())) {
                    const node = map.get(item);
                    if (node) {
                      node.update('fill', 'red');
                    }
                  }
                });
              }}
            >
              Select
            </MenubarItem>
            <MenubarItem
              onClick={() => {
                setState('children', 2, 'attributes', 'd', 'M 20 20 h 90 v 90 h -90 z');
              }}
            >
              Draw
            </MenubarItem>
            <MenubarItem
              onClick={() => {
                setState(
                  'children',
                  produce((children) => {
                    children?.pop();
                  })
                );
              }}
            >
              Erase
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    );
  }

  const [target, setTarget] = createSignal<HTMLElement>();
  const size = createElementSize(target);

  function SVGRender(props: SVGNode) {
    const [target, setTarget] = createSignal<DataWrapper<HTMLElement, SVGNode>>();

    createEffect(() => {
      const element = target();
      if (element) {
        element._inner_id = props;
      }
    });

    return (
      <Dynamic {...props} ref={setTarget}>
        <For each={props.children}>{(child) => SVGRender(child)}</For>
      </Dynamic>
    );
  }

  return (
    <div id="Display" class="flex h-screen w-full w-screen flex-col overflow-hidden">
      <Toolbar />
      <Resizable class="flex-1 overflow-hidden rounded-lg border">
        <ResizablePanel class="flex w-0 flex-grow flex-col overflow-hidden" initialSize={0.3} minSize={0.1}>
          <span class="font-mono">Layers</span>
          <LayersView />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel class="w-0 flex-grow overflow-hidden" initialSize={0.7} minSize={0.1}>
          <div id="Edit View" class="h-full w-full" ref={setTarget}>
            <svg
              class="bg-gray-500"
              ref={select.setSvgRef}
              width={size.width ?? 400}
              height={size.height ?? 400}
              viewBox={`0 0 ${size.width} ${size.height}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* <rect
                class="pointer-events-none"
                fill="#ffffff"
                x={state.viewBox.split(' ')[0]}
                y={state.viewBox.split(' ')[1]}
                width={state.viewBox.split(' ')[2]}
                height={state.viewBox.split(' ')[3]}
                data-ignore-selection={true}
              /> */}
              <g {...state}>
                <For each={state.children}>{(child) => SVGRender(child)}</For>
              </g>

              <g id="huds">
                <g></g>
                <OutlinePreview selectedElements={Array.from(select.selectedElementsIdsMap.values())} />
                {/* <BoxesPreview selectedElements={select.selectedElements()} /> */}
                <select.LassoSelectionPreview />
                <select.RectangleSelectionPreview />
              </g>
            </svg>
          </div>
        </ResizablePanel>
      </Resizable>
    </div>
  );
}

function Grip(props: { pos: [number, number] }) {
  return (
    <circle
      id={getGripId()}
      class="fill-white stroke-black stroke-1 [vector-effect:non-scaling-stroke]"
      cx={props.pos[0]}
      cy={props.pos[1]}
      r={10}
    />
  );
}
