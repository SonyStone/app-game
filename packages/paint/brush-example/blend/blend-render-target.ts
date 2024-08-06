import { Mesh, OGLRenderingContext, Program, Texture } from '@packages/ogl';
import { RenderTarget } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal } from 'solid-js';
import { BlendModes, ColorBlendModes } from '../blend-modes';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import fragment from './blend.frag?raw';
import vertex from './blend.vert?raw';

/**
 * creates new render target (texture) - sum of blend of two textures
 */
export const createBlendRenderTarget = (props: {
  gl: OGLRenderingContext;
  target?: MaybeAccessor<RenderTarget>;
  texture1?: MaybeAccessor<RenderTarget | undefined>;
  texture2?: MaybeAccessor<RenderTarget | undefined>;
  blendMode?: MaybeAccessor<BlendModes | undefined>;
  colorBlendMode?: MaybeAccessor<ColorBlendModes | undefined>;
  opacity?: MaybeAccessor<number | undefined>;
}) => {
  const { gl, target = new RenderTarget(gl, DEFAULTS_RENDER_TARGET_OPTIONS) } = props;
  const [layer, setLayer] = createSignal(access(target), { equals: () => false });

  const mesh = new BlendMesh(gl);

  const render = () => {
    const texture1 = access(props.texture1);
    const texture2 = access(props.texture2);
    mesh.setTexture1(texture1?.texture);
    mesh.setTexture2(texture2?.texture);
    mesh.setBlendMode(access(props.blendMode) ?? BlendModes.NORMAL);
    mesh.setColorBlendMode(access(props.colorBlendMode) ?? ColorBlendModes.USING_GAMMA);
    mesh.setOpacity(access(props.opacity) ?? 1.0);

    console.log(`3️⃣ rendering blend apply ${texture2?.id} to ${texture1?.id} to target: ${access(target).id}`);

    gl.renderer.render({
      scene: mesh,
      target: access(target),
      clear: false
    });
    setLayer(access(target));
  };

  return { layer, render };
};

export class BlendMesh extends Mesh {
  constructor(gl: OGLRenderingContext) {
    super(gl, {
      geometry: new Square(gl),
      program: new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          tMap1: { value: undefined },
          tMap2: { value: undefined },
          blendMode: { value: BlendModes.NORMAL },
          colorBlendMode: { value: ColorBlendModes.USING_GAMMA },
          uOpacity: { value: 1.0 }
        },
        transparent: false
      })
    });
  }

  setColorBlendMode(value: ColorBlendModes) {
    this.program.uniforms.colorBlendMode.value = value;
  }

  setBlendMode(value: BlendModes) {
    this.program.uniforms.blendMode.value = value;
  }

  setOpacity(value: number) {
    this.program.uniforms.uOpacity.value = value;
  }

  setTexture1(value?: Texture) {
    this.program.uniforms.tMap1.value = value;
  }

  setTexture2(value?: Texture) {
    this.program.uniforms.tMap2.value = value;
  }

  render(target?: RenderTarget) {
    this.gl.renderer.render({
      scene: this,
      target,
      clear: true
    });
  }
}
