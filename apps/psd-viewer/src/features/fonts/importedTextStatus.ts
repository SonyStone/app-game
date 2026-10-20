import type { PsdDocumentFonts } from '@app-game/psd/viewer';
import type { PsdResultOf, RenderedPixels } from '../psd-worker';

/**
 * Describes the current render's imported-text diagnostics without treating supplied fonts as proof of layout validity.
 * Hidden layers and saved previews make no path claim. Duplicate layer names conservatively share diagnostics because
 * the renderer identifies approximations by name. The full reasons remain in the existing approximation list.
 */
export function importedTextStatus(
  layer: PsdDocumentFonts['layers'][number],
  render: PsdResultOf<RenderedPixels> | undefined,
  visible: boolean | undefined,
  hasActiveFaces = false
): { kind: 'path' | 'approximate' | 'unrendered'; label: string; reason?: string } {
  if (!render?.ok || render.value.window?.source === 'savedComposite') {
    return { kind: 'unrendered', label: 'Awaiting layer render' };
  }

  const reasons = render.value.approximations.filter((text) => !text.startsWith('“') || text.startsWith(`“${layer.name}”:`));
  if (reasons.length || layer.error) {
    return { kind: 'approximate', label: 'Approximation', reason: reasons.join('\n') || layer.error };
  }

  if (visible === false) {
    return { kind: 'unrendered', label: 'Hidden' };
  }

  if (visible === undefined || render.value.window) {
    return { kind: 'unrendered', label: 'No approximation reported in view' };
  }

  if (!hasActiveFaces) {
    return { kind: 'unrendered', label: 'Font validation unavailable' };
  }

  return { kind: 'path', label: 'Photoshop path', reason: 'No approximation reported for this layer in the current render.' };
}
