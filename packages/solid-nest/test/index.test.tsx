import { isServer, render, renderToString } from '@solidjs/web';
import { AdvancedBlockTree, BlockTree } from 'src';
import { describe, it } from 'vitest';

describe('BlockTree', () => {
  it('can be instantiated', () => {
    const App = () => {
      return (
        <BlockTree root={{ key: 'root' }} getKey={(block) => block.key} getChildren={() => []}>
          {() => <div />}
        </BlockTree>
      );
    };

    if (isServer) {
      renderToString(App);
    } else {
      render(App, document.body);
    }
  });
});

describe('AdvancedBlockTree', () => {
  it('can be instantiated', () => {
    const App = () => {
      return (
        <AdvancedBlockTree<string, { key: string }>
          root={{ key: 'root', getBlocks: () => [] }}
          getKey={(block) => block.key}
        >
          {() => <div />}
        </AdvancedBlockTree>
      );
    };

    if (isServer) {
      renderToString(App);
    } else {
      render(App, document.body);
    }
  });
});
