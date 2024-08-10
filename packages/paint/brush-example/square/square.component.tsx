import { OGLRenderingContext, Texture, Transform } from '@packages/ogl';
import { MaybeAccessor } from '@solid-primitives/utils';
import { onCleanup } from 'solid-js';
import { createSquareMesh } from './create-square-mesh';

export const SquareComponent = (props: {
  gl: OGLRenderingContext;
  parent: Transform;
  texture: MaybeAccessor<Texture | undefined>;
  transparent?: MaybeAccessor<boolean>;
  position?: { top: number; bottom: number; left: number; right: number };
  zIndex?: MaybeAccessor<number>;
}) => {
  const mesh = createSquareMesh(props);

  mesh.setParent(props.parent);
  onCleanup(() => {
    props.parent.removeChild(mesh);
  });

  return <></>;
};
