/** Compare identical device/workload configurations. Tolerances absorb timing noise, not missing cases or lost ink. */
export function compareBrushPerformance(baseline, actual) {
  if (baseline.schema !== 1 || actual.schema !== 1 ||
      JSON.stringify(baseline.environment) !== JSON.stringify(actual.environment))
    return ['Device/browser/viewport differs from the baseline. Use the matching configuration; do not compare cross-device timings.'];
  const failures = [];
  if (JSON.stringify(baseline.cases.map(c => c.id)) !== JSON.stringify(actual.cases.map(c => c.id)))
    return ['Benchmark cases changed or are missing. Review the workload before creating a new baseline.'];
  for (const [index, previous] of baseline.cases.entries()) {
    const current = actual.cases[index];
    for (const field of ['preset', 'size', 'distance', 'lod', 'mixing'])
      if (current[field] !== previous[field]) failures.push(`${current.id}: workload ${field} changed.`);
    for (const [field, factor, slack] of [
      ['drawMs', 1.25, 10], ['finishMs', 1.35, 10], ['maxFrameGapMs', 1.35, 16],
      ['stamps', 1.1, 0], ['submissions', 1.15, 8], ['gpuBytes', 1.15, 1048576]
    ]) {
      if (!Number.isFinite(current[field]) || !Number.isFinite(previous[field]) || current[field] < 0 ||
          current[field] > previous[field] * factor + slack)
        failures.push(`${current.id}: ${field} regressed (${previous[field]} → ${current[field]}).`);
    }
    if (!current.stamps || current.pixelHash !== previous.pixelHash)
      failures.push(`${current.id}: output changed or no stamps were produced. Visual review required.`);
  }
  return failures;
}
