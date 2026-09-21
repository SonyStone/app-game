import { err, ok } from 'neverthrow';
import { documentError } from '../../shared/errors';
import type { UnpackedBMP } from './unpackBmp';

/** Decodes legacy glyph records into 12-byte vertices and glyph centers, without creating GPU resources. */
export function decodeGlyphs(data: UnpackedBMP) {
  if (data.buf.byteLength % 20 !== 0) {
    return err(documentError('invalid-data', 'Invalid glyph record length'));
  }
  if (data.buf.byteLength === 0) {
    return ok({ vertices: new ArrayBuffer(0), positions: { x: new Float32Array(), y: new Float32Array() } });
  }

  // Delta decoding mutates a private copy; source bytes remain reusable.
  data = { ...data, buf: data.buf.slice(0) };

  const position = new Int16Array(data.buf, 0);
  const curvesMin = new Uint16Array(data.buf, 4);
  const deltaNext = new Int16Array(data.buf, 8);
  const deltaPrev = new Int16Array(data.buf, 12);
  const color = new Uint16Array(data.buf, 16);

  const numGlyphs = data.buf.byteLength / (2 * wordsPerGlyph);

  const vertices = new ArrayBuffer(numGlyphs * 6 * wordsPerVertex * 2);
  const vertexPosition = new Int16Array(vertices, 0);
  const vertexCurves = new Uint16Array(vertices, 4);
  const vertexColor = new Uint16Array(vertices, 8);

  const positions = {
    x: new Float32Array(numGlyphs),
    y: new Float32Array(numGlyphs)
  };

  let src = 0;
  let dst = 0;

  for (let i = 0; i < numGlyphs; i++) {
    // Complete 20-byte records and six allocated vertices per glyph bound all indexed accesses below.
    // Int16 assignment preserves the packed format's wrapping arithmetic.
    if (i > 0) {
      position[src + 0] = position[src + 0]! + position[src - wordsPerGlyph + 0]!;
      position[src + 1] = position[src + 1]! + position[src - wordsPerGlyph + 1]!;
    }

    positions.x[i] = (position[src + 0]! + 0.5 * (deltaNext[src + 0]! + deltaPrev[src + 0]!)) / 32767 + 0.5;
    positions.y[i] = (position[src + 1]! + 0.5 * (deltaNext[src + 1]! + deltaPrev[src + 1]!)) / 32767 + 0.5;

    // Two triangles use corners 0, 1, 2 and 3, 2, 1.
    for (let j = 0; j < 6; j++) {
      const corner = j < 4 ? j : 6 - j;

      vertexPosition[dst + 0] = position[src + 0]!;
      vertexPosition[dst + 1] = position[src + 1]!;

      if (corner === 1) {
        vertexPosition[dst + 0] = vertexPosition[dst + 0]! + deltaNext[src + 0]!;
        vertexPosition[dst + 1] = vertexPosition[dst + 1]! + deltaNext[src + 1]!;
      } else if (corner === 2) {
        vertexPosition[dst + 0] = vertexPosition[dst + 0]! + deltaPrev[src + 0]!;
        vertexPosition[dst + 1] = vertexPosition[dst + 1]! + deltaPrev[src + 1]!;
      } else if (corner === 3) {
        vertexPosition[dst + 0] = vertexPosition[dst + 0]! + deltaNext[src + 0]! + deltaPrev[src + 0]!;
        vertexPosition[dst + 1] = vertexPosition[dst + 1]! + deltaNext[src + 1]! + deltaPrev[src + 1]!;
      }

      vertexCurves[dst + 0] = ushortWithFlag(curvesMin[src + 0]!, corner & 1);
      vertexCurves[dst + 1] = ushortWithFlag(curvesMin[src + 1]!, corner > 1);
      vertexColor[dst + 0] = color[src + 0]!;
      vertexColor[dst + 1] = color[src + 1]!;

      dst += wordsPerVertex;
    }

    src += wordsPerGlyph;
  }

  return ok({ vertices, positions });
}

function ushortWithFlag(x: number, flag: boolean | number) {
  return x * 2 + Number(Boolean(flag));
}

const wordsPerGlyph = 10;
const wordsPerVertex = 6;
