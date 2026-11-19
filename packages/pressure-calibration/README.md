# Pen pressure calibration

Solid 2 block that calibrates a pen for a drawing app, with no editor around it. Three steps of strokes on a
`BrushPreview` test canvas (as usual, firmly, lightly) fit one device curve (`fitPressureCurve` in paint-core). The
steps are shown in pictures, not sentences: stroke pictograms whose lines fill with the samples drawn, a looping pen
drawing the stroke wanted, a live histogram, a pen-only pictogram for mouse and touch, and icon buttons. The
result shows the curve over the measured pressure, edited like CLIP STUDIO PAINT's: points are added on the curve,
dragged freely and removed; the strokes on the test canvas below are drawn again with every change, and a dot on the
curve follows the pressure of the pen touching it.

```tsx
import { createPressureCalibration, PressureCalibration } from '@app-game/pressure-calibration';

const calibration = createPressureCalibration(); // localStorage `paint.pressureCalibration`
<PressureCalibration saved={calibration.calibration()?.curve} onSave={calibration.save} onReset={calibration.reset} />;
// Feed strokes: attachInput(canvas, { …, mapPressure: calibration.mapPressure })
```

`surface` takes the strokes from the host's own canvases, such as a large drawing pad, instead of the test canvas;
`histogram={false}` leaves the pressures to a graph of the host's. Colours and sizes come from custom properties
(`--calibration-*`, listed in `PressureCalibration.module.css`). `onMeasured` makes the block only measure: the fitted curve goes to a host that edits it with its own `PressureCurveEditor`. The editor draws at its element's size and takes its colors and point sizes from custom properties (see its JSDoc).
`preview` chooses what the test canvas draws with: Paint passes its current brush, the brush's images and
`studioBrushRecipe`; without it a plain round brush is used. Paint wraps the block in a floating window beside its side panels (Drawing menu), runs its steps on the LEGO brush
studio's Pen page, and also serves it on its own at `/pressure.html`. Vite consumers need the Solid 2 and TypeGPU plugins, as for `BrushPreview`.
