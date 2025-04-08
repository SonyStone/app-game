import { Vec2Tuple } from '@packages/math-2/v2';
import { createRoot } from 'solid-js';
import type { DebugElement } from './use-debug-layer';

export function useDebugLines({
  activeElements,
  addElement
}: {
  activeElements: Map<string, DebugElement>;
  addElement: (id: string, element: SVGElement) => void;
}) {
  // Update or create a tracked debug line with specific ID
  const updateLine = (id: string, point1: Vec2Tuple, point2: Vec2Tuple, color = 'red', size = 2) => {
    const data = activeElements.get(id);

    if (!data) {
      createRoot((dispose) => {
        const element = (
          <line x1={point1[0]} y1={point1[1]} x2={point2[0]} y2={point2[1]} stroke={color} stroke-width={size} />
        ) as SVGElement;

        addElement(id, element);
        dispose();
      });
    } else {
      const element = data.element;
      element.setAttribute('x1', point1[0].toString());
      element.setAttribute('y1', point1[1].toString());
      element.setAttribute('x2', point2[0].toString());
      element.setAttribute('y2', point2[1].toString());

      data.animation.currentTime = 0;
    }
  };

  return {
    updateLine
  };
}
