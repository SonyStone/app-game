import { describe, expect, it, vi } from 'vitest';
import {
  getRawWebGLContext,
  getWebGLInspector,
  installWebGLContextHook,
  instrumentWebGLContext
} from './gl-debug-wrapper';

describe('instrumentWebGLContext', () => {
  it('forwards methods with the native receiver and keeps one proxy per context', () => {
    const fake = createFakeContext();
    const first = instrumentWebGLContext(fake.context);
    const second = instrumentWebGLContext(fake.context);

    first.context.viewport(1, 2, 30, 40);

    expect(fake.viewport).toHaveBeenCalledWith(1, 2, 30, 40);
    expect(second.context).toBe(first.context);
    expect(getRawWebGLContext(first.context)).toBe(fake.context);
    expect(getWebGLInspector(first.context)).toBe(first.inspector);
  });

  it('tracks resources, buffer metadata, calls, and draw counts', async () => {
    const fake = createFakeContext();
    const { context: gl, inspector } = instrumentWebGLContext(fake.context);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 2, 3]), gl.STATIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    await Promise.resolve();

    const snapshot = inspector.capture();
    expect(snapshot.drawCalls).toBe(1);
    expect(snapshot.resources).toEqual([
      expect.objectContaining({
        id: 'buffer 1',
        kind: 'buffer',
        details: expect.arrayContaining([{ key: 'size', value: '12 bytes' }])
      })
    ]);
    expect(snapshot.recentCalls.at(-1)).toEqual(expect.objectContaining({ name: 'drawArrays', status: 'ok' }));
  });

  it('coalesces synchronous mutations into one subscriber update', async () => {
    const fake = createFakeContext();
    const { context: gl, inspector } = instrumentWebGLContext(fake.context);
    const listener = vi.fn();
    inspector.subscribe(listener);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    expect(listener).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('decodes WebGL2 texture uploads and multisampled renderbuffer storage', () => {
    const fake = createFakeContext();
    const { context, inspector } = instrumentWebGLContext(fake.context);
    const gl = context as WebGL2RenderingContext;
    const renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, 64, 32);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 8, 8);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(256));

    const snapshot = inspector.capture();
    expect(snapshot.resources.find((resource) => resource.kind === 'renderbuffer')?.details).toEqual(
      expect.arrayContaining([
        { key: 'format', value: 'RGBA8' },
        { key: 'size', value: '64 × 32' },
        { key: 'samples', value: '4' }
      ])
    );
    expect(snapshot.resources.find((resource) => resource.kind === 'texture')?.details).toEqual(
      expect.arrayContaining([
        { key: 'storage', value: '8 × 8' },
        { key: 'level 0', value: '8 × 8' }
      ])
    );
  });

  it('records vertex-array buffer relationships for graph arrows', () => {
    const fake = createFakeContext();
    const { context, inspector } = instrumentWebGLContext(fake.context);
    const gl = context as WebGL2RenderingContext;
    const vertexArray = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);

    const resource = inspector.capture().resources.find((candidate) => candidate.kind === 'vertex-array');
    expect(resource?.relations).toEqual(
      expect.arrayContaining([
        { label: 'attribute 2', targetId: 'buffer 1', direct: true },
        { label: 'element array', targetId: 'buffer 1', direct: true }
      ])
    );
  });

  it('patches and restores the canvas prototype from a supplied iframe realm', () => {
    const fake = createFakeContext();
    class FrameCanvas {
      getContext(kind: string): WebGLRenderingContext | null {
        return kind === 'webgl2' ? fake.context : null;
      }
    }
    const original = FrameCanvas.prototype.getContext;
    const onContext = vi.fn();
    const hook = installWebGLContextHook({
      target: { HTMLCanvasElement: FrameCanvas } as unknown as Window,
      onContext
    });

    const canvas = new FrameCanvas();
    const first = canvas.getContext('webgl2');
    const second = canvas.getContext('webgl2');

    expect(first).not.toBe(fake.context);
    expect(second).toBe(first);
    expect(onContext).toHaveBeenCalledTimes(1);
    expect(hook.inspectors.size).toBe(1);
    hook.restore();
    expect(FrameCanvas.prototype.getContext).toBe(original);
  });
});

function createFakeContext(): {
  readonly context: WebGLRenderingContext;
  readonly viewport: ReturnType<typeof vi.fn>;
} {
  const state = new Map<number, unknown>();
  const buffer = { name: 'buffer' };
  const renderbuffer = { name: 'renderbuffer' };
  const texture = { name: 'texture' };
  const vertexArray = { name: 'vertex-array' };
  const constants = {
    ARRAY_BUFFER: 0x8892,
    ARRAY_BUFFER_BINDING: 0x8894,
    STATIC_DRAW: 0x88e4,
    TRIANGLES: 0x0004,
    DEPTH_TEST: 0x0b71,
    ACTIVE_TEXTURE: 0x84e0,
    TEXTURE0: 0x84c0,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
    MAX_VERTEX_ATTRIBS: 0x8869,
    VERTEX_ATTRIB_ARRAY_ENABLED: 0x8622,
    VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 0x889f,
    VERTEX_ATTRIB_ARRAY_SIZE: 0x8623,
    VERTEX_ATTRIB_ARRAY_TYPE: 0x8625,
    VERTEX_ATTRIB_ARRAY_NORMALIZED: 0x886a,
    VERTEX_ATTRIB_ARRAY_STRIDE: 0x8624,
    VERTEX_ATTRIB_ARRAY_POINTER: 0x8645,
    VIEWPORT: 0x0ba2,
    RENDERBUFFER: 0x8d41,
    RENDERBUFFER_BINDING: 0x8ca7,
    RGBA8: 0x8058,
    TEXTURE_2D: 0x0de1,
    TEXTURE_BINDING_2D: 0x8069,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    ELEMENT_ARRAY_BUFFER_BINDING: 0x8895,
    VERTEX_ARRAY_BINDING: 0x85b5
  } as const;
  state.set(constants.ACTIVE_TEXTURE, constants.TEXTURE0);
  state.set(constants.MAX_COMBINED_TEXTURE_IMAGE_UNITS, 1);
  state.set(constants.MAX_VERTEX_ATTRIBS, 1);
  state.set(constants.VIEWPORT, new Int32Array([0, 0, 100, 100]));
  const viewport = vi.fn(function (this: unknown) {
    if (this !== context) throw new TypeError('Illegal invocation');
  });
  const context = {
    ...constants,
    canvas: { width: 100, height: 100 },
    viewport,
    createBuffer: vi.fn(() => buffer),
    createRenderbuffer: vi.fn(() => renderbuffer),
    createTexture: vi.fn(() => texture),
    createVertexArray: vi.fn(() => vertexArray),
    bindBuffer: vi.fn((target: number, value: unknown) =>
      state.set(target === constants.ARRAY_BUFFER ? constants.ARRAY_BUFFER_BINDING : target, value)
    ),
    bufferData: vi.fn(),
    bindRenderbuffer: vi.fn((_target: number, value: unknown) => state.set(constants.RENDERBUFFER_BINDING, value)),
    renderbufferStorageMultisample: vi.fn(),
    bindTexture: vi.fn((_target: number, value: unknown) => state.set(constants.TEXTURE_BINDING_2D, value)),
    texStorage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    texImage3D: vi.fn(),
    bindVertexArray: vi.fn((value: unknown) => state.set(constants.VERTEX_ARRAY_BINDING, value)),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),
    enable: vi.fn((capability: number) => state.set(capability, true)),
    disable: vi.fn((capability: number) => state.set(capability, false)),
    activeTexture: vi.fn((unit: number) => state.set(constants.ACTIVE_TEXTURE, unit)),
    getParameter: vi.fn((parameter: number) => state.get(parameter) ?? null),
    getVertexAttrib: vi.fn(() => null),
    getVertexAttribOffset: vi.fn(() => 0)
  };
  return { context: context as unknown as WebGLRenderingContext, viewport };
}
