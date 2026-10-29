// Run with node --experimental-strip-types; source metadata only, no pixel decode.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const repo = path.resolve(new URL('../../..', import.meta.url).pathname);
const output = process.env.PSD_CENSUS_OUTPUT ?? '/tmp/psd-phase7a-census.json';
if (!process.env.PSD_TEXT_MIXER_RESEARCH_ROOT) {
  throw new Error('PSD_TEXT_MIXER_RESEARCH_ROOT must name the read-only research checkout.');
}
const root = path.join(process.env.PSD_TEXT_MIXER_RESEARCH_ROOT, 'fixtures/psd');
const { gpuCompositeAdmission } = await import(`${repo}/packages/psd/src/gpu.ts`);
const wasm = await import(`${repo}/packages/psd/wasm-viewer/photoshop_psd_viewer.js`);
await wasm.default({
  module_or_path: await fs.readFile(`${repo}/packages/psd/wasm-viewer/photoshop_psd_viewer_bg.wasm`)
});
async function walk(p) {
  const files = [];
  for (const e of await fs.readdir(p, { withFileTypes: true })) {
    if (e.isDirectory()) {
      files.push(...(await walk(path.join(p, e.name))));
    } else if (/\.(psd|psb)$/i.test(e.name)) {
      files.push(path.join(p, e.name));
    }
  }
  return files;
}
const sets = ['oracle-1', 'oracle-2', 'oracle-seeds-1', 'am-oracle-1'];
const documents = [];
const sampling = [];
const sep = new Set([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'colorDodge',
  'colorBurn',
  'linearDodge',
  'linearBurn',
  'hardLight',
  'softLight',
  'vividLight',
  'linearLight',
  'pinLight',
  'hardMix',
  'difference',
  'exclusion',
  'subtract',
  'divide'
]);
function reasons(info, nodes, details, stage, visibility = new Map(), parents = []) {
  const out = [];
  if (!nodes.length && !parents.length) {
    out.push('flattened-background');
  }
  if (info.mode !== 3) {
    out.push(`mode:${info.modeName}`);
  }
  if (info.depth !== 8) {
    out.push(`depth:${info.depth}`);
  }
  if (info.notes.length) {
    out.push('document-policy-notes');
  }
  if (info.resources.some((r) => r.id === 1075)) {
    out.push('timeline');
  }
  if (info.blocks.some((b) => ['artd', 'abdd'].includes(b.key))) {
    out.push('artboard');
  }
  for (const n of nodes) {
    if (!(visibility.get(n.index) ?? n.visible)) {
      continue;
    }
    const d = details[n.index],
      p = d.properties;
    if (n.keys.some((key) => ['artb', 'artd', 'abdd'].includes(key))) {
      out.push('artboard');
    }
    if (n.notes.length) {
      out.push('layer-policy-notes');
    }
    if (p.blendIf) {
      out.push('blend-if');
    }
    if (p.knockout !== 'none') {
      out.push('knockout');
    }
    if (!p.transparencyShapesLayer) {
      out.push('transparency-shapes-off');
    }
    if (p.blendInteriorAsGroup || !p.blendClippedAsGroup || n.keys.includes('brst')) {
      out.push('advanced-blending');
    }
    if (d.effects || n.keys.some((key) => ['lfx2', 'lfxs', 'lmfx', 'lrFX'].includes(key))) {
      out.push('effects-block');
    }
    if (n.vectorMask) {
      out.push('vector-mask');
    }
    if (n.clipped) {
      out.push(stage < 1 ? 'clipping' : 'clipping-unproven');
    }
    if (n.mask && !n.mask.disabled) {
      if (stage < 1) {
        out.push('raster-mask');
      } else if (
        !d.mask ||
        'error' in d.mask ||
        d.mask.real ||
        d.mask.relativeToLayer ||
        (d.mask.userFeather ?? 0) !== 0
      ) {
        out.push('mask-parameters');
      }
    }
    if (n.kind === 'group') {
      if (stage < 3) {
        out.push('group');
      } else if (n.blendMode !== 'passThrough' || n.opacity !== 255 || n.fill !== 255 || n.mask || n.clipped) {
        out.push('group-return-unproven');
      }
      out.push(
        ...reasons({ ...info, notes: [], resources: [], blocks: [] }, n.children ?? [], details, stage, visibility, [
          ...parents,
          n.index
        ])
      );
    } else {
      if (n.kind === 'smartObject') {
        if (
          !d.smartObject ||
          'error' in d.smartObject ||
          d.smartObject.filters?.maskEnabled ||
          n.keys.some((k) => ['FEid', 'FXid'].includes(k))
        ) {
          out.push('smart-filter-cache-stage');
        }
      } else if (n.kind !== 'pixel') {
        out.push(`kind:${n.kind}`);
      }
      if (!sep.has(n.blendMode)) {
        out.push(`blend:${n.blendMode}`);
      } else if (stage < 2 && n.blendMode !== 'normal') {
        out.push('separable-blend');
      }
      if (n.legacyOpacity) {
        out.push('legacy-opacity-shapes-off');
      }
      if (![0, 1, 2].every((id) => p.channels.includes(id))) {
        out.push('missing-rgb-channel');
      }
    }
  }
  return [...new Set(out)];
}
for (const set of sets) {
  const files = (await walk(path.join(root, set))).sort((a, b) =>
    crypto
      .createHash('sha256')
      .update(a.slice(root.length))
      .digest('hex')
      .localeCompare(crypto.createHash('sha256').update(b.slice(root.length)).digest('hex'))
  );
  const selected = files.slice(0, set === 'oracle-1' || set === 'oracle-2' ? 170 : 30);
  sampling.push({ set, inventory: files.length, sampled: selected.length });
  for (const file of selected) {
    let handle;
    const started = performance.now();
    try {
      const stat = await fs.stat(file);
      if (stat.size > 128 * 1024 * 1024) {
        throw Error('source-over-128MiB-census-budget');
      }
      handle = wasm.PsdDocumentHandle.openWithBudget(await fs.readFile(file), {
        allocationBytes: 128 * 1024 * 1024,
        liveBytes: 2 * 1024 ** 3
      });
      const info = handle.info(),
        layers = handle.layers(),
        details = {};
      const flat = [];
      function collect(ns) {
        for (const n of ns) {
          flat.push(n);
          details[n.index] = handle.layerDetail(n.index);
          if (n.children) {
            collect(n.children);
          }
        }
      }
      collect(layers);
      const stages = [0, 1, 2, 3].map((s) => {
        const why = reasons(info, layers, details, s);
        const toggleResults = flat.map((n) => ({
          index: n.index,
          reasons: reasons(info, layers, details, s, new Map([[n.index, !n.visible]]))
        }));
        return {
          admitted: why.length === 0,
          reasons: why,
          toggles: toggleResults.filter((t) => !t.reasons.length).map((t) => t.index),
          toggleShare: flat.length ? toggleResults.filter((t) => !t.reasons.length).length / flat.length : 0
        };
      });
      const runtimeAdmission = {};
      for (const linearBlending of [false, true]) {
        const reasons = gpuCompositeAdmission(info, layers, new Map(Object.entries(details).map(([i, v]) => [+i, v])), {
          linearBlending,
          textGamma: 1.45,
          smartObjects: null,
          typeLayers: false,
          vectorPaths: false,
          approximate: false
        });
        runtimeAdmission[linearBlending ? 'gamma1' : 'encoded'] = { admitted: !reasons.length, reasons };
      }
      documents.push({
        runtimeAdmission,
        file: file.slice(root.length + 1),
        bytes: stat.size,
        info,
        layers,
        details,
        stages,
        layerToggles: flat.length,
        milliseconds: performance.now() - started
      });
    } catch (e) {
      documents.push({ file: file.slice(root.length + 1), error: String(e) });
    } finally {
      handle?.free();
    }
    if (documents.length % 25 === 0) {
      await fs.writeFile(
        '/tmp/psd-phase7a-census-progress.json',
        JSON.stringify({ processed: documents.length, last: documents.at(-1).file })
      );
      process.stdout.write(`${documents.length}\n`);
    }
  }
}
const summary = [0, 1, 2, 3].map((s) => {
  const valid = documents.filter((d) => d.stages);
  const admitted = valid.filter((d) => d.stages[s].admitted).length;
  const toggles = valid.reduce((sum, d) => sum + d.stages[s].toggles.length, 0);
  const total = valid.reduce((sum, d) => sum + d.layerToggles, 0);
  return {
    stage: ['a', 'b', 'c', 'd'][s],
    documents: admitted,
    documentShare: admitted / documents.length,
    admittedToggles: toggles,
    totalToggles: total,
    toggleShare: total ? toggles / total : 0,
    meanDocumentToggleShare: valid.reduce((sum, d) => sum + d.stages[s].toggleShare, 0) / documents.length
  };
});
const stagesGamma1 = [0, 1, 2, 3].map((stage) => {
  const opened = documents.filter((document) => document.stages);
  const admitted = opened.filter((document) => document.stages[stage].admitted && gammaDomain(document));
  const toggles = opened.reduce(
    (sum, document) =>
      sum +
      document.stages[stage].toggles.filter((index) => {
        const record = Object.values(document.details).find((detail) => detail.index === index);
        return gammaDomain(document, new Map([[index, !record.properties.visible]]));
      }).length,
    0
  );
  return {
    stage: ['a', 'b', 'c', 'd'][stage],
    documents: admitted.length,
    documentShare: admitted.length / documents.length,
    admittedToggles: toggles,
    totalToggles: summary[0].totalToggles,
    toggleShare: toggles / summary[0].totalToggles
  };
});
const ranked = {};
for (const d of documents) {
  for (const r of d.error ? [d.error] : d.stages[3].reasons) ranked[r] = (ranked[r] ?? 0) + 1;
}
const runtime = {};
for (const gamma of ['encoded', 'gamma1']) {
  const accepted = documents.filter((d) => d.runtimeAdmission?.[gamma].admitted);
  const count = accepted.reduce((n, d) => n + d.layerToggles, 0);
  runtime[gamma] = {
    documents: accepted.length,
    documentShare: accepted.length / documents.length,
    admittedToggles: count,
    totalToggles: summary[0].totalToggles,
    toggleShare: count / summary[0].totalToggles
  };
}
await fs.writeFile(
  output,
  JSON.stringify(
    {
      runtime,
      stagesGamma1,
      scopeNotes: [
        'The sampling unit is a public PSD/PSB fixture file, including oracle variants and native/source-input files. These shares do not estimate independent real-world design prevalence.',
        'Stages a-d classify the currently visible stack and each single record visibility flip independently. Masks are limited to unfeathered raster masks; general clipping and isolated group returns remain unproven and excluded. Stage d adds encoded, full-strength Pass Through groups only.',
        'Runtime admission also checks every hidden record. Its toggle count guarantees all record visibility flips of each admitted document. Gamma 1.0 currently requires an untagged sRGB working space and no groups.',
        'Weighted toggle shares use the known record inventory of opened files. Six source-size refusals count as unadmitted documents; their unknown record counts are excluded from the weighted-toggle denominator. Memory and preparation budgets can further refuse individual windows.'
      ],
      baseline: 'a071e66072fb63732c42815ef0ac89c825623471',
      root,
      sampling,
      sampled: documents.length,
      opened: documents.filter((d) => d.stages).length,
      settings: {
        linearBlending: false,
        textGamma: 1.45,
        smartObjects: null,
        typeLayers: false,
        vectorPaths: false,
        approximate: false
      },
      method:
        'Deterministic SHA-256 path order; at most 170 from each public oracle set and 30 seed/AM documents. Conservative stored-semantics admission; all single record visibility flips classified independently. No claims for general clipping or isolated returns. No source pixel decoding during census. Errors count as unadmitted.',
      stages: summary,
      rankedReasons: Object.entries(ranked).sort((a, b) => b[1] - a[1]),
      documents
    },
    null,
    2
  )
);
console.log(JSON.stringify({ sampling, summary, ranked }, null, 2));

/** Gamma-on group materialization differs from flattening; embedded-profile tables need a separate proof. */
function gammaDomain(document, visibility = new Map()) {
  if (document.info.resources.some((resource) => resource.id === 1039)) {
    return false;
  }
  return !document.layers.some((node) => node.kind === 'group' && (visibility.get(node.index) ?? node.visible));
}
