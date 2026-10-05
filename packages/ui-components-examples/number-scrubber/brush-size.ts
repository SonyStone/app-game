import { brushSizeCurve } from '@app-game/abr-brush/sliderCurves';

/** Paint's brush Size slider curve up to Photoshop's 5000 px. */
export const BRUSH_SIZE_CURVE = brushSizeCurve(5000);

/** Sizes of CLIP STUDIO PAINT's Brush Size palette, in px; 0.7 lies below the examples' 1 px minimum and is skipped. */
export const BRUSH_SIZE_PRESETS = [
  0.7, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 17, 20, 25, 30, 40, 50, 60, 70, 80, 100, 120, 150, 170, 200, 250,
  300, 400, 500, 600, 700, 800, 1000, 1200, 1500, 1700, 2000
];
