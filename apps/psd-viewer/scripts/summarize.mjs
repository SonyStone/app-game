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
    const metric = {
      outcome: run.error || run.openTimeout ? 'error' : first ? 'pixels' : 'refused',
      error: run.error ?? run.openTimeout ?? openingEvents.findLast((event) => event.error)?.error,
      pageErrors: run.errors,
      firstUploadMs: first ? first.end - run.afterOpen.start : null,
      firstPresentedMs: first ? first.presented - run.afterOpen.start : null,
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
          targetMs,
          allRunsWithinTarget: targetMs && firstPresentedMs ? firstPresentedMs.max <= targetMs : null
        }
      ];
    })
  );
};
const result = {
  after: await summarize(directory),
  notes: [
    'Presented timing uses two animation frames after the upload, not a physical display measurement.',
    'WASM linear memory is a high-water allocation; RSS is sampled across this isolated browser process tree.',
    'Neither byte estimate nor RSS is a native sample-comparison result. Native results are in features.json.',
    'The range is observed min/max across runs, not a cross-device guarantee.'
  ]
};
if (process.argv[3]) {
  result.before = await summarize(resolve(process.argv[3]));
}
await writeFile(`${directory}/measurements.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
