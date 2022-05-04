import { ChildProcess } from 'child_process';

export function wait(p: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    p.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const args = p.spawnargs.join(' ');
        reject(
          new Error(`Command \`${args}\` failed with error code: ${code}`)
        );
      }
    });

    p.on('error', reject);
  });
}
