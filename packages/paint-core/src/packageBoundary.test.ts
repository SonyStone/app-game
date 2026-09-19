import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('keeps runtime imports inside the package and its declared dependencies', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const dependencies = new Set(Object.keys(manifest.dependencies));
  const src = resolve(root, 'src');
  for (const name of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    const file = resolve(src, name), text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith('.'))
        expect(resolve(dirname(file), specifier).startsWith(src + sep), `${name}: ${specifier}`).toBe(true);
      else {
        const parts = specifier.split('/');
        const dependency = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
        expect(dependencies.has(dependency), `${name}: undeclared dependency ${specifier}`).toBe(true);
      }
    }
  }
});
