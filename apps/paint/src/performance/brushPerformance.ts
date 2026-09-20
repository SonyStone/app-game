import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { initAbr } from '@app-game/abr-parser';
import { selectBrushFile } from '../../../abr-viewer/src/lib/select-brush-file';
import { verifyAbrBrush } from '../../tests/gpu/abrBrushVerification';
import { verifyAbrFilter } from '../../tests/gpu/abrFilterVerification';
import { verifyAbrMixer } from '../../tests/gpu/abrMixerVerification';
import { verifyAbrSmudge } from '../../tests/gpu/abrSmudgeVerification';
import { verifySmudgePerformance } from '../../tests/gpu/smudgePerformanceVerification';

/** Device benchmark only. Uses isolated documents and downloaded Adobe presets; never opens saved artwork. */
export async function measureBrushPerformance(report: (message: string) => void, fixture?: Blob) {
  const response = fixture ?? await selectBrushFile('megapack.abr');
  await initAbr();
  const file = loadBrushLibrary(await response.arrayBuffer());
  const results = [];
  for (const scenario of brushPerformanceCases) {
    report(scenario.id);
    const brush = file.brushes.find((brush) => brush.name === scenario.preset);
    if (!brush) throw new Error(`Missing benchmark brush: ${scenario.preset}`);
    const preset = brush;
    const measurements = await verifySmudgePerformance(() => {}, {
      preset,
      size: scenario.size,
      distance: scenario.distance,
      lod: scenario.lod,
      mixing: scenario.mixing,
      adaptiveQuality: true,
      runs: 4,
      cacheTiles: 16,
      compareProgress: true
    });
    // The first run compiles shaders. Retain it for inspection, but compare warm runs separately.
    const warm = measurements.slice(1);
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    results.push({
      ...scenario,
      measurements,
      drawMs: median(warm.map((run) => run.drawMs)),
      finishMs: median(warm.map((run) => run.finishMs)),
      maxFrameGapMs: median(warm.map((run) => run.maxFrameGapMs)),
      stamps: warm[0]!.stamps,
      submissions: median(warm.map((run) => run.submissions)),
      gpuBytes: Math.max(...warm.map((run) => run.gpuBytes)),
      pixelHash: warm[0]!.pixelHash
    });
  }
  return results;
}

/** Check output across batching, endpoint previews, and tile eviction before accepting a performance change. */
export async function verifyBrushPerformanceOutput(report: (message: string) => void) {
  for (const lod of [0, 3]) {
    await verifyAbrBrush(report, true, true, 'sampledBrush', 'sampledBrush', 222, { adaptiveQuality: true, lod });
    // Dual Brush retains detailed coverage; also exercise compact LOD masks under one-tile eviction.
    await verifyAbrBrush(report, true, true, 'sampledBrush', 'sampledBrush', 222,
      { adaptiveQuality: true, lod, dualBrush: false });
    await verifyAbrSmudge(report, true, lod);
    await verifyAbrFilter(report, true, lod);
    await verifyAbrMixer(report, true, lod);
  }
}

/** Fixed workloads cover fine/coarse LODs, the reported 222px size, tiny tips, and large sampling brushes. */
export const brushPerformanceCases = [
  ...[0, 1, 3].map((lod) => ({
    id: `2b-222-lod${lod}`,
    preset: 'KYLE Ultimate 2B Pencil',
    size: 222,
    distance: 6000,
    lod,
    mixing: 'linear' as const
  })),
  { id: '2b-9-lod3', preset: 'KYLE Ultimate 2B Pencil', size: 9, distance: 6000, lod: 3, mixing: 'linear' as const },
  ...(['classic', 'linear'] as const).flatMap((mixing) =>
    [0, 3].map((lod) => ({
      id: `wet-222-${mixing}-lod${lod}`,
      preset: "Kyle's Paintbox - Wet Blender",
      size: 222,
      distance: 2048,
      lod,
      mixing
    }))
  ),
  {
    id: 'wet-512-lod3',
    preset: "Kyle's Paintbox - Wet Blender",
    size: 512,
    distance: 2048,
    lod: 3,
    mixing: 'linear' as const
  }
];
