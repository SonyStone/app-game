/** Selects a downloaded Adobe fixture for browser diagnostics without cross-origin requests. */
export function selectBrushFile(filename: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.abr';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file?.name === filename) resolve(file);
      else reject(new Error(`Select ${filename}, downloaded from Adobe's Photoshop brushes page.`));
    }, { once: true });
    input.addEventListener('cancel', () => reject(new Error('Brush selection canceled.')), { once: true });
    input.click();
  });
}
