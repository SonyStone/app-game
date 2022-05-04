import { BLEND_MODES, LINE_CAP, LINE_JOIN, SHAPES } from 'pixi.js';
import { buildLine } from './buildLine';
import { buildPoly } from './buildPoly';
import { Graphics } from './graphics.interface';

const graphic: Graphics = {
  geometry: {
    graphicsData: [
      {
        holes: [],
        points: [],
        shape: {
          type: SHAPES.POLY,
          points: [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5],
          closeStroke: true,
        },
        fillStyle: {
          color: 0xffffff,
          alpha: 1,
        },
        lineStyle: {
          color: 0xffffff,
          alpha: 1,
          width: 0.2,
          alignment: 0.5,
          native: false,
          cap: LINE_CAP.ROUND,
          join: LINE_JOIN.ROUND,
          miterLimit: 10,
        },
      },
    ],
    indices: [],
    points: [],
    drawCalls: [],
    tint: 0xffffff,
    blendMode: BLEND_MODES.NORMAL,
    closePointEps: 1e-4,
  },
};

export function main() {
  const data = graphic.geometry.graphicsData[0];

  const fillStyle = data.fillStyle;
  const lineStyle = data.lineStyle;

  buildPoly.build(data);

  for (let j = 0; j < 2; j++) {
    const style = j === 0 ? fillStyle : lineStyle;

    // const nextTexture = style.texture.baseTexture;
    const index = graphic.geometry.indices.length;
    const attribIndex = graphic.geometry.points.length / 2;

    if (j === 0) {
      buildPoly.triangulate(data, graphic.geometry);
    } else {
      buildLine(data, graphic.geometry);
    }

    const size = graphic.geometry.points.length / 2 - attribIndex;
    if (size === 0) continue;
  }

  return graphic.geometry;
}
