import { Mesh, OGLRenderingContext, Program, Texture, Transform } from '@packages/ogl';
import { Square } from '@packages/ogl/extras/square';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';
import fragment from './square.frag?raw';
import vertex from './square.vert?raw';

export const createSquareMesh = (props: {
  gl: OGLRenderingContext;
  texture: MaybeAccessor<Texture | undefined>;
  transparent?: MaybeAccessor<boolean>;
  position?: { top: number; bottom: number; left: number; right: number };
  zIndex?: MaybeAccessor<number>;
}) => {
  const { gl } = props;
  const tMap = { value: access(props.texture) };
  const zIndex = { value: access(props.zIndex) };
  const mesh = new Mesh(gl, {
    geometry: new Square(gl, { position: props.position }),
    program: new Program(props.gl, {
      vertex,
      fragment,
      uniforms: {
        tMap,
        zIndex
      },
      depthTest: true,
      transparent: access(props.transparent) ?? false,
      blendFunc: { src: gl.SRC_ALPHA, dst: gl.ONE_MINUS_SRC_ALPHA, srcAlpha: gl.ONE, dstAlpha: gl.ONE_MINUS_SRC_ALPHA }
    })
  });

  effect(() => {
    tMap.value = access(props.texture);
  });

  effect(() => {
    zIndex.value = access(props.zIndex);
  });

  effect(() => {
    mesh.program.setTransparent(access(props.transparent) ?? false);
  });

  return mesh;
};

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
