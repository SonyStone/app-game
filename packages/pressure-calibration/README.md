# Pen pressure calibration

Solid 2 block that calibrates a pen for a drawing app, with no editor around it. Three steps of strokes on a
`BrushPreview` test canvas (as usual, firmly, lightly) fit one device curve (`fitPressureCurve` in paint-core). The
result shows the curve over the measured pressure, edited like CLIP STUDIO PAINT's: points are added on the curve,
dragged freely and removed; the strokes on the test canvas below are drawn again with every change, and a dot on the
curve follows the pressure of the pen touching it.

```tsx
import { createPressureCalibration, PressureCalibration } from '@app-game/pressure-calibration';

const calibration = createPressureCalibration(); // localStorage `paint.pressureCalibration`
<PressureCalibration saved={calibration.calibration()?.curve} onSave={calibration.save} onReset={calibration.reset} />;
// Feed strokes: attachInput(canvas, { …, mapPressure: calibration.mapPressure })
```

`preview` chooses what the test canvas draws with: Paint passes its current brush, the brush's images and
`studioBrushRecipe`; without it a plain round brush is used. Paint wraps the block in a floating window beside its side panels (Drawing menu) and also
serves it on its own at `/pressure.html`. Vite consumers need the Solid 2 and TypeGPU plugins, as for `BrushPreview`.
