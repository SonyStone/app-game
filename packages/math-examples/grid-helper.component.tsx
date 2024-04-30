import { GridHelper, OGLRenderingContext, Transform } from '@packages/ogl';
import { onCleanup } from 'solid-js';

export function GridHelperComponent({
  gl,
  size = 10,
  divisions = 10,
  scene
}: {
  gl: OGLRenderingContext;
  size?: number;
  divisions?: number;
  scene: Transform;
}) {
  const grid = new GridHelper(gl, { size, divisions });
  grid.setParent(scene);

  onCleanup(() => {
    scene.removeChild(grid);
  });

  return <></>;
}
