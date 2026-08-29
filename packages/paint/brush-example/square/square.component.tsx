import { OGLRenderingContext, Texture, Transform } from '@app-game/ogl';
import { MaybeAccessor } from '@solid-primitives/utils';
import { onCleanup, untrack } from 'solid-js';
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
  const parent = untrack(() => props.parent);

  mesh.setParent(parent);
  onCleanup(() => {
    parent.removeChild(mesh);
  });

  return <></>;
};
