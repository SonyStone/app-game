import type { AbortedError } from '@app-game/solid-gpu/errors';
import {
  runWorkerRequest,
  type ReplyFailure,
  type ReplyOutput,
  type ReplyProgress,
  type WorkerReply,
  type WorkerRequestOptions
} from '@app-game/solid-gpu/worker';
import type { Result } from 'neverthrow';
import type { DocumentError } from '../../shared/errors';
import type { DocumentProgress } from './documentProgress';
import { documentWorkerError } from './documentWorkerError';
import DecodeWorker from './format/decode.worker?worker';
import type { DecodedDocument } from './format/types';
import ConvertWorker from './pdf/convert.worker?worker';
import ImportWorker from './pdf/import.worker?worker';
import type { buildCoverageTables, CoverageTables } from './plan/buildCoverageTables';
import CoverageWorker from './rendering/curves/coverage.worker?worker';

/** Local bytes or a URL fetched by the GDOC worker. */
export type DecodeInput = string | ArrayBuffer;
/** Loading progress and the terminal decoded document shared by PDF and GDOC workers. */
export type DocumentReply = WorkerReply<DecodedDocument, DocumentError, DocumentProgress>;
/** Decodes GDOC bytes (transferred) or a URL in a fresh worker. */
export const decodeDocument = documentRequest<DecodeInput, DocumentReply>(
  () => new DecodeWorker(),
  (input) => (input instanceof ArrayBuffer ? [input] : [])
);

/** PDF bytes transferred to the import worker. */
export type ImportInput = ArrayBuffer;
/** Imports a PDF for viewing in a fresh worker; consumes the bytes. */
export const importDocument = documentRequest<ImportInput, DocumentReply>(
  () => new ImportWorker(),
  (input) => [input]
);

/** PDF bytes transferred to the export worker. */
export type ConvertInput = ArrayBuffer;
/** PDF export returns encoded GDOC bytes. */
export type ConvertReply = WorkerReply<ArrayBuffer, DocumentError>;
/** Converts a PDF to GDOC bytes in a fresh worker; consumes the bytes. */
export const convertDocument = documentRequest<ConvertInput, ConvertReply>(
  () => new ConvertWorker(),
  (input) => [input]
);

/** Geometry borrowed by the renderer and cloned into the coverage worker. */
export type CoverageInput = Parameters<typeof buildCoverageTables>[0];
/** Prepared coverage data returned as transferable arrays. */
export type CoverageReply = WorkerReply<CoverageTables, DocumentError>;
/** Builds coverage tables in a fresh worker; the input is cloned so the caller keeps its geometry. */
export const buildCoverage = documentRequest<CoverageInput, CoverageReply>(
  () => new CoverageWorker(),
  () => []
);

/**
 * Binds a document worker to its declared protocol. The returned request runs in a fresh worker per call and
 * resolves the protocol's output, or a document/cancellation error with transport failures already mapped.
 */
function documentRequest<Input, Reply extends WorkerReply<unknown, DocumentError, unknown>>(
  create: () => Worker,
  transfer: (input: Input) => Transferable[]
) {
  return async (
    input: Input,
    options: Omit<WorkerRequestOptions<ReplyProgress<Reply>>, 'transfer'>
  ): Promise<Result<ReplyOutput<Reply>, DocumentError | AbortedError>> => {
    const result = await runWorkerRequest<Input, ReplyOutput<Reply>, ReplyFailure<Reply>, ReplyProgress<Reply>>(
      create,
      input,
      { ...options, transfer: transfer(input) }
    );
    return result.mapErr(documentWorkerError);
  };
}
