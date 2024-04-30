import AffineTransformations from './affine-transformations';
import AffineTransformations3D from './affine-transformations-3d';
import CameraProjectionSVG from './camera-projection-svg/camera-projection-svg';
import CameraProjectionWebGL2 from './camera-projection-webgl2/camera-projection-webgl2';
import GeometricAlgebra from './geometric-algebra/geometric-algebra';
import PlaneEquation from './plane-equation';

export default function MathStuff() {
  return (
    <div class="flex flex-wrap gap-4 p-4">
      <GeometricAlgebra />
      <AffineTransformations />
      <AffineTransformations3D />
      <CameraProjectionSVG />
      <CameraProjectionWebGL2 />
      <PlaneEquation />
    </div>
  );
}
