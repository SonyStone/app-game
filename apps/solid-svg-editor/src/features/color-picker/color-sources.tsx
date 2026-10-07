import type { JSX } from '@solidjs/web';
import { createContext, createMemo, useContext, type Accessor } from 'solid-js';

import type { SvgElementNode } from '../../svg-model';
import type { ColorPalette } from '../../editor/palettes';
import { documentGradients, type GradientOption } from './document-gradients';

/** Where the color picker gets its choices: the user's palettes and the gradients of the open document. */
export type ColorSources = {
  readonly palettes: Accessor<readonly ColorPalette[]>;
  readonly gradients: Accessor<readonly GradientOption[]>;
};

const ColorSourcesContext = createContext<ColorSources>({ palettes: () => [], gradients: () => [] });

/** Color choices for pickers below the provider; outside one, both lists are empty. */
export function useColorSources(): ColorSources {
  return useContext(ColorSourcesContext);
}

/** Provides the palettes and the gradients of `root` to color pickers in its subtree. */
export function ColorSourcesProvider(props: {
  readonly palettes: readonly ColorPalette[];
  readonly root: SvgElementNode;
  readonly children: JSX.Element;
}) {
  const gradients = createMemo(() => documentGradients(props.root));

  return (
    <ColorSourcesContext value={{ palettes: () => props.palettes, gradients }}>{props.children}</ColorSourcesContext>
  );
}
