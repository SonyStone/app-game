import { useDebugLayer } from '@app-game/debug-layer/use-debug-layer';
import { createSignal } from 'solid-js';
import { DemoAngleVisualization } from './demo-angle-visualization';
import { TestMatrixWithTransform } from './demo-matrix-with-transform';
import { DemoRotationMatrixAroundPoint } from './demo-rotation-matrix-around-point';
import { TestRotationMatrixBetweenPointPairs } from './demo-rotation-matrix-between-point-pairs';
import { TestTransformMatrix } from './demo-transform-matrix';

export default function () {
  const debugLayer = useDebugLayer();

  const [ref, setRef] = createSignal<SVGSVGElement | undefined>(undefined);

  return (
    <div>
      <div class="p-4 text-sm">
        <h1>Math Examples</h1>
      </div>
      {/* Debug svg layer */}
      <svg ref={setRef} class="fixed right-0 top-0 z-10 h-screen w-screen touch-none">
        <TestMatrixWithTransform debugLayer={debugLayer} />
        <TestRotationMatrixBetweenPointPairs root={ref()} debugLayer={debugLayer} />
        <DemoRotationMatrixAroundPoint />
        <TestTransformMatrix debugLayer={debugLayer} />
        <DemoAngleVisualization debugLayer={debugLayer} />

        {debugLayer.layer}
      </svg>
    </div>
  );
}
