import { Mat2x3 } from '@app-game/math/m2x3';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createRoot, JSX } from 'solid-js';
import { GridSVG } from './grid-svg';
import type { DebugElement } from './use-debug-layer';

export function useDebugGroup({
  activeElements,
  svgElement = GridSVG(),
  addElement
}: {
  activeElements: Map<string, DebugElement>;
  svgElement?: MaybeAccessor<JSX.Element>;
  addElement: (id: string, element: SVGElement) => void;
}) {
  // Update or create a tracked debug line with specific ID
  const updateGroup = (id: string, mat2x3: Mat2x3) => {
    const data = activeElements.get(id);

    if (!data) {
      createRoot((dispose) => {
        const element = (<g style={{ transform: mat2x3.toCssMatrix() }}>{access(svgElement)}</g>) as SVGElement;
        addElement(id, element);
        dispose();
      });
    } else {
      const element = data.element;
      element.setAttribute('style', `transform: ${mat2x3.toCssMatrix()}`);
      data.animation.currentTime = 0;
    }
  };

  return {
    updateGroup
  };
}
