import { describe, expect, it } from 'vitest';
import type { ICapture } from '../shared/capture/capture';
import { CommandCaptureStatus, type ICommandCapture } from '../shared/capture/commandCapture';
import { extractMeshDraws, extractTextureAssets } from './capture-assets';

describe('capture assets', () => {
  it('deduplicates sampler texture previews across draw calls', () => {
    const capture = createCapture([
      createDrawCommand(1, {
        uniforms: [
          { name: 'baseColor', texture: { width: 128, height: 64, format: 'RGBA', visual: { TEXTURE_2D: IMAGE } } }
        ],
        attributes: []
      }),
      createDrawCommand(2, {
        uniforms: [
          { name: 'baseColor', texture: { width: 128, height: 64, format: 'RGBA', visual: { TEXTURE_2D: IMAGE } } }
        ],
        attributes: []
      })
    ]);

    expect(extractTextureAssets(capture)).toEqual([
      expect.objectContaining({ commandId: 1, uniformName: 'baseColor', target: 'TEXTURE_2D', width: 128, height: 64 })
    ]);
  });

  it('summarizes draw calls that have buffered attributes', () => {
    const command = createDrawCommand(7, {
      attributes: [{ name: 'position', bufferBinding: { __SPECTOR_Object_TAG: { id: 3 } } }],
      uniforms: []
    });
    command.commandArguments = [4, 36, 5123, 0] as unknown as IArguments;

    expect(extractMeshDraws(createCapture([command]))).toEqual([
      expect.objectContaining({ commandId: 7, mode: 'TRIANGLES', elementCount: 36, instanceCount: 1 })
    ]);
  });

  it('lists live sampler bindings even when direct texture readback produced no image', () => {
    const capture = createCapture([
      createDrawCommand(4, {
        uniforms: [
          {
            name: 'compressedColor',
            texture: {
              target: 'TEXTURE_2D',
              texture: { __SPECTOR_Object_TAG: { id: 12, typeName: 'WebGLTexture' } },
              visual: {}
            }
          }
        ],
        attributes: []
      })
    ]);

    expect(extractTextureAssets(capture)).toEqual([
      expect.objectContaining({
        commandId: 4,
        uniformIndex: 0,
        textureIndex: 0,
        uniformName: 'compressedColor',
        target: 'TEXTURE_2D'
      })
    ]);
    expect(extractTextureAssets(capture)[0]).not.toHaveProperty('src');
  });
});

function createDrawCommand(id: number, drawCall: Record<string, unknown>) {
  return {
    id,
    startTime: 0,
    commandEndTime: 0,
    endTime: 0,
    name: 'drawElements',
    marker: '',
    commandArguments: [4, 3, 5123, 0] as unknown as IArguments,
    result: undefined,
    stackTrace: [],
    status: CommandCaptureStatus.Valid,
    text: 'drawElements',
    DrawCall: drawCall
  } satisfies ICommandCapture;
}

function createCapture(commands: ICapture['commands']): ICapture {
  return { commands } as ICapture;
}

const IMAGE = 'data:image/png;base64,AAAA';
