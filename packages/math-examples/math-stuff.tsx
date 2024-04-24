import AffineTransformations from './affine-transformations';
import AffineTransformations3D from './affine-transformations-3d';
import CameraProjection from './camera-projection';
import GeometricAlgebra from './geometric-algebra/geometric-algebra';

export default function MathStuff() {
  return (
    <div class="flex flex-wrap gap-4 p-4">
      <GeometricAlgebra />
      <AffineTransformations />
      <AffineTransformations3D />
      <CameraProjection />
    </div>
  );
}
