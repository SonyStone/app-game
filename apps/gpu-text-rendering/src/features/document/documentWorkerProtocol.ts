import type { DocumentError } from '../../shared/errors';
import type { WorkerReply } from '../../shared/worker/workerProtocol';
import type { DocumentProgress } from './documentProgress';
import type { DecodedDocument } from './format/types';
import type { buildCoverageTables, CoverageTables } from './rendering/curves/buildCoverageTables';

/** Local bytes or a URL fetched by the GDOC worker. */
export type DecodeInput = string | ArrayBuffer;
/** Loading progress and the terminal decoded document shared by PDF and GDOC workers. */
export type DocumentReply = WorkerReply<DecodedDocument, DocumentError, DocumentProgress>;
/** PDF export returns encoded GDOC bytes. */
export type ConvertReply = WorkerReply<ArrayBuffer, DocumentError>;
/** Geometry borrowed by the renderer and cloned into the coverage worker. */
export type CoverageInput = Parameters<typeof buildCoverageTables>[0];
/** Prepared coverage data returned as transferable arrays. */
export type CoverageReply = WorkerReply<CoverageTables, DocumentError>;
