// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { plateRadius } from './grid';

/** Plate radii the rules are checked at: sharp tiles, the old 13 px, soft tiles and fully rounded ones. */
const plateRadii = { sharp: 6, today: 13, soft: 20, full: 28 } as const;

it("keeps a plate's radius 18 px at a 44 px cell and the same share of the cell at every size", () => {
  expect(plateRadius(44)).toBe(18);
  expect(plateRadius(28)).toBeCloseTo((18 * 28) / 44, 10);
  expect(plateRadius(56) / 56).toBeCloseTo(18 / 44, 10);
});

/**
 * The radius rule as the stylesheet states it: every corner token is the plate radius less the distance to it, never
 * below zero, then multiplied by the corner scale. Evaluates the tokens declared on `.editor` for a plate radius and a
 * scale, by default the plain arcs' 1.
 */
function cornerTokens(radius: number, scale = 1) {
  const css = stylesheet('LegoStudio');
  const editor = /^\.editor \{([\s\S]*?)^\}/m.exec(css)![1]!;
  const declared = new Map(
    [
      ...editor.matchAll(/(--lego-r[\w-]*|--lego-radius|--lego-corner-scale|--settings-list[\w-]*radius):\s*([^;]+);/g)
    ].map((match) => [match[1]!, match[2]!])
  );
  declared.set('--lego-radius', `${radius}px`);
  declared.set('--lego-corner-scale', `${scale}`);
  const value = (name: string): number => {
    const expression = declared
      .get(name)!
      .replace(/var\((--[\w-]+)\)/g, (_match, inner: string) => `${value(inner)}`)
      .replace(/px/g, '')
      .replace(/calc/g, '')
      .replace(/\b(min|max)\(/g, 'Math.$1(');
    return Function(`return ${expression}`)() as number;
  };

  return Object.fromEntries([...declared.keys()].map((name) => [name, value(name)]));
}

it('derives every corner from the plate radius, an inner one being the outer less the distance, never below zero', () => {
  expect(cornerTokens(plateRadii.today)).toMatchObject({
    '--lego-r-plate': 13,
    '--lego-r-outline': 11,
    '--lego-r-bar-button': 9,
    '--lego-r-tile': 7,
    '--lego-r-popup-tile': 5,
    '--lego-r-inner': 4,
    '--lego-r-card-key': 3,
    '--lego-r-card-mark': 0,
    '--settings-list-radius': 5,
    '--settings-list-icon-radius': 3
  });
  // A list's icon tile is concentric with its row at the default 18 px, and kept between 3 and 5 px elsewhere.
  expect(cornerTokens(18)).toMatchObject({ '--settings-list-radius': 10, '--settings-list-icon-radius': 3 });
  expect(cornerTokens(plateRadii.full)).toMatchObject({ '--settings-list-icon-radius': 5 });
  expect(cornerTokens(plateRadii.soft)).toMatchObject({ '--lego-r-tile': 14, '--lego-r-inner': 11 });
  // A badge nests as an inner corner but stops at 4 px, so on 20 px a squircle keeps its straight sides.
  expect(cornerTokens(plateRadii.today)).toMatchObject({ '--lego-r-badge': 4 });
  expect(cornerTokens(18)).toMatchObject({ '--lego-r-inner': 9, '--lego-r-badge': 4 });
  expect(cornerTokens(plateRadii.sharp)).toMatchObject({ '--lego-r-badge': 0 });
  expect(cornerTokens(plateRadii.sharp)).toMatchObject({
    '--lego-r-plate': 6,
    '--lego-r-tile': 0,
    '--lego-r-inner': 0,
    '--lego-r-card-key': 0
  });
});

it('scales every corner alike for squircles, after the distances are taken off as for arcs', () => {
  const css = stylesheet('LegoStudio');
  const scale = Number(
    /@supports \(corner-shape: squircle\) \{\s*\.editor \{\s*--lego-corner-shape: squircle;\s*--lego-corner-scale:\s*([\d.]+);/.exec(
      css
    )![1]
  );
  expect(scale).toBeCloseTo((1 - Math.SQRT1_2) / (1 - 0.5 ** 0.25), 2);

  const arcs = cornerTokens(plateRadii.soft);
  const squircles = cornerTokens(plateRadii.soft, scale);
  for (const name of Object.keys(arcs)) {
    expect(squircles[name]).toBeCloseTo(name === '--lego-radius' ? arcs[name]! : arcs[name]! * scale, 5);
  }
});

/** The LEGO stylesheets. */
const sheets = [
  'LegoStudio',
  'LayerParts',
  'FloatingGrip',
  'FileMenu',
  'PartsShowcase',
  'PartsTray',
  'layersPrototype/LayersPrototype'
];

it('leaves no fixed corner radius in the LEGO stylesheets but circles and pills', () => {
  const fixed = sheets
    .map(stylesheet)
    .flatMap((css) => [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1]!))
    .filter((value) => !/var\(--lego-r|var\(--studio-row-|inherit|^50%$|^999px$|^0$|^2px$/.test(value));

  expect(fixed).toEqual([]);
});

it('shapes every corner through one shared rule', () => {
  const declared = sheets
    .map(stylesheet)
    .flatMap((css) => [...css.matchAll(/(^|[\s;{])corner-shape:\s*([^;]+);/g)].map((match) => match[2]!));
  expect(declared.filter((value) => value !== 'round')).toEqual(['var(--lego-corner-shape)']);
  expect(stylesheet('LegoStudio')).toMatch(
    /^:where\(\.editor, \.editor \*\),\n:where\(\.editor \*\)::before,\n:where\(\.editor \*\)::after \{\n {2}corner-shape: var\(--lego-corner-shape\);\n\}/m
  );
});

/*
 * The shared rule weighs nothing, so a circle or capsule anywhere in the editor stays round only with its own
 * `corner-shape: round` beside its radius; without it a squircle look turns it into a rounded square. The guard reads
 * what the editor can actually show: every stylesheet and module reached by imports from `LegoStudio`, hosted
 * features, other variants' parts (the Zen colour disc) and workspace packages alike, rather than a list of folders.
 */
it('keeps every circle and capsule the editor can show round, wherever its stylesheet lives', () => {
  const { stylesheets, modules } = legoSources();
  const tokens = customProperties(stylesheets.map((file) => file.text));
  const round = stylesheets.flatMap((file) =>
    ruleBlocks(file.text)
      .filter((block) => roundShape(block, tokens))
      .map((block) => ({
        where: `${file.name} ${block.selector}`,
        guarded: block.get('corner-shape').includes('round')
      }))
  );
  const inline = modules.flatMap((file) =>
    file.text
      .split('\n')
      .map((line, at, lines) => ({ line, near: lines.slice(Math.max(0, at - 2), at + 3).join('\n') }))
      .filter(
        ({ line }) => /border-?[rR]adius/.test(line) && roundValue(line.replace(/^.*?[rR]adius/, ''), Infinity, tokens)
      )
      .map(({ line, near }) => ({
        where: `${file.name}: ${line.trim()}`,
        guarded: /corner-?[sS]hape['"]?:\s*['"]?round/.test(near)
      }))
  );

  // The colour disc and the brush studio come in through other folders, so reaching them proves the walk follows.
  expect(stylesheets.map((file) => file.name)).toEqual(
    expect.arrayContaining(['variants/zen/ZenStudio.module.css', 'features/brush-editor/BrushEditor.module.css'])
  );
  expect(round.length).toBeGreaterThan(50);
  expect([...round, ...inline].filter((shape) => !shape.guarded).map((shape) => shape.where)).toEqual([]);
});

/** A rule's selector and its own declarations (not those of rules nested in it), each property's values in order. */
type RuleBlock = { selector: string; get: (property: string) => string[] };

/** The rules of `css`, nested ones included, comments left out. */
function ruleBlocks(css: string): RuleBlock[] {
  const blocks: { selector: string; declarations: string }[] = [];
  const open: { selector: string; declarations: string }[] = [];
  let text = '';
  for (const character of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (character === '{') {
      open.push({ selector: text.trim(), declarations: '' });
      text = '';
    } else if (character === '}') {
      const block = open.pop()!;
      block.declarations += text;
      blocks.push(block);
      text = '';
    } else if (character === ';') {
      if (open.length > 0) {
        open.at(-1)!.declarations += `${text};`;
      }

      text = '';
    } else {
      text += character;
    }
  }

  return blocks.map(({ selector, declarations }) => ({
    selector: selector.replace(/\s+/g, ' '),
    get: (property) =>
      [...declarations.matchAll(new RegExp(`(?:^|;)\\s*(?:${property})\\s*:\\s*([^;]+)`, 'g'))].map((match) =>
        match[1]!.trim()
      )
  }));
}

/** Every custom property declared in `sheets`, with all the values it is given anywhere. */
function customProperties(sheets: readonly string[]) {
  const declared = new Map<string, string[]>();
  for (const css of sheets) {
    for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
      declared.set(match[1]!, [...(declared.get(match[1]!) ?? []), match[2]!.trim()]);
    }
  }

  return declared;
}

/**
 * Whether `block` draws a circle or capsule: a corner radius of 50% or 100%, of 99 px or more, half of something, or
 * at least half the block's own width or height in pixels; a custom property counts when any value it is given does.
 * A radius `inherit`ed from a round parent is not seen.
 */
function roundShape(block: RuleBlock, tokens: Map<string, string[]>) {
  const sizes = block
    .get('width|height|inline-size|block-size')
    .map((value) => /^(\d+(?:\.\d+)?)px$/.exec(value)?.[1])
    .filter((value) => value !== undefined)
    .map(Number);
  const size = Math.min(...sizes, Infinity);

  return block.get('border(?:-(?:top|bottom)-(?:left|right))?-radius').some((value) => roundValue(value, size, tokens));
}

/** Whether a radius `value` makes a circle or capsule of something `size` pixels across at its narrowest. */
function roundValue(value: string, size: number, tokens: Map<string, string[]>, depth = 0): boolean {
  if (/(^|[\s(,'"`:])(50|100)%/.test(value) || /\/\s*2\b/.test(value)) {
    return true;
  }

  if (
    [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].some((match) => Number(match[1]) >= 99 || Number(match[1]) * 2 >= size)
  ) {
    return true;
  }

  return (
    depth < 4 &&
    [...value.matchAll(/var\((--[\w-]+)/g)].some((match) =>
      // A token worked out from others, as the corner radii are, is compared with the size only as a plain length.
      (tokens.get(match[1]!) ?? []).some((token) =>
        roundValue(token, /^[\d.]+px$/.test(token) ? size : Infinity, tokens, depth + 1)
      )
    )
  );
}

/**
 * The stylesheets and script modules the LEGO editor loads, found by following imports from `LegoStudio.tsx`:
 * relative ones and the workspace's packages through their `exports`. Type-only imports load nothing and are skipped.
 * Names are relative to the app's `src`, or to the repository for files outside it.
 */
function legoSources() {
  const packages = new Map(
    ['packages', 'apps'].flatMap((folder) =>
      readdirSync(path.join(repository, folder)).flatMap((name) => {
        const manifest = path.join(repository, folder, name, 'package.json');
        if (!existsSync(manifest)) {
          return [];
        }

        const json = JSON.parse(readFileSync(manifest, 'utf8')) as { name: string; exports?: Record<string, unknown> };
        return [[json.name, { folder: path.join(repository, folder, name), exports: json.exports ?? {} }] as const];
      })
    )
  );
  const resolve = (specifier: string, from: string) => {
    const bare = specifier.replace(/\?.*$/, '');
    if (bare.startsWith('.')) {
      return sourceFile(path.resolve(path.dirname(from), bare));
    }

    const [, name, rest] = /^(@[^/]+\/[^/]+|[^@/][^/]*)(\/.*)?$/.exec(bare) ?? [];
    const found = name === undefined ? undefined : packages.get(name);
    if (!found) {
      return undefined;
    }

    const key = `.${rest ?? ''}`;
    for (const [pattern, target] of Object.entries(found.exports)) {
      const [before, after = ''] = pattern.split('*');
      if (typeof target !== 'string') {
        continue;
      }

      if (pattern === key) {
        return sourceFile(path.join(found.folder, target));
      }

      if (pattern.includes('*') && key.startsWith(before!) && key.endsWith(after)) {
        return sourceFile(
          path.join(found.folder, target.replace('*', key.slice(before!.length, key.length - after.length)))
        );
      }
    }

    return sourceFile(path.join(found.folder, key === '.' ? 'src/index.ts' : key));
  };

  const seen = new Set<string>();
  const queue = [path.join(here, 'LegoStudio.tsx')];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }

    seen.add(file);
    if (file.endsWith('.css')) {
      continue;
    }

    const code = readFileSync(file, 'utf8').replace(/(?:import|export)\s+type\s[^;]*?from\s*['"][^'"]+['"]/g, '');
    for (const match of code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const target = resolve(match[1]!, file);
      if (target) {
        queue.push(target);
      }
    }
  }

  const named = (file: string) => ({
    name: path.relative(file.startsWith(source) ? source : repository, file),
    text: readFileSync(file, 'utf8')
  });
  return {
    stylesheets: [...seen].filter((file) => file.endsWith('.css')).map(named),
    modules: [...seen].filter((file) => !file.endsWith('.css')).map(named)
  };
}

/** The file `candidate` names, as written or as a module without its extension or as a folder's index. */
function sourceFile(candidate: string) {
  return ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
    .map((ending) => candidate + ending)
    .find((file) => existsSync(file) && statSync(file).isFile());
}

/** The text of the LEGO stylesheet `name`, read from disk. */
function stylesheet(name: string) {
  return readFileSync(path.join(here, `${name}.module.css`), 'utf8');
}

/** The folder of this test, beside the LEGO stylesheets; the app's sources and the repository above it. */
const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../..');
const repository = path.resolve(here, '../../../../..');
