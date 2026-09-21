import { err } from 'neverthrow';
import { expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { gpuError } from '../../shared/errors';
import { renderScene } from './renderScene';

it('clears once and records all layers into the same pass before submitting once', () => {
  const { gpu, pass, encoder, command } = gpuFixture();
  const first = vi.fn();
  const second = vi.fn();

  expect(renderScene(gpu, [first, second], 123).isOk()).toBe(true);
  expect(encoder.beginRenderPass).toHaveBeenCalledOnce();
  expect(encoder.beginRenderPass).toHaveBeenCalledWith({
    colorAttachments: [expect.objectContaining({ loadOp: 'clear', storeOp: 'store' })]
  });
  expect(first).toHaveBeenCalledWith({ pass, timestamp: 123, width: 800, height: 600 });
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
