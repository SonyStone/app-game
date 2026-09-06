import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { AbrParser, AbrWriter } from '../src/node';
import type { DescriptorValue } from '../src/types';

/** Audit supplied files (or the repository corpus) without changing the input files. */
function main(): void {
  const paths = process.argv.slice(2);
  const files = paths.length
    ? paths
    : readdirSync(resolve(import.meta.dirname, '../files'))
        .filter((file) => file.endsWith('.abr'))
        .sort()
        .map((file) => resolve(import.meta.dirname, '../files', file));
  const reports = files.map(audit);
  console.log(
    JSON.stringify(
      {
        scope:
          'Container framing, typed brush descriptors, decoded tips and retained resource payloads; not Photoshop rendering equivalence.',
        reports
      },
      null,
      2
    )
  );
  if (
    reports.some(
      (report) =>
        report.errors.length ||
        (report.roundTrip &&
          (report.roundTrip.errors.length ||
            report.roundTrip.changedDescriptors ||
            !report.roundTrip.brushCountUnchanged ||
            !report.roundTrip.samplePayloadIdentical ||
            !report.roundTrip.patternPayloadIdentical ||
            !report.roundTrip.hierarchyPayloadIdentical))
    )
  )
    process.exitCode = 1;
}

function audit(path: string) {
  const bytes = readFileSync(path);
  const file = new AbrParser().parse(bytes);
  const types: Record<string, number> = Object.create(null);
  for (const brush of file.brushes) for (const value of Object.values(brush.descriptor ?? {})) countTypes(value, types);
  const blocks = (file.resourceBlocks ?? []).map((block) => ({
    key: block.key,
    offset: block.offset,
    headerBytes: 12,
    payloadBytes: block.length,
    interpretation:
      block.key === 'patt'
        ? 'opaque patterns; preserved'
        : block.key === 'samp'
          ? 'decoded pixels; opaque metadata retained per sample'
          : ['desc', 'phry'].includes(block.key)
            ? 'descriptor structure decoded; not all setting semantics verified'
            : 'opaque extension; preserved'
  }));
  let roundTrip;
  if (!file.errors.length) {
    const output = new AbrWriter().write(file);
    const parsed = new AbrParser().parse(output);
    roundTrip = {
      outputBytes: output.length,
      brushCountUnchanged: parsed.brushes.length === file.brushes.length,
      byteIdenticalFile: Buffer.from(output).equals(bytes),
      errors: parsed.errors,
      changedDescriptors: file.brushes.filter(
        (brush, i) => !isDeepStrictEqual(brush.descriptor, parsed.brushes[i]?.descriptor)
      ).length,
      samplePayloadIdentical: equalBytes(file.rawSampleData, parsed.rawSampleData),
      patternPayloadIdentical: equalBytes(file.rawPatternData, parsed.rawPatternData),
      hierarchyPayloadIdentical: equalBytes(file.rawHierarchyData, parsed.rawHierarchyData)
    };
  }
  return {
    file: basename(path),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    version: `${file.version}.${file.subVersion}`,
    brushes: file.brushes.length,
    sampledBrushes: file.brushes.filter((brush) => brush.type === 'sampled').length,
    descriptorTypes: types,
    blocks,
    framingAndPayloadBytes: 4 + blocks.reduce((sum, block) => sum + 12 + block.payloadBytes, 0),
    paddingOrUnparsedBytes: bytes.length - 4 - blocks.reduce((sum, block) => sum + 12 + block.payloadBytes, 0),
    errors: file.errors,
    roundTrip
  };
}

function countTypes(value: DescriptorValue, counts: Record<string, number>): void {
  counts[value.type] = (counts[value.type] ?? 0) + 1;
  if (value.type === 'Objc' || value.type === 'GlbO')
    for (const child of Object.values(value.value)) countTypes(child, counts);
  if (value.type === 'VlLs') for (const child of value.value) countTypes(child, counts);
}

function equalBytes(a?: Uint8Array, b?: Uint8Array): boolean {
  return a === undefined || b === undefined ? a === b : Buffer.from(a).equals(Buffer.from(b));
}

main();
