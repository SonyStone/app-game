import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarShortcut,
  MenubarTrigger
} from '@packages/components/ui/menubar';
import { batch } from 'solid-js';
import { produce, SetStoreFunction } from 'solid-js/store';
import { SVGNode } from '../svg-node';
import { useSvgSelect } from '../use-svg-select';
import { Wrapped } from '../use-virtual-tree';

// TODO: Change to command pattern
export function Toolbar(props: {
  history: {
    canUndo: () => boolean;
    undo: () => void;
  };
  map: Map<SVGNode, Wrapped<SVGNode>>;
  select: ReturnType<typeof useSvgSelect<SVGNode>>;
  setState: SetStoreFunction<SVGNode>;
  state: SVGNode;
}) {
  return (
    <Menubar class="select-none border-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            disabled={!props?.history.canUndo()}
            onClick={() => {
              props?.history.undo();
            }}
          >
            Undo <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            onClick={() => {
              batch(() => {
                for (const item of Array.from(props?.select.selectedElementsIdsMap.keys())) {
                  const node = props?.map.get(item);
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
              props.setState(
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
