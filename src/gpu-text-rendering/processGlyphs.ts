import { GL_BUFFER_TYPE, GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';

import { UnpackedBMP } from './unpackBmp';

const int16PerGlyph = 10;
const int16PerVertex = 6; // const

export function processGlyphs(gl: WebGLRenderingContext, data: UnpackedBMP) {
  const uposition = new Int16Array(data.buf, 0);
  const position = new Int16Array(data.buf, 0);
  const curvesMin = new Uint16Array(data.buf, 4);
  const deltaNext = new Int16Array(data.buf, 8);
  const deltaPrev = new Int16Array(data.buf, 12);
  const color = new Uint16Array(data.buf, 16);

  const numGlyphs = data.buf.byteLength / (2 * int16PerGlyph);
  console.log('Loaded ' + numGlyphs + ' glyphs');

  const vbuf = new ArrayBuffer(numGlyphs * 6 * int16PerVertex * 2);
  const oPosition = new Int16Array(vbuf, 0);
  const oCurvesMin = new Uint16Array(vbuf, 4);
  const oColor = new Uint16Array(vbuf, 8);

  const positions = {
    x: new Float32Array(numGlyphs),
    y: new Float32Array(numGlyphs)
  }; // for auto zoom

  let src = 0;
  let dst = 0;
  for (var i = 0; i < numGlyphs; i++) {
    // delta decode
    if (i > 0) {
      position[src + 0] += position[src - int16PerGlyph + 0];
      position[src + 1] += position[src - int16PerGlyph + 1];
    }

    positions.x[i] = (uposition[src + 0] + 0.5 * (deltaNext[src + 0] + deltaPrev[src + 0])) / 32767 + 0.5;
    positions.y[i] = (uposition[src + 1] + 0.5 * (deltaNext[src + 1] + deltaPrev[src + 1])) / 32767 + 0.5;

    // output tri strip quad
    for (var j = 0; j < 6; j++) {
      var k = j < 4 ? j : 6 - j; // 0, 1, 2, 3, 2, 1
      //var k = Math.min(3, Math.max(0, j - 1));		// 0, 0, 1, 2, 3, 3

      oPosition[dst + 0] = position[src + 0];
      oPosition[dst + 1] = position[src + 1];

      if (k == 1) {
        oPosition[dst + 0] += deltaNext[src + 0];
        oPosition[dst + 1] += deltaNext[src + 1];
      } else if (k == 2) {
        oPosition[dst + 0] += deltaPrev[src + 0];
        oPosition[dst + 1] += deltaPrev[src + 1];
      } else if (k == 3) {
        oPosition[dst + 0] += deltaNext[src + 0] + deltaPrev[src + 0];
        oPosition[dst + 1] += deltaNext[src + 1] + deltaPrev[src + 1];
      }

      oCurvesMin[dst + 0] = ushortWithFlag(curvesMin[src + 0], k & 1);
      oCurvesMin[dst + 1] = ushortWithFlag(curvesMin[src + 1], k > 1);
      oColor[dst + 0] = color[src + 0];
      oColor[dst + 1] = color[src + 1];

      if (i < 10) {
        //console.log(i, j, oPosition[dst+0], oPosition[dst+1], positions.x[i], positions.y[i]);
      }

      dst += int16PerVertex;
    }

    src += int16PerGlyph;
  }

  const glyphBuffer = gl.createBuffer();
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, glyphBuffer);
  gl.bufferData(GL_BUFFER_TYPE.ARRAY_BUFFER, vbuf, GL_STATIC_VARIABLES.STATIC_DRAW);
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, null);

  return glyphBuffer;
}

function ushortWithFlag(x: number, flag: boolean | number) {
  return (x | 0) * 2 + (flag ? 1 : 0);
}
