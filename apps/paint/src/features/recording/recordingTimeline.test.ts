import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('reads a recorded stroke command carrying a retired brush pressure curve', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paint-timeline-'));
  try {
    const event = {
      time: 0,
      kind: 'command',
      command: { type: 'begin', brush: { stroke: { minimum: 0.2, maximum: 0.6, firmness: 3 } } }
    };
    await writeFile(join(directory, 'recording.json'), JSON.stringify({ version: 1, events: [event] }));
    const script = fileURLToPath(new URL('../../../scripts/recording-timeline.mjs', import.meta.url));
    const output = execFileSync(process.execPath, [script, directory, '--events'], { encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual(event);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
