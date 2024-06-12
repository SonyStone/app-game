import { FVec2 } from '@packages/math';
import { Mesh, OGLRenderingContext, Program, RenderTarget, Texture } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { BlendModes } from '../blend-modes';
import fragment from './layers-texture.frag?raw';
import vertex from './layers-texture.vert?raw';

/**
 * * Creaets a texture with 4 colors (background)
 * * Get the texture from the parent (brush)
 * * Render the brush over background to render target
 * * Display the render target texture on a plane
 */
export const createLayersRenderTarget = ({
  gl,
  texture,
  options = {
    width: 1024,
    height: 1024,
    type: GL_DATA_TYPE.HALF_FLOAT,
    format: gl.RGBA,
    internalFormat: gl.RGBA16F,
    depth: false
  }
}: {
  gl: OGLRenderingContext;
  texture?: Texture;
  options?: Partial<RenderTargetOptions>;
}) => {
  const mockTexture = createTexture4colors(gl);

  const layer1 = new RenderTarget(gl, options); // black background

  const textureInput = { value: layer1.texture };
  const brushInput = { value: texture };

  const blendMode = { value: BlendModes.NORMAL };
  const opacity = { value: 1.0 };

  const lowerLeft = [-0.1, -0.1];
  const upperRight = [4, 4];
  const geometry = new Square(gl, {
    attributes: {
      uv2: {
        size: 2,
        data: new Float32Array([
          lowerLeft[0],
          lowerLeft[1],
          upperRight[0],
          lowerLeft[1],
          lowerLeft[0],
          upperRight[1],
          upperRight[0],
          upperRight[1]
        ])
      }
    }
  });
  const mouse = FVec2.create(0.5, 0.5);
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      tIpnut: textureInput,
      tBrush: brushInput,
      uMouse: { value: mouse },
      uColor: { value: [0.0, 0.32, 1.0] },
      blendMode,
      uOpacity: opacity
    }
  });
  const mesh = new Mesh(gl, { geometry, program });

  textureInput.value = mockTexture;
  blendMode.value = BlendModes.NORMAL;
  opacity.value = 0.9;
  const layer2 = new RenderTarget(gl, options);
  // ! render to render target
  gl.renderer.render({
    scene: mesh,
    target: layer2,
    clear: false
  });

  return layer2;
};
