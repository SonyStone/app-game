/**
 * Compare a benchmark result with a baseline recorded on the same configuration.
 *
 * The configuration is the device label, the WebGPU adapter (`adapter.info` vendor, architecture, device,
 * description), the viewport, and `devicePixelRatio`. The browser user agent is recorded but not compared, so a
 * Chrome update does not invalidate a baseline; a different GPU or display configuration does. Adapter fields the
 * baseline does not record (older baselines lack `gpu.device`) cannot be verified and produce warnings instead of
 * failures. Tolerances absorb timing noise, not missing cases or lost ink.
 *
 * @returns `failures` block acceptance; `warnings` describe what could not be verified.
 */
export function compareBrushPerformance(baseline, actual) {
  const warnings = [];
  if (baseline.schema !== 1 || actual.schema !== 1) {
    return { failures: ['Unsupported benchmark schema. Record a new baseline with the current runner.'], warnings };
  }

  const configuration = compareConfiguration(baseline.environment ?? {}, actual.environment ?? {}, warnings);
  if (configuration.length) {
    return {
      failures: [
        ...configuration,
        'Use the matching configuration; do not compare timings across devices, GPUs, or viewports.'
      ],
      warnings
    };
  }

  if (JSON.stringify(baseline.cases.map(c => c.id)) !== JSON.stringify(actual.cases.map(c => c.id))) {
    return {
      failures: ['Benchmark cases changed or are missing. Review the workload before creating a new baseline.'],
      warnings
    };
  }

  const failures = [];
  for (const [index, previous] of baseline.cases.entries()) {
    const current = actual.cases[index];
    for (const field of ['preset', 'size', 'distance', 'lod', 'mixing']) {
      if (current[field] !== previous[field]) {
        failures.push(`${current.id}: workload ${field} changed.`);
      }
    }

    for (const [field, factor, slack] of tolerances) {
      if (!Number.isFinite(current[field]) || !Number.isFinite(previous[field]) || current[field] < 0 ||
          current[field] > previous[field] * factor + slack) {
        failures.push(`${current.id}: ${field} regressed (${previous[field]} → ${current[field]}).`);
      }
    }

    if (!current.stamps || current.pixelHash !== previous.pixelHash) {
      failures.push(`${current.id}: output changed or no stamps were produced. Visual review required.`);
    }
  }
  return { failures, warnings };
}

/** Returns one failure per differing configuration field; appends unverifiable adapter fields to `warnings`. */
function compareConfiguration(baseline, actual, warnings) {
  const failures = [];
  for (const field of ['device', 'width', 'height', 'dpr']) {
    if (baseline[field] !== actual[field]) {
      failures.push(`Configuration ${field} differs (${baseline[field]} → ${actual[field]}).`);
    }
  }

  for (const field of adapterFields) {
    const expected = baseline.gpu?.[field];
    const current = actual.gpu?.[field];
    if (expected === undefined) {
      warnings.push(`Baseline does not record GPU adapter ${field}; ${JSON.stringify(current)} cannot be verified.`);
    } else if (expected !== current) {
      failures.push(`GPU adapter ${field} differs (${JSON.stringify(expected)} → ${JSON.stringify(current)}).`);
    }
  }
  return failures;
}

/** `GPUAdapterInfo` fields that identify the GPU configuration. */
const adapterFields = ['vendor', 'architecture', 'device', 'description'];

/** Metric, allowed ratio over the baseline, and absolute slack in the metric's unit. */
const tolerances = [
  ['drawMs', 1.25, 10], ['finishMs', 1.35, 10], ['maxFrameGapMs', 1.35, 16],
  ['stamps', 1.1, 0], ['submissions', 1.15, 8], ['gpuBytes', 1.15, 1048576]
];
