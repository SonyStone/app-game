import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Usage: node scripts/summarize.mjs RESULTS [BEFORE_RESULTS]. Writes measurements.json beside the raw runs.
const directory = resolve(process.argv[2]);
const summarize = async (directory) => {
  const groups = new Map();
  for (const name of (await readdir(directory)).filter((name) => /-r\d+\.json$/.test(name))) {
    const run = JSON.parse(await readFile(`${directory}/${name}`, 'utf8'));
    const group = name.replace(/-r\d+\.json$/, '');
    const uploads = run.afterOpen?.uploads ?? [];
    const openingEvents = run.data?.events.filter((event) => event.phase === 'open') ?? [];
    const samples = openingEvents.flatMap((event) => event.performance ?? []);
    const first = run.data?.uploads?.[0] ?? uploads[0];
    const last = uploads.at(-1);
    const presentation = run.data?.presentations?.[0] ?? first;
    const telemetry = run.data?.performance ?? [];
    const percentile = (values, p) => {
      values.sort((a, b) => a - b);
      return values.length ? values[Math.max(0, Math.ceil(values.length * p) - 1)] : null;
    };
    const gestures = new Set(['pan', 'zoom']);
    const durations = (name, moving = false) =>
      telemetry
        .filter((sample) => sample.name === `psd:${name}` && (!moving || gestures.has(sample.phase)))
        .map((sample) => sample.duration);
    const values = (name) => telemetry.filter((sample) => sample.name === `psd:${name}`).map((sample) => sample.value);
    const intervals = (run.data?.frames ?? []).filter((frame) => gestures.has(frame.phase)).map((frame) => frame.dt);
    const regionTiles = (run.data?.events ?? [])
      .filter((event) => event.type === 'windowRendered' && gestures.has(event.phase))
      .flatMap((event) => event.images ?? [])
      .filter((image) => image.step === 1 && image.source === 'layers');
    const uniqueTiles = new Set(regionTiles.map((image) => `${image.left}:${image.top}:${image.w}:${image.h}`));
    const metric = {
      outcome: run.error || run.openTimeout ? 'error' : first ? 'pixels' : 'refused',
      error: run.error ?? run.openTimeout ?? openingEvents.findLast((event) => event.error)?.error,
      pageErrors: run.errors,
      firstUploadMs: first ? first.end - run.afterOpen.start : null,
      firstPresentedMs: presentation ? presentation.presented - run.afterOpen.start : null,
      freshUploadMs: last ? last.end - run.afterOpen.start : null,
      sourceReadMs: run.data?.performance.find((sample) => sample.name === 'psd:source.read')?.duration,
      wasmLoadMs: samples.find((sample) => sample.name === 'wasm.load')?.duration,
      openMs: samples.find((sample) => sample.name === 'open')?.duration,
      detectionMs: samples.find((sample) => sample.name === 'detection')?.duration,
      composites: samples.filter((sample) => sample.name === 'composite').length,
      preparedReuse: samples.filter((sample) => sample.name === 'render.reused').length,
      renderReplyLatencyMs: openingEvents
        .filter((event) => event.type === 'rendered')
        .map((reply) => {
          const request = openingEvents.find((event) => event.direction === 'request' && event.id === reply.id);
          return reply.t - request.t;
        }),
      wasmLinearHighWaterBytes: samples.some((sample) => sample.name === 'wasm.linear.bytes')
        ? Math.max(...samples.filter((sample) => sample.name === 'wasm.linear.bytes').map((sample) => sample.value))
        : null,
      browserProcessTreePeakRssBytes: Math.max(0, ...(run.rssSamples ?? []).map((sample) => sample.totalBytes ?? 0)),
      backend: run.afterOpen?.backend,
      putImageDataCalls: run.data?.putImageDataCalls,
      gestureFrameP95Ms: percentile([...intervals], 0.95),
      gestureFrameP99Ms: percentile([...intervals], 0.99),
      inputToNextFrameP95Ms: percentile(durations('frame.inputToNextFrame', true), 0.95),
      preparationP95Ms: percentile(durations('frame.prepare'), 0.95),
      uploadPreparationP95Ms: percentile(durations('upload'), 0.95),
      gpuInitializationMaxMs: percentile(durations('gpu.initialize'), 1),
      uploadRemapP95Ms: percentile(durations('upload.remap'), 0.95),
      preparationMaxMs: percentile(durations('frame.prepare'), 1),
      uploadChunkP95Ms: percentile(durations('upload.texture'), 0.95),
      uploadChunkMaxBytes: percentile(values('upload.texture'), 1),
      uploadSourceMaxBytes: percentile(values('upload.source.bytes'), 1),
      gpuTimestampP95Ms: percentile(values('gpu.timestamp.ms'), 0.95),
      queueCompletionP95Ms: percentile(durations('gpu.queueCompletion'), 0.95),
      peakGpuExplicitBytes: percentile(values('gpu.explicit.bytes'), 1),
      peakCpuTileBytes: percentile(values('tiles.cpu.bytes'), 1),
      cameraReturnedTiles: regionTiles.length,
      cameraRepeatedTiles: regionTiles.length - uniqueTiles.size,
      status: run.afterOpen?.status
    };
    groups.set(group, [...(groups.get(group) ?? []), metric]);
  }
  return Object.fromEntries(
    [...groups].map(([name, runs]) => {
      const range = (key) => {
        const values = runs
          .map((run) => run[key])
          .filter((value) => typeof value === 'number' && Number.isFinite(value))
          .sort((a, b) => a - b);
        return values.length
          ? { median: values[Math.floor(values.length / 2)], min: values[0], max: values.at(-1) }
          : null;
      };
      const targetMs =
        name === 'smart-object' ? 2000 : ['many-layer', 'text-heavy-admitted'].includes(name) ? 1500 : null;
      const firstPresentedMs = range('firstPresentedMs');
      return [
        name,
        {
          runs,
          firstPresentedMs,
          firstUploadMs: range('firstUploadMs'),
          freshUploadMs: range('freshUploadMs'),
          composites: range('composites'),
          phase2: Object.fromEntries(
            [
              'gestureFrameP95Ms',
              'gestureFrameP99Ms',
              'inputToNextFrameP95Ms',
              'preparationP95Ms',
              'uploadPreparationP95Ms',
              'gpuInitializationMaxMs',
              'gpuTimestampP95Ms',
              'queueCompletionP95Ms'
            ].map((key) => [key, range(key)])
          ),
          targetMs,
          allRunsWithinTarget: targetMs && firstPresentedMs ? firstPresentedMs.max <= targetMs : null
        }
      ];
    })
  );
};
const phase3 = await readFile(`${directory}/phase3.json`, 'utf8')
  .then(JSON.parse)
  .catch(() => undefined);
const result = {
  phase3: phase3?.map((run) => ({
    ...run,
    nineTile: run.nineTile && {
      milliseconds: run.nineTile.ms,
      requestedTiles: run.nineTile.requests.length,
      returnedTiles: run.nineTile.replies.length
    },
    acceptance: {
      nineTiles: run.nineTile?.requests.length === 9 && run.nineTile?.replies.length === 9 && run.nineTile?.ms <= 250,
      noRepeatedTrajectoryTiles: run.trajectory?.repeated === 0,
      warmRevisit: run.warmRevisit?.wasmCalls === 0 && run.warmRevisit?.uploads === 0,
      visibleWithinTwoFrames: run.diagnostics?.visibleTileCount > 0 && run.diagnostics?.visibleTileMaxFrames <= 2,
      boundedCancellation: run.diagnostics?.obsoleteBatchMaxTiles <= 1,
      residency:
        run.diagnostics?.peakCpuBytes <= 64 * 1024 * 1024 && run.diagnostics?.peakGpuBytes <= 128 * 1024 * 1024,
      fiveMinuteTraversal: run.traversalMs === undefined ? null : run.traversalMs >= 300000
    }
  })),
  after: await summarize(directory),
  notes: [
    'Presented timing uses two animation frames after the first submitted frame containing ready tiles, not a physical display measurement.',
    'WASM linear memory is a high-water allocation; RSS is sampled across this isolated browser process tree.',
    'Neither byte estimate nor RSS is a native sample-comparison result. Native results are in features.json.',
    'The range is observed min/max across runs on this device, not a cross-device guarantee.',
    'Frame intervals are browser RAF intervals during pan/zoom; input latency ends at display submission, not scanout.',
    'GPU timestamp duration measures the viewport pass; queue completion includes waiting and presentation scheduling.',
    'Transferable worker buffers avoid structured-clone pixel copies; mapped staging strips still copy bytes before the GPU copy into textures.'
  ]
};
if (process.argv[3]) {
  result.before = await summarize(resolve(process.argv[3]));
}
await writeFile(`${directory}/measurements.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
