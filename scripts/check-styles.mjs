import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preprocessCSS, resolveConfig } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
// Use the same parser as Vite's CSS compiler, including its selector handling.
const postcss = createRequire(import.meta.resolve('vite'))('postcss');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps', 'packages'], {
  cwd: root,
  encoding: 'utf8'
})
  .trim()
  .split('\n');
const config = await resolveConfig(
  {
    configFile: false,
    root,
    logLevel: 'error',
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: [path.join(root, 'node_modules')],
          silenceDeprecations: ['import', 'global-builtin', 'color-functions']
        }
      }
    }
  },
  'build'
);
const failures = [];
let checked = 0;
const compiledModules = [];
const localNames = new Set();

for (const file of new Set(files.filter((file) => /\.(css|scss)$/.test(file)))) {
  const filename = path.join(root, file);
  const source = await readFile(filename, 'utf8').catch(() => undefined);
  if (source === undefined) continue;
  // These contain build directives or Sass mixins, not application selectors.
  if (file === 'apps/ogl-playground/src/utilities.css' || file === 'packages/lil-gui/hover.scss') continue;
  if (!/\.module\.(css|scss)$/.test(file)) {
    failures.push(`${file}: application styles must use CSS Modules`);
    continue;
  }

  // Ignore Sass line comments while checking the source before preprocessing hoists media queries.
  const parsedSource = postcss.parse(source.replace(/^[ \t]*\/\/[^\r\n]*/gm, ''));
  parsedSource.walkAtRules('media', (media) => {
    let parent = media.parent;
    while (parent && parent.type !== 'rule') parent = parent.parent;
    if (!parent) failures.push(`${file}: @media ${media.params} must be nested inside its selector`);
  });

  const { code, modules = {} } = await preprocessCSS(source, filename, config);
  for (const [key, name] of Object.entries(modules)) {
    localNames.add(name);
    // Animation names are also exported; only class names follow the component naming convention.
    if (code.includes(`.${name}`) && !/^[a-z][a-zA-Z0-9]*$/.test(key)) {
      failures.push(`${file}: CSS Module class ${key} must use camelCase`);
    }
  }
  compiledModules.push({ file, code });
  checked++;
}

// @value imports include the referenced module's CSS, so validate against all compiled exports.
for (const { file, code } of compiledModules) {
  postcss.parse(code).walkRules((rule) => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    for (const selector of rule.selectors) {
      const hasLocalClass = (value) =>
        [...localNames].some((name) => value.includes(`.${name}`) || value.includes(`#${name}`));
      let anchored = hasLocalClass(selector);
      // Native CSS nesting keeps descendant rules scoped by their local ancestor selector.
      for (let parent = rule.parent; !anchored && parent; parent = parent.parent) {
        if (parent.type === 'rule') anchored = parent.selectors.every(hasLocalClass);
      }
      if (!anchored) {
        failures.push(`${file}: unscoped selector ${selector}`);
      }
    }
  });
}

// Document resets may be shared by entrypoints; component styles have one owner.
const componentOwners = new Map();
for (const file of files.filter(
  (file) => /\.[jt]sx$/.test(file) && !/\.(test|spec)\.|\/(test|tests|__tests__)\//.test(file)
)) {
  const source = await readFile(path.join(root, file), 'utf8').catch(() => '');
  for (const match of source.matchAll(/import\s+\w+\s+from\s+['"]([^'"]+\.module\.(?:css|scss))['"]/g)) {
    const stylesheet = path.normalize(path.join(path.dirname(file), match[1]));
    if (stylesheet === 'packages/styles/reset.module.css') continue;
    const owners = componentOwners.get(stylesheet) ?? new Set();
    owners.add(file);
    componentOwners.set(stylesheet, owners);
  }
}
for (const [stylesheet, owners] of componentOwners) {
  if (owners.size > 1) {
    failures.push(`${stylesheet}: each component must own its CSS Module; shared by ${[...owners].join(', ')}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${checked} CSS Modules: classes use camelCase, selectors are local, media queries are nested, and component modules have one owner.`
  );
}
