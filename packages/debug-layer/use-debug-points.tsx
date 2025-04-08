import { Vec2Tuple } from '@packages/math-2/v2';
import type { DebugElement } from './use-debug-layer';

export function useDebugPoints({
  activeElements,
  addElement
}: {
  activeElements: Map<string, DebugElement>;
  addElement: (id: string, element: SVGElement) => void;
}) {
  // Update or create a tracked debug point with specific ID
  const updatePoint = (id: string, point: Vec2Tuple, color = 'red', size = 2) => {
    const data = activeElements.get(id);

    if (!data) {
      const element = (<circle cx={/*@once*/ point[0]} cy={/*@once*/ point[1]} r={size} fill={color} />) as SVGElement;
      addElement(id, element);
    } else {
      const element = data.element;
      element.setAttribute('cx', point[0].toString());
      element.setAttribute('cy', point[1].toString());

      data.animation.currentTime = 0;
    }
  };

  return {
    updatePoint
  };
}
