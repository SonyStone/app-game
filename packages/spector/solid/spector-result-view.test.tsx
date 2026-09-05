import { render } from '@solidjs/web';
import { createComponent } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ICapture } from '../shared/capture/capture';
import { CommandCaptureStatus, type ICommandCapture } from '../shared/capture/commandCapture';
import type { IMeshCapture } from '../shared/capture/meshCapture';
import { SpectorResultView } from './spector-result-view';

describe('SpectorResultView meshes tab', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('opens and starts reading the selected draw without throwing', async () => {
    const capture = createCapture();
    const host = document.createElement('div');
    document.body.append(host);
    const requestedCommands: number[] = [];
    let resolveMesh!: (mesh: IMeshCapture) => void;
    const meshPromise = new Promise<IMeshCapture>((resolve) => {
      resolveMesh = resolve;
    });
    const readMesh = async (_capture: ICapture, commandId: number) => {
      requestedCommands.push(commandId);
      return meshPromise;
    };
    installCanvasMocks();

    dispose = render(() => createComponent(SpectorResultView, { captures: [capture], onReadMesh: readMesh }), host);
    await nextTask();

    const meshesTab = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.startsWith('Meshes')
    );
    expect(meshesTab).toBeDefined();
    meshesTab?.click();
    await nextTask();

    const drawButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('#7 drawElements')
    );
    drawButton?.click();
    await nextTask();

    expect(host.textContent).toContain('Reading mesh buffers…');
    expect(requestedCommands).toEqual([7]);

    resolveMesh(createMesh());
    await nextTask();
    expect(host.textContent).toContain('Drag to rotate');
  });

  it('loads all scene meshes into the combined preview', async () => {
    const capture = createCapture();
    const host = document.createElement('div');
    document.body.append(host);
    const mesh = createMesh();
    const readScene = vi.fn(async () => ({
      status: 'available' as const,
      meshes: [{ mesh }],
      upAxis: 'y' as const,
      drawCount: 1,
      duplicateDrawCount: 0,
      skippedDrawCount: 0,
      unreadableDrawCount: 0,
      unreadableReasons: [],
      alternateCameraDrawCount: 0,
      limitedDrawCount: 0,
      uvMeshCount: 0,
      colorTextureCandidateCount: 0,
      textureFailureCount: 0,
      texturedMeshCount: 0,
      truncated: false
    }));
    installCanvasMocks();

    dispose = render(() => createComponent(SpectorResultView, { captures: [capture], onReadScene: readScene }), host);
    await nextTask();
    const meshesTab = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.startsWith('Meshes')
    );
    meshesTab?.click();
    await nextTask();
    await nextTask();

    expect(readScene).toHaveBeenCalledWith(capture);
    expect(host.textContent).toContain('1 unique meshes');
    expect(host.textContent).toContain('0 material-textured');
    expect(host.textContent).not.toContain('Captured frame colors');
    expect(host.textContent).toContain('Grid + XYZ');
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(host.textContent).toContain('Reset camera');
  });

  it('loads a GPU-sampled preview when the capture has texture metadata but no image', async () => {
    const capture = createCapture();
    const host = document.createElement('div');
    document.body.append(host);
    const readTexture = vi.fn(async () => ({
      status: 'available' as const,
      commandId: 7,
      uniformIndex: 0,
      textureIndex: 0,
      target: 'TEXTURE_2D',
      width: 64,
      height: 64,
      src: 'data:image/png;base64,preview'
    }));

    dispose = render(
      () =>
        createComponent(SpectorResultView, {
          captures: [capture],
          onReadTexture: readTexture
        }),
      host
    );
    await nextTask();

    const texturesTab = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.startsWith('Textures')
    );
    texturesTab?.click();
    await nextTask();

    expect(readTexture).toHaveBeenCalledWith(capture, 7, 0, 0);
    expect(host.querySelector<HTMLImageElement>('img')?.src).toBe('data:image/png;base64,preview');
  });
});

function createCapture(): ICapture {
  const command = {
    id: 7,
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
    DrawCall: {
      attributes: [{ name: 'position', bufferBinding: { __SPECTOR_Object_TAG: { id: 1 } } }],
      uniforms: [
        {
          name: 'colorTexture',
          texture: {
            target: 'TEXTURE_2D',
            texture: { __SPECTOR_Object_TAG: { id: 2, typeName: 'WebGLTexture' } },
            visual: {}
          }
        }
      ]
    }
  } satisfies ICommandCapture;

  return {
    canvas: {} as ICapture['canvas'],
    context: {} as ICapture['context'],
    initState: {},
    commands: [command],
    endState: {},
    startTime: 0,
    listenCommandsStartTime: 0,
    listenCommandsEndTime: 0,
    endTime: 0,
    analyses: [],
    frameMemory: {},
    memory: {}
  };
}

function createMesh(): Extract<IMeshCapture, { readonly status: 'available' }> {
  return {
    status: 'available',
    commandId: 7,
    mode: 4,
    modeName: 'TRIANGLES',
    positionAttribute: 'position',
    positionSource: 'raw-buffer',
    positionSpace: 'buffer',
    availableAttributes: [{ name: 'position', dimensions: 3, type: 'FLOAT', location: 0 }],
    dimensions: 3,
    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
    indices: [0, 1, 2],
    elementCount: 3,
    capturedElementCount: 3,
    instanceCount: 1,
    truncated: false
  };
}

function installCanvasMocks(): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
