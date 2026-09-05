import { describe, expect, it } from 'vitest';
import type { ICommandCapture } from '../../shared/capture/commandCapture';
import type { ISceneMeshCapture } from '../../shared/capture/sceneCapture';
import {
  inferSceneUpAxis,
  isSceneMeshDraw,
  selectColorTexture,
  selectUniqueCapturedMeshes,
  selectUniqueMaterialDraws
} from './sceneCapture';

describe('scene draw selection', () => {
  it('deduplicates render passes and keeps the material-rich draw', () => {
    const early = createDraw(7, 'EarlyZ', undefined);
    const material = createDraw(9, 'PBR_Opaque', 'baseColorTexture');

    const selected = selectUniqueMaterialDraws([early, material]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe(9);
  });

  it('deduplicates a position-only depth pass against a richer color pass', () => {
    const early = createDraw(7, 'EarlyZ', undefined);
    const material = createDraw(9, 'PBR_Opaque', 'baseColorTexture');
    (material.DrawCall as { attributes: unknown[] }).attributes.push({
      name: 'uv',
      enabled: true,
      arraySize: 2,
      arrayType: 'FLOAT',
      stride: 8,
      offsetPointer: 0,
      divisor: 0,
      bufferBinding: { __SPECTOR_Object_TAG: { typeName: 'WebGLBuffer', id: 4 } }
    });

    const selected = selectUniqueMaterialDraws([early, material]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe(9);
  });

  it('keeps repeated geometry with a different object transform', () => {
    const first = createDraw(7, 'PBR_Opaque', 'baseColorTexture', 0);
    const second = createDraw(9, 'PBR_Opaque', 'baseColorTexture', 10);

    expect(selectUniqueMaterialDraws([first, second])).toHaveLength(2);
  });

  it('does not treat tiny screen-space draws as scene meshes', () => {
    const material = createDraw(9, 'PBR_Opaque', 'baseColorTexture');
    const screenTriangle = {
      ...material,
      id: 10,
      name: 'drawArrays',
      commandArguments: [4, 0, 3]
    } as unknown as ICommandCapture;

    expect(isSceneMeshDraw(material)).toBe(true);
    expect(isSceneMeshDraw(screenTriangle)).toBe(false);
  });

  it('uses visible material passes instead of depth-only copies', () => {
    expect(isSceneMeshDraw(createDraw(7, 'EarlyZ_Opaque', undefined))).toBe(false);
    expect(isSceneMeshDraw(createDraw(9, 'PBR_Opaque', 'Texture0'))).toBe(true);
  });

  it('recognizes Sketchfab PBR world space as Z-up', () => {
    const draw = createDraw(9, 'PBR_Opaque', 'Texture0');
    (draw.DrawCall as { uniforms: unknown[] }).uniforms.push(
      { name: 'uModelMatrix', type: 'FLOAT_MAT4' },
      { name: 'uModelViewMatrix', type: 'FLOAT_MAT4' }
    );

    expect(inferSceneUpAxis([draw])).toBe('z');
    expect(inferSceneUpAxis([createDraw(10, 'MeshStandardMaterial', 'map')])).toBe('y');
  });
});

describe('scene color texture selection', () => {
  it('prefers an sRGB texture over a larger ambiguous linear texture', () => {
    const command = createTextureDraw([
      textureUniform('a', 1, 'RGBA8', 2048),
      textureUniform('b', 2, 'SRGB8_ALPHA8', 1024)
    ]);

    expect(selectColorTexture(command)?.uniformName).toBe('b');
  });

  it('refuses to guess between several ambiguous linear material textures', () => {
    const command = createTextureDraw([textureUniform('a', 1, 'RGBA8', 1024), textureUniform('b', 2, 'RGBA8', 1024)]);

    expect(selectColorTexture(command)).toBeUndefined();
  });

  it('uses the largest unnamed sRGB texture as the likely base color map', () => {
    const command = createTextureDraw([
      textureUniform('a', 1, 'SRGB8_ALPHA8', 1024),
      textureUniform('b', 2, 'SRGB8_ALPHA8', 2048)
    ]);

    expect(selectColorTexture(command)?.uniformName).toBe('b');
  });

  it('recognizes a conventional map uniform', () => {
    const command = createTextureDraw([textureUniform('map', 1, 'RGBA8', 1024)]);

    expect(selectColorTexture(command)?.uniformName).toBe('map');
  });

  it('uses Sketchfab Texture0 as the base color instead of its material data maps', () => {
    const command = createTextureDraw([
      textureUniform('Texture0', 1, 'RGBA', 4096),
      textureUniform('Texture1', 2, 'RGBA', 4096),
      textureUniform('Texture2', 3, 'RGBA', 4096),
      textureUniform('Texture7', 4, 'RGBA', 2048)
    ]);

    expect(selectColorTexture(command)?.uniformName).toBe('Texture0');
  });

  it('follows the fragment shader when a Sketchfab material stores albedo in Texture1', () => {
    const command = createTextureDraw([
      textureUniform('Texture0', 1, 'RGBA', 4096),
      textureUniform('Texture1', 2, 'RGBA', 4096)
    ]);
    (command.DrawCall as { shaders: Array<{ source?: string }> }).shaders[0]!.source = `
      vec3 getMaterialAlbedo() {
        vec3 albedo;
        albedo = uAlbedoPBRFactor * sRGBToLinear(texture(Texture1, vTexCoord0).rgb);
        return albedo;
      }
    `;

    expect(selectColorTexture(command)?.uniformName).toBe('Texture1');
  });
});

describe('captured scene mesh selection', () => {
  it('keeps the textured copy of geometry repeated across render passes', () => {
    const depth = createCapturedMesh(7, false);
    const color = createCapturedMesh(9, true);

    const selected = selectUniqueCapturedMeshes([depth, color]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.mesh.commandId).toBe(9);
  });
});

function createCapturedMesh(commandId: number, textured: boolean): ISceneMeshCapture {
  return {
    mesh: {
      status: 'available',
      commandId,
      mode: 5,
      modeName: 'TRIANGLE_STRIP',
      positionAttribute: 'position',
      positionSource: 'vertex-shader',
      positionSpace: 'world',
      projectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      clipPositions: [0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1],
      availableAttributes: [],
      uvs: textured ? { attributeName: 'uv', dimensions: 2, values: [0, 0, 1, 0, 0, 1] } : undefined,
      dimensions: 3,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      elementCount: 3,
      capturedElementCount: 3,
      instanceCount: 1,
      truncated: false
    },
    texture: textured
      ? {
          status: 'available',
          commandId,
          uniformIndex: 0,
          textureIndex: 0,
          target: 'TEXTURE_2D',
          width: 1,
          height: 1,
          src: 'data:'
        }
      : undefined
  };
}

function createTextureDraw(uniforms: readonly unknown[]): ICommandCapture {
  return {
    ...createDraw(11, 'PBR_Opaque'),
    DrawCall: { ...(createDraw(11, 'PBR_Opaque').DrawCall as object), uniforms }
  } as unknown as ICommandCapture;
}

function textureUniform(name: string, id: number, internalFormat: string, size: number) {
  return {
    name,
    type: 'SAMPLER_2D',
    texture: {
      target: 'TEXTURE_2D',
      texture: { __SPECTOR_Object_TAG: { typeName: 'WebGLTexture', id } },
      internalFormat,
      format: 'RGBA',
      width: size,
      height: size
    }
  };
}

function createDraw(id: number, shaderName: string, textureName?: string, translation = 0): ICommandCapture {
  const uniform = textureName
    ? {
        name: textureName,
        type: 'SAMPLER_2D',
        value: 0,
        texture: {
          target: 'TEXTURE_2D',
          texture: { __SPECTOR_Object_TAG: { typeName: 'WebGLTexture', id: 3 } }
        }
      }
    : undefined;
  return {
    id,
    name: 'drawElements',
    marker: '',
    commandArguments: [5, 100, 5123, 0],
    DrawCall: {
      shaders: [{ name: shaderName }],
      attributes: [
        {
          name: 'position',
          enabled: true,
          arraySize: 3,
          arrayType: 'FLOAT',
          stride: 12,
          offsetPointer: 0,
          divisor: 0,
          bufferBinding: { __SPECTOR_Object_TAG: { typeName: 'WebGLBuffer', id: 1 } }
        }
      ],
      elementArray: { arrayBuffer: { __SPECTOR_Object_TAG: { typeName: 'WebGLBuffer', id: 2 } } },
      uniforms: [
        {
          name: 'model',
          type: 'FLOAT_MAT4',
          value: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, translation, 0, 0, 1]
        },
        ...(uniform ? [uniform] : [])
      ]
    }
  } as unknown as ICommandCapture;
}
