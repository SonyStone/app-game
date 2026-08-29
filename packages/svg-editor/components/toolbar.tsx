import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarShortcut,
  MenubarTrigger
} from '@app-game/components/ui/menubar';

import { storePath, StoreSetter } from 'solid-js';
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
  setState: StoreSetter<SVGNode>;
  state: SVGNode;
}) {
  return (
    <Menubar class="border-0 shadow-none select-none">
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
              {
                for (const item of Array.from(props?.select.selectedElementsIdsMap.keys())) {
                  const node = props?.map.get(item);
                  if (node) {
                    node.update(storePath('fill', 'red'));
                  }
                }
              }
            }}
          >
            Select
          </MenubarItem>
          <MenubarItem
            onClick={() => {
              props.setState((state) => {
                state.children?.pop();
              });
            }}
          >
            Erase
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
