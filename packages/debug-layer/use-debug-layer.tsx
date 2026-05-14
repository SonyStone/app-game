import { fadeOut } from './fade-out';
import { useDebugCircules } from './use-debug-circules';
import { useDebugGroup } from './use-debug-group';
import { useDebugLines } from './use-debug-lines';
import { useDebugPoints } from './use-debug-points';

export type DebugElement = { element: SVGElement; animation: Animation };

export function useDebugLayer() {
  const group = (<g />) as SVGGElement;

  const addElement = (id: string, element: SVGElement) => {
    group.appendChild(element);

    const animation = fadeOut(element);
    animation.finished.then(() => {
      if (activeElements.get(id)?.animation === animation) {
        element.remove();
        activeElements.delete(id);
      }
    });
    activeElements.set(id, { element, animation });
  };

  // Track active debug points with their timers and elements
  const activeElements = new Map<string, DebugElement>();

  const { updateCircule } = useDebugCircules({ activeElements, addElement });
  const { updatePoint } = useDebugPoints({ activeElements, addElement });
  const { updateLine } = useDebugLines({ activeElements, addElement });
  const { updateGroup } = useDebugGroup({
    activeElements,
    addElement,
    svgElement: () => (
      <g class="scale-25">
        {/* <!-- Draw the paths --> */}
        <path id="lineAB" d="M 100 350 l 150 -300" stroke="red" stroke-width="4" />
        <path id="lineBC" d="M 250 50 l 150 300" stroke="red" stroke-width="4" />
        <path id="lineMID" d="M 175 200 l 150 0" stroke="green" stroke-width="4" />
        <path id="lineAC" d="M 100 350 q 150 -300 300 0" stroke="blue" stroke-width="4" fill="none" />

        {/* <!-- Mark relevant points --> */}
        <g stroke="black" stroke-width="3" fill="black">
          <circle id="pointA" cx="100" cy="350" r="4" />
          <circle id="pointB" cx="250" cy="50" r="4" />
          <circle id="pointC" cx="400" cy="350" r="4" />
        </g>

        {/* <!-- Label the points --> */}
        <g font-size="30" font-family="sans-serif" fill="green" text-anchor="middle">
          <text x="100" y="350" dx="-30">
            A
          </text>
          <text x="250" y="50" dy="-10">
            B
          </text>
          <text x="400" y="350" dx="30">
            C
          </text>
        </g>
      </g>
    )
  });

  return {
    layer: group,
    updatePoint,
    updateLine,
    updateGroup,
    updateCircule
  };
}

export type DebugLayer = ReturnType<typeof useDebugLayer>;
