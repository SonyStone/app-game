import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@packages/components/ui/dropdown-menu';
import { batch, ComponentProps, For, JSXElement, Match, Show, Switch } from 'solid-js';
import { produce, unwrap } from 'solid-js/store';
import { PathInput } from '../path-input';
import { SVGNode } from '../svg-node';
import { useSvgSelect } from '../use-svg-select';
import { Wrapped } from '../use-virtual-tree';
import { SVGRender } from './editor-view';

// TODO: Change onClicks to command pattern

declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'layers-view': ComponentProps<'div'>;
    }
  }
}

export function LayersView(props: {
  select: ReturnType<typeof useSvgSelect<SVGNode>>;
  map: Map<SVGNode, Wrapped<SVGNode>>;
  setState: (key: 'children', updater: (children: SVGNode[]) => SVGNode[]) => void;
  state: SVGNode;
}) {
  return (
    <layers-view class="contents">
      <DropdownMenu placement="bottom">
        <DropdownMenuTrigger>Add element</DropdownMenuTrigger>
        <DropdownMenuContent>
          <For each={['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', 'g']}>
            {(child) => (
              <DropdownMenuItem
                onClick={() => {
                  props.setState(
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
        <For each={props.state.children}>
          {(child) => <ListItem child={child} select={props.select} map={props.map} />}
        </For>
      </ul>
    </layers-view>
  );
}

function ListItem(props: {
  child: SVGNode;
  children?: JSXElement;
  select: ReturnType<typeof useSvgSelect<SVGNode>>;
  map: Map<SVGNode, Wrapped<SVGNode>>;
}) {
  return (
    <li
      class={[
        props.select.selectedElementsIdsMap.has(props.child) ? 'selected' : '',
        'border-1.5 [&.selected]:(border-blue-400 bg-blue-50) flex flex-shrink-0 flex-col overflow-hidden  rounded bg-white [&:not(:has(.group-child:hover))]:hover:bg-blue-50'
      ].join(' ')}
      onClick={(e) => {
        e.stopPropagation();
        batch(() => {
          if (!e.shiftKey) {
            props.select.selectedElementsIdsMap.clear();
          }
          props.select.selectedElementsIdsMap.add(props.child);
        });
      }}
    >
      <div class="border-b-1.5 flex w-full flex-grow place-items-center hover:bg-blue-200 [.selected>&]:border-blue-400">
        <DropdownMenu placement="bottom">
          <DropdownMenuTrigger class="px-1 py-0.5 text-xs hover:bg-blue-300">
            {props.select.selectedElementsIdsMap.has(props.child) ? '▣' : '▢'}
            {''}
            {props.child.component}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => {
                props.map.get(props.child)?.updateParent(
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
                props.map.get(props.child)?.remove();
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
        <div class="flex w-full min-w-0 flex-wrap">
          <div class="flex flex-1 place-items-baseline gap-1 font-mono text-xs">
            <span>stroke</span>
            <select
              value={props.child.stroke || 'black'}
              onChange={(e) => {
                props.map.get(props.child)?.update('stroke', e.target.value);
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
                props.map.get(props.child)?.update('fill', e.target.value);
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
                    props.map.get(props.child)?.update('d', e);
                  }}
                />
              </div>
            </Match>
          </Switch>
        </div>
      </div>

      <Show when={props.child.children}>
        <ul class="group-child flex w-full list-none flex-col gap-1 p-1">
          <For each={props.child.children}>
            {(subChild) => <ListItem child={subChild} select={props.select} map={props.map} />}
          </For>
        </ul>
      </Show>
    </li>
  );
}
