import { err } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { documentError } from '../../../../shared/errors';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { TextDocument } from '../../document';
import type { DocumentWorkers } from '../DocumentWorkers';
import { prepareCurveDocument } from './prepareCurveDocument';

describe('curve document preparation', () => {
  it.each([
    [
      'a crashed coverage worker',
      { kind: 'error' as const, cause: new ErrorEvent('error', { message: 'Coverage worker crashed' }) },
      { kind: 'document', code: 'decode', message: 'Coverage worker crashed' }
    ],
    [
      'a coverage domain error',
      documentError('invalid-data', 'Invalid curve table'),
      { kind: 'document', code: 'invalid-data', message: 'Invalid curve table' }
    ],
    ['cancellation', { kind: 'aborted' as const, message: 'Operation cancelled' }, { kind: 'aborted' }]
  ])('surfaces %s as a typed result', async (_, failure, expected) => {
    const coverage = vi.fn<DocumentWorkers['coverage']>(async () => err(failure));
    const createBuffer = vi.fn();
    const gpu = { root: { createBuffer }, device: {}, format: 'bgra8unorm' } as unknown as GpuContext;
    const document = {
      kind: 'curves',
      instances: new ArrayBuffer(0),
      curves: new ArrayBuffer(0),
      rasterImages: { table: new ArrayBuffer(0), pixels: new ArrayBuffer(0) }
    } as unknown as Extract<TextDocument, { kind: 'curves' }>;
    const workers = { coverage, raster: {} } as unknown as DocumentWorkers;

    const result = await prepareCurveDocument(gpu, document, vi.fn(), workers);

    expect(result._unsafeUnwrapErr()).toMatchObject(expected);
    expect(coverage).toHaveBeenCalledOnce();
    expect(createBuffer).not.toHaveBeenCalled();
  });
});
