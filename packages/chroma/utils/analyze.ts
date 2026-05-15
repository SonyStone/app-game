const { abs, floor, log, pow } = Math;

export type Analysis = {
  min: number;
  max: number;
  sum: number;
  values: number[];
  count: number;
  domain: [number, number];
  limits: (mode?: string, num?: number) => number[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toValues(data: readonly unknown[] | Record<string, unknown>): readonly unknown[] {
  return Array.isArray(data) ? data : Object.values(data);
}

function isAnalysis(value: Analysis | readonly unknown[]): value is Analysis {
  return !Array.isArray(value);
}

function getNumericValue(value: unknown, key: string | null): number | undefined {
  const candidate = key != null && isRecord(value) ? value[key] : value;
  return typeof candidate === 'number' && !Number.isNaN(candidate) ? candidate : undefined;
}

export function analyze(data: readonly unknown[] | Record<string, unknown>, key: string | null = null): Analysis {
  const analysisBase = {
    min: Number.MAX_VALUE,
    max: -Number.MAX_VALUE,
    sum: 0,
    values: [] as number[],
    count: 0
  };

  for (const value of toValues(data)) {
    const numericValue = getNumericValue(value, key);
    if (numericValue == null) {
      continue;
    }
    analysisBase.values.push(numericValue);
    analysisBase.sum += numericValue;
    if (numericValue < analysisBase.min) analysisBase.min = numericValue;
    if (numericValue > analysisBase.max) analysisBase.max = numericValue;
    analysisBase.count += 1;
  }

  const analysis: Analysis = {
    ...analysisBase,
    domain: [analysisBase.min, analysisBase.max],
    limits: (mode = 'equal', num = 7) => limits(analysis, mode, num)
  };
  return analysis;
}

export function limits(data: Analysis | readonly unknown[], mode = 'equal', num = 7): number[] {
  const analysis = isAnalysis(data) ? data : analyze(data);
  const min = analysis.min;
  const max = analysis.max;
  const values = analysis.values.slice().sort((left, right) => left - right);
  if (num === 1) {
    return [min, max];
  }

  const output: number[] = [];
  if (mode.startsWith('c')) {
    output.push(min, max);
    return output;
  }

  if (mode.startsWith('e')) {
    output.push(min);
    for (let index = 1; index < num; index += 1) {
      output.push(min + (index / num) * (max - min));
    }
    output.push(max);
    return output;
  }

  if (mode.startsWith('l')) {
    if (min <= 0) {
      throw new Error('Logarithmic scales are only possible for values > 0');
    }
    const minLog = Math.LOG10E * log(min);
    const maxLog = Math.LOG10E * log(max);
    output.push(min);
    for (let index = 1; index < num; index += 1) {
      output.push(pow(10, minLog + (index / num) * (maxLog - minLog)));
    }
    output.push(max);
    return output;
  }

  if (mode.startsWith('q')) {
    output.push(min);
    for (let index = 1; index < num; index += 1) {
      const position = ((values.length - 1) * index) / num;
      const base = floor(position);
      if (base === position) {
        output.push(values[base] ?? max);
      } else {
        const ratio = position - base;
        output.push((values[base] ?? min) * (1 - ratio) + (values[base + 1] ?? max) * ratio);
      }
    }
    output.push(max);
    return output;
  }

  if (!mode.startsWith('k')) {
    return output;
  }

  const assignments = new Array<number>(values.length).fill(0);
  const clusterSizes = new Array<number>(num).fill(0);
  let centroids = [min, ...Array.from({ length: num - 1 }, (_, index) => min + ((index + 1) / num) * (max - min)), max];
  let repeat = true;
  let iterations = 0;

  while (repeat && iterations <= 200) {
    clusterSizes.fill(0);
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const value = values[valueIndex] ?? min;
      let best = 0;
      let minDistance = Number.MAX_VALUE;
      for (let centroidIndex = 0; centroidIndex < num; centroidIndex += 1) {
        const distance = abs((centroids[centroidIndex] ?? min) - value);
        if (distance < minDistance) {
          minDistance = distance;
          best = centroidIndex;
        }
      }
      clusterSizes[best] += 1;
      assignments[valueIndex] = best;
    }

    const newCentroids = new Array<number>(num).fill(0);
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const cluster = assignments[valueIndex] ?? 0;
      newCentroids[cluster] += values[valueIndex] ?? 0;
    }
    for (let centroidIndex = 0; centroidIndex < num; centroidIndex += 1) {
      if (clusterSizes[centroidIndex] > 0) {
        newCentroids[centroidIndex] /= clusterSizes[centroidIndex];
      } else {
        newCentroids[centroidIndex] = centroids[centroidIndex] ?? min;
      }
    }

    repeat = newCentroids.some((value, index) => value !== centroids[index]);
    centroids = newCentroids;
    iterations += 1;
  }

  const clusters = Array.from({ length: num }, () => [] as number[]);
  for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
    const cluster = assignments[valueIndex] ?? 0;
    clusters[cluster].push(values[valueIndex] ?? 0);
  }

  const breaks = clusters
    .flatMap((cluster) => (cluster.length > 0 ? [cluster[0] ?? min, cluster[cluster.length - 1] ?? max] : []))
    .sort((left, right) => left - right);
  if (breaks.length > 0) {
    output.push(breaks[0]);
    for (let index = 1; index < breaks.length; index += 2) {
      const value = breaks[index] ?? max;
      if (!Number.isNaN(value) && !output.includes(value)) {
        output.push(value);
      }
    }
  }
  return output;
}
