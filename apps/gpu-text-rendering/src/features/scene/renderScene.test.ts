import { gpuError } from '@app-game/solid-gpu/errors';
import { err } from 'neverthrow';
import { expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { renderScene } from './renderScene';

it('clears once and records all layers into the same pass before submitting once', () => {
  const { gpu, pass, encoder, command } = gpuFixture();
  const first = vi.fn();
  const second = vi.fn();

  expect(renderScene(gpu, [first, second]).isOk()).toBe(true);
  expect(encoder.beginRenderPass).toHaveBeenCalledOnce();
  expect(encoder.beginRenderPass).toHaveBeenCalledWith({
    colorAttachments: [expect.objectContaining({ loadOp: 'clear', storeOp: 'store' })]
  });
  expect(first).toHaveBeenCalledWith({ pass, width: 800, height: 600, moving: false, strained: false, scale: 1 });
  expect(second).toHaveBeenCalledWith(first.mock.calls[0]![0]);
  expect(first.mock.invocationCallOrder[0]).toBeLessThan(second.mock.invocationCallOrder[0]!);
  expect(pass.end).toHaveBeenCalledOnce();
  expect(gpu.device.queue.submit).toHaveBeenCalledExactlyOnceWith([command]);
});

it('discards a failed frame and skips later layers', () => {
  const { gpu, pass } = gpuFixture();
  const error = gpuError('render', 'Layer unavailable');
  const later = vi.fn();

  expect(renderScene(gpu, [() => err(error), later])).toEqual(err(error));
  expect(later).not.toHaveBeenCalled();
  expect(pass.end).toHaveBeenCalledOnce();
  expect(gpu.device.queue.submit).not.toHaveBeenCalled();
});

it('normalizes external GPU exceptions and never submits a partial frame', () => {
  const { gpu } = gpuFixture();
  vi.mocked(gpu.device.createCommandEncoder).mockImplementation(() => {
    throw new Error('Device unavailable');
  });

  expect(renderScene(gpu, [])).toMatchObject({ error: { kind: 'gpu', code: 'render', message: 'Device unavailable' } });
  expect(gpu.device.queue.submit).not.toHaveBeenCalled();
});

it('draws a scaled frame into the corner of the canvas-sized target and stretches it over the canvas', () => {
  const { gpu, encoder, command } = gpuFixture();
  const scenePass = { end: vi.fn(), setViewport: vi.fn(), setScissorRect: vi.fn() };
  const upscalePass = { end: vi.fn() };
  vi.mocked(encoder.beginRenderPass)
    .mockReturnValueOnce(scenePass as never)
    .mockReturnValueOnce(upscalePass as never);
  const target = {};
  const upscaler = { target: vi.fn(() => target), blit: vi.fn(), destroy: vi.fn() };
  const layer = vi.fn();

  expect(renderScene(gpu, [layer], { upscaler: upscaler as never, scale: 0.5 }, { moving: true }).isOk()).toBe(true);

  // The target keeps the canvas size at every scale; the viewport confines the frame to its scaled part.
  expect(upscaler.target).toHaveBeenCalledWith(800, 600);
  expect(encoder.beginRenderPass).toHaveBeenNthCalledWith(1, {
    colorAttachments: [expect.objectContaining({ view: target })]
  });
  expect(scenePass.setViewport).toHaveBeenCalledWith(0, 0, 400, 300, 0, 1);
  expect(scenePass.setScissorRect).toHaveBeenCalledWith(0, 0, 400, 300);
  expect(layer).toHaveBeenCalledWith(expect.objectContaining({ width: 400, height: 300, scale: 0.5, moving: true }));
  expect(upscaler.blit).toHaveBeenCalledWith(upscalePass, 400, 300);
  expect(gpu.device.queue.submit).toHaveBeenCalledExactlyOnceWith([command]);
});
