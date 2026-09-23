import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

/** Keeps redistribution notices beside the generated WASM, including Hayro's bundled font assets. */
export function writeWasmNotices(crate, output) {
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        '+1.92.0',
        'metadata',
        '--manifest-path',
        `${crate}/Cargo.toml`,
        '--locked',
        '--all-features',
        '--format-version',
        '1'
      ],
      { encoding: 'utf8' }
    )
  );
  const entries = metadata.packages
    .filter((pkg) => pkg.source || pkg.manifest_path.includes('/vendor/'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const text = [
    'Third-party notices for the Rust/WASM document tools.\nIncludes locked dependencies and their build tools; not every dependency is present in each binary.\n'
  ];

  for (const pkg of entries) {
    const root = dirname(pkg.manifest_path);
    text.push(`\n=== ${pkg.name} ${pkg.version} (${pkg.license ?? 'see license text'}) ===\n${pkg.repository ?? ''}\n`);

    for (const file of licenseFiles(root)) {
      text.push(`\n--- ${relative(root, file)} ---\n${readFileSync(file, 'utf8')}\n`);
    }
  }

  writeFileSync(output, text.join(''));
}

function licenseFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;

      if (entry.isDirectory()) {
        return licenseFiles(path);
      }

      return /(?:license|licence|copying|notice)/i.test(entry.name) && !/\.(rs|png|jpg)$/i.test(entry.name)
        ? [path]
        : [];
    })
    .sort();
}
