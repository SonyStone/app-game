import type { BrushFormValues } from '@app-game/abr-brush/form';
import { featureFields } from '@app-game/abr-brush/settings-fields';
import type { Brush } from '@app-game/paint-core/brush';
import {
  brushSchema,
  versionOneDefaults as defaults,
  parseDocument,
  patch,
  type BrushDocument
} from '@app-game/paint-core/paintbrush/document';
import { documentFormValues, patchAbrValues } from './abrDocument';
import { hostExtension, hostSettings } from './abrHost';
import type { BrushPreset } from './brushPresets';
import { nativePresetText, paintDocumentFields, pressureBinding } from './nativeDocument';

/**
 * Which encoding a brush document uses for Paint's own settings: `paint` for documents placed by Paint's distance law
 * (round brushes and Paint's sampled tips), whose size, transfer, tip, stroke and mixing sections are what Paint
 * draws; `photoshop` for Photoshop presets, whose size is the descriptor's reference diameter and whose Paint
 * settings live in the `paint.abr-host.v1` extension.
 */
export function documentFamily(document: BrushDocument): 'paint' | 'photoshop' {
  return (document.definition.placement?.law ?? defaults.placement.law) === 'paint-distance-v1' ? 'paint' : 'photoshop';
}

/** Paint's own settings a brush document carries, which the studio, the board and the renderer share. */
export const hostKeys = ['size', 'opacity', 'flow', 'hardness', 'spacing', 'mixing', 'stroke'] as const;

/** One of {@link hostKeys}. */
export type HostKey = (typeof hostKeys)[number];

/**
 * The brush `document` draws with, for Paint's own settings: `fallback` with the values the document holds over it,
 * as the resolver gives them. A Paint document holds them in its standard sections, its pressure bindings as
 * `pressureSize` and `pressureFlow`; a Photoshop document in its host extension, falling back on the descriptor's
 * diameter, transfer, stroke and mixing, while its hardness and spacing are the descriptor's (`values`).
 */
export function documentHost(document: BrushDocument, values: BrushFormValues, fallback: Brush): Brush {
  const d = document.definition;
  if (documentFamily(document) === 'paint') {
    const fields = paintDocumentFields(document);
    if (fields.status !== 'supported') {
      return fallback;
    }

    const { engine: _engine, color: _color, backgroundColor: _background, ...settings } = fields.settings;
    return { ...fallback, ...settings };
  }

  const saved = hostSettings.safeParse(d.extensions?.[hostExtension]?.value ?? {});
  const host = saved.success ? saved.data : {};
  return {
    ...fallback,
    size: host.size ?? d.size ?? fallback.size,
    opacity: host.opacity ?? d.transfer?.opacity ?? 1,
    flow: host.flow ?? d.transfer?.flow ?? 1,
    mixing: host.mixing ?? (d.mixing as Brush['mixing'] | undefined) ?? fallback.mixing,
    stroke: host.stroke ?? (d.stroke ? strokeOf(d.stroke) : fallback.stroke),
    hardness: values.hardness / 100,
    spacing: values.spacing / 100
  };
}

/**
 * Writes Paint's setting `key` into the document `text`, at the one place the document keeps it (see
 * {@link documentHost}). A Paint document takes it in its standard section, also in its native settings extension when
 * that overrides the section, and lists the section among those it applies. A Photoshop document takes its size in
 * the host extension, leaving the descriptor's reference diameter; every other setting in the descriptor's section,
 * and also in the host extension when the document has one, so the two never disagree.
 */
export function writeHost<K extends HostKey>(text: string, key: K, value: Brush[K]): string {
  const document = parseDocument(text, brushSchema);
  const d = document.definition;
  if (documentFamily(document) === 'paint') {
    const tip = d.sequence.tips[0]!;
    const address: Record<HostKey, string[]> = {
      size: ['size'],
      opacity: ['transfer', 'opacity'],
      flow: ['transfer', 'flow'],
      hardness: ['tips', tip, 'hardness'],
      spacing: ['placement', 'spacing'],
      mixing: ['mixing'],
      stroke: ['stroke']
    };
    let next = put(
      text,
      ['definition', ...address[key]],
      key === 'stroke' ? strokeSection(value as Brush['stroke']) : value
    );
    next = applying(next, '/' + address[key][0]);
    const native = d.extensions?.[nativeId]?.value as Record<string, unknown> | undefined;
    if (native && (key === 'hardness' || key === 'spacing') && native[key] !== undefined) {
      next = put(next, ['definition', 'extensions', nativeId, 'value', key], value);
    }

    if (native && Array.isArray(native.keys) && !native.keys.includes(key)) {
      next = put(next, ['definition', 'extensions', nativeId, 'value', 'keys'], [...native.keys, key]);
    }

    return next;
  }

  const hasHost = !!d.extensions?.[hostExtension];
  let next = text;
  if (key === 'opacity' || key === 'flow') {
    const values = documentFormValues(document);
    next = patchAbrValues(next, { ...values, tool: { ...values.tool, [key]: percent(value as number) } });
  } else if (key === 'hardness' || key === 'spacing') {
    next = patchAbrValues(next, { ...documentFormValues(document), [key]: percent(value as number) });
  } else if (key === 'mixing') {
    next = put(next, ['definition', 'mixing'], value);
  } else if (key === 'stroke') {
    next = put(next, ['definition', 'stroke'], strokeSection(value as Brush['stroke']));
  }

  if (key === 'size' || hasHost) {
    next = hasHost
      ? put(next, ['definition', 'extensions', hostExtension, 'value', key], value)
      : put(next, ['definition', 'extensions', hostExtension], { impact: 'tool', value: { [key]: value } });
  }

  return next;
}

/**
 * The document `text` with Paint's settings of the brush `live` written in where they differ, so that a document read
 * after changes made outside the studio, such as the board's Size, shows and resolves to what the brush draws with.
 * See {@link writeSettings}.
 */
export function syncHost(text: string, live: Brush): string {
  return writeSettings(text, live);
}

/**
 * The document `text` with those of Paint's own settings among `settings` written in that differ from what it holds
 * (see {@link writeHost}): what Save writes into a round brush's document. A Photoshop document keeps its descriptor's
 * hardness and spacing. A Paint document whose pressure groups carry no switch of their own also takes the pressure
 * responses as Paint's pressure bindings.
 */
export function writeSettings(text: string, settings: Partial<Brush>): string {
  const document = parseDocument(text, brushSchema);
  const family = documentFamily(document);
  const held = documentHost(document, documentFormValues(document), settings as Brush);
  let next = text;
  for (const key of hostKeys) {
    if ((key === 'hardness' || key === 'spacing') && family === 'photoshop') {
      continue;
    }

    if (settings[key] !== undefined && JSON.stringify(held[key]) !== JSON.stringify(settings[key])) {
      next = writeHost(next, key, settings[key]);
    }
  }

  if (family === 'paint') {
    for (const group of pressureGroups) {
      const on = settings[group.brushKey];
      if (on !== undefined && on !== held[group.brushKey] && switchOf(document, group) === undefined) {
        next = withBinding(next, group.target, on);
      }
    }
  }

  return next;
}

/** Whether `document` is a Paint document with a round tip, which holds Paint's settings in its own sections. */
export function roundFamily(document: BrushDocument) {
  const d = document.definition;
  return documentFamily(document) === 'paint' && d.tips[d.sequence.tips[0]!]?.kind !== 'sampled';
}

/**
 * Writes the Photoshop form `values` into the document `text` (see `patchAbrValues`). A Paint document keeps Paint's
 * own encodings: its fractions exact, without Photoshop's round-off record; its pressure on size or flow as Paint's
 * pressure binding while Shape dynamics or Transfer say nothing more than that binding does, and otherwise in the
 * group's extension with its switch; and no Photoshop tool or tip value left at what the document reads without it.
 * Every value of a switched-off group stays, dormant, for when the group is switched on again.
 */
export function patchFormValues(text: string, values: BrushFormValues): string {
  if (documentFamily(parseDocument(text, brushSchema)) === 'photoshop') {
    return patchAbrValues(text, values);
  }

  let next = withoutRoundOff(patchAbrValues(text, values));
  for (const group of pressureGroups) {
    next = normalizePressure(next, group, values);
  }

  return pruned(next);
}

/**
 * The images the document stores for its Photoshop groups: a texture's pattern, and a sampled second tip for the dual
 * brush. A texture cannot be switched on without its pattern. A dual brush needs its image only when it names a
 * sampled second tip; otherwise the ABR resolver generates a computed second tip from its parameters.
 */
export function documentImages(document: BrushDocument) {
  const d = document.definition;
  const dual = (d.dual && d.tips[d.dual.tip]?.resource) ?? d.extensions?.['photoshop.dual-brush.v1']?.resources?.[0];
  return {
    pattern: !!d.texture || !!d.extensions?.['photoshop.texture.v1']?.resources?.length,
    dual: !!dual && !!document.resources?.[dual]
  };
}

/**
 * The document a round `brush` of `preset` is, keeping what a retained imported file or the preset's own document
 * holds beyond the brush's settings, such as dormant Photoshop groups. Colors stay with the user.
 */
export function roundDocumentText(preset: BrushPreset | undefined, brush: Brush): string {
  const { color: _color, backgroundColor: _background, ...settings } = brush;
  return nativePresetText({
    id: preset?.id ?? 'brush',
    name: preset?.name ?? 'Brush',
    resourceIds: [],
    ...preset,
    settings
  });
}

/** Paint's pressure groups: the Photoshop group whose Pen pressure control a Paint pressure binding stands for. */
const pressureGroups = [
  {
    extension: 'photoshop.shape-dynamics.v1',
    feature: 'useShapeDynamics',
    group: 'shapeDynamics',
    target: '/size',
    brushKey: 'pressureSize'
  },
  {
    extension: 'photoshop.transfer.v1',
    feature: 'useTransfer',
    group: 'transfer',
    target: '/transfer/flow',
    brushKey: 'pressureFlow'
  }
] as const;

type PressureGroup = (typeof pressureGroups)[number];

/** The group's own switch in its extension, `undefined` while it has none. */
function switchOf(document: BrushDocument, group: PressureGroup) {
  const value = document.definition.extensions?.[group.extension]?.value as Record<string, unknown> | undefined;
  const switched = value?.[featureFields[group.feature].path];
  return typeof switched === 'boolean' ? switched : undefined;
}

/**
 * Re-encodes one pressure group of a Paint document so that it reads as `values` say: Paint's pressure binding alone
 * when that is all the group does, nothing when the group is off with nothing stored, and otherwise the group's
 * extension with all its values and its switch, without the binding.
 */
function normalizePressure(text: string, group: PressureGroup, values: BrushFormValues) {
  const wanted = JSON.stringify([values[group.feature], values[group.group]]);
  const read = (candidate: string) => {
    const form = documentFormValues(parseDocument(candidate, brushSchema));
    return JSON.stringify([form[group.feature], form[group.group]]);
  };
  const bare = withBinding(withoutExtension(text, group.extension), group.target, false);
  const bound = withBinding(bare, group.target, true);
  if (read(bound) === wanted) {
    return bound;
  }

  if (read(bare) === wanted) {
    return bare;
  }

  const form = documentFormValues(parseDocument(bare, brushSchema));
  const written = patchAbrValues(bare, {
    ...form,
    [group.feature]: values[group.feature],
    [group.group]: values[group.group]
  });
  const path = featureFields[group.feature].path;
  return parseDocument(written, brushSchema).definition.extensions?.[group.extension]
    ? put(written, ['definition', 'extensions', group.extension, 'value', path], values[group.feature])
    : put(written, ['definition', 'extensions', group.extension], {
        impact: 'appearance',
        value: { [path]: values[group.feature] }
      });
}

/** The text with Paint's identity pressure binding on `target` added or removed, and `/dynamics` applied. */
function withBinding(text: string, target: string, on: boolean) {
  const d = parseDocument(text, brushSchema).definition;
  const kept = (d.dynamics ?? []).filter((binding) => binding.target !== target);
  const has = (d.dynamics ?? []).some((binding) => binding.target === target);
  if (has === on) {
    return text;
  }

  const bindings = on ? [...kept, pressureBinding(target)] : kept;
  return applying(put(text, ['definition', 'dynamics'], bindings), '/dynamics');
}

/** The text without the extension `id`. */
function withoutExtension(text: string, id: string) {
  const extensions = parseDocument(text, brushSchema).definition.extensions;
  if (!extensions || !Object.hasOwn(extensions, id)) {
    return text;
  }

  const { [id]: _removed, ...rest } = extensions;
  return patch(text, '/definition/extensions', rest);
}

/** A Paint document's Photoshop extensions without their round-off records, which only Photoshop's integers need. */
function withoutRoundOff(text: string) {
  let next = text;
  for (const [id, extension] of Object.entries(parseDocument(text, brushSchema).definition.extensions ?? {})) {
    const value = extension.value as Record<string, unknown>;
    if (!id.startsWith('photoshop.') || typeof value !== 'object' || value === null) {
      continue;
    }

    const kept = Object.fromEntries(Object.entries(value).filter(([key]) => !key.endsWith('.roundoff')));
    if (Object.keys(kept).length === Object.keys(value).length) {
      continue;
    }

    next = Object.keys(kept).length
      ? patch(next, '/definition/extensions/' + escape(id) + '/value', kept)
      : withoutExtension(next, id);
  }

  return next;
}

/**
 * A Paint document without the values of its switchless Photoshop extensions (tool and tip) that it reads the same
 * without, so that a mode set back to Normal returns the brush to Paint's round renderer. Switched groups keep every
 * value, as Photoshop's own descriptors do.
 */
function pruned(text: string) {
  const switched = new Set<string>(pressureGroups.map((group) => group.extension));
  for (const name of Object.keys(featureFields)) {
    switched.add(
      'photoshop.' +
        name
          .slice(3)
          .replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
          .slice(1) +
        '.v1'
    );
  }

  let next = text;
  const reference = JSON.stringify(documentFormValues(parseDocument(text, brushSchema)));
  for (const [id, extension] of Object.entries(parseDocument(text, brushSchema).definition.extensions ?? {})) {
    if (!id.startsWith('photoshop.') || switched.has(id) || extension.resources?.length) {
      continue;
    }

    const value = { ...(extension.value as Record<string, unknown>) };
    for (const key of Object.keys(value)) {
      const { [key]: _removed, ...rest } = value;
      const candidate = Object.keys(rest).length
        ? patch(next, '/definition/extensions/' + escape(id) + '/value', rest)
        : withoutExtension(next, id);
      if (JSON.stringify(documentFormValues(parseDocument(candidate, brushSchema))) === reference) {
        delete value[key];
        next = candidate;
      }
    }
  }

  return next;
}

/** Lists `section` among the paths a document with an `apply` list applies. */
function applying(text: string, section: string) {
  const apply = parseDocument(text, brushSchema).apply;
  return apply && !apply.includes(section) ? patch(text, '/apply', [...apply, section]) : text;
}

/** Writes `value` at the definition address `path`, creating the objects on the way that the document lacks. */
function put(text: string, path: readonly string[], value: unknown) {
  let node: unknown = JSON.parse(text);
  for (const [index, key] of path.entries()) {
    const object = node as Record<string, unknown> | undefined;
    if (index === path.length - 1 || !object || typeof object[key] !== 'object' || object[key] === null) {
      const nested = path.slice(index + 1).reduceRight<unknown>((child, name) => ({ [name]: child }), value);
      return patch(
        text,
        '/' +
          path
            .slice(0, index + 1)
            .map(escape)
            .join('/'),
        nested
      );
    }

    node = object[key];
  }

  return text;
}

/** A JSON Pointer token for `key`. */
function escape(key: string) {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Paint's stroke settings as the document's stroke section. */
function strokeSection(stroke: Brush['stroke']) {
  const { mode, ...levels } = stroke;
  return { smoothing: mode, ...levels };
}

/** The document's stroke section as Paint's stroke settings, with version one's defaults for absent levels. */
function strokeOf(stroke: NonNullable<BrushDocument['definition']['stroke']>): Brush['stroke'] {
  return {
    mode: (stroke.smoothing ?? defaults.smoothing) as Brush['stroke']['mode'],
    normal: stroke.normal ?? defaults.normal,
    smooth: stroke.smooth ?? defaults.smooth,
    stabilizer: stroke.stabilizer ?? defaults.stabilizer,
    catchUp: stroke.catchUp ?? defaults.catchUp
  };
}

/** A fraction in percent, without the binary noise of the multiplication: 0.35 is 35, not 35.00000000000001. */
function percent(fraction: number) {
  return Math.round(fraction * 1e11) / 1e9;
}

const nativeId = 'paint.native-settings.v1';
