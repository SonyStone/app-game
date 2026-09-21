import type { TextDocument } from '../document/document';
import type { Camera } from './camera';

/** Owns the automatic tour separately from the renderer, retaining the displayed camera on interruption. */
export function createCameraTour(camera: Camera) {
  let start = -Infinity;
  let from = { ...camera };
  let target = { x: camera.x, y: camera.y };

  return {
    stop() {
      start = -Infinity;
    },

    update(timestamp: number, document: TextDocument) {
      if (timestamp - start > 14000) {
        start = timestamp;
        from = { ...camera };

        const page = document.pages[Math.floor(Math.random() * document.pages.length)]!;
        const first = Math.floor(page.beginVertex / 6);
        const count = Math.floor((page.endVertex - page.beginVertex) / 6);
        const glyph = first + Math.floor(Math.random() * count);

        target = {
          x: -page.x + (document.positions.x[glyph] ?? 0.5),
          y: -page.y + 1 - (document.positions.y[glyph] ?? 0.5)
        };
      }

      const t = Math.min(1, (timestamp - start) / 14000);
      const travel = t * t * (3 - 2 * t);

      camera.x = from.x + (target.x - from.x) * travel;
      camera.y = from.y + (target.y - from.y) * travel;

      const out = Math.sin(Math.PI * t);
      camera.zoom = from.zoom * (1 - t) + (1 / 128) * t + 2.8 * out * out;
    }
  };
}
