import type { PaintCommand, PaintEvent } from '../protocol';

/** Exercises the same upload/ack protocol in the production main and worker recipes, without editing pixels. */
export async function verifyBrushResourceTransport(
  request: (
    command: Extract<PaintCommand, { type: 'brush-resources' }>
  ) => Promise<Extract<PaintEvent, { type: 'brush-resources' }>>,
  report: (message: string) => void
) {
  const id = `qa-tip-${crypto.randomUUID()}`;
  const upload = {
    type: 'brush-resources' as const,
    requestId: 'upload',
    action: 'put' as const,
    resource: { id, format: 'r8unorm' as const, width: 2, height: 2, pixels: new Uint8Array([0, 64, 128, 255]) }
  };
  const first = await request(upload);
  if (first.requestId !== 'upload' || !first.result.ok || first.result.value.stats.bytes !== 4)
    throw new Error('Brush resource upload was not acknowledged with its allocated bytes.');
  const duplicate = await request({ ...upload, requestId: 'duplicate' });
  if (duplicate.requestId !== 'duplicate' || duplicate.result.ok)
    throw new Error('Duplicate brush resource ID was not rejected.');
  const stats = await request({ type: 'brush-resources', requestId: 'stats', action: 'stats' });
  if (!stats.result.ok || stats.result.value.stats.entries !== 1 || stats.result.value.stats.bytes !== 4)
    throw new Error('Rejected upload changed the resource cache.');
  const removed = await request({ type: 'brush-resources', requestId: 'remove', action: 'delete', id });
  if (!removed.result.ok || removed.result.value.stats.bytes !== 0)
    throw new Error('Brush resource deletion did not release the allocated bytes.');
  report('PASS: brush resource transport uploads once, reports typed errors and releases decoded pixels');
}
