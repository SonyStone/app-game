import { createEffect, type Accessor } from 'solid-js';

import { objectStore, request } from '../../editor/idb';
import type { AppSettings } from '../../editor/types';

/** GodSVG's font roles; each replaces one of the interface's font faces. */
export type FontRole = keyof AppSettings['fonts'];

/**
 * GodSVG's custom fonts: a font file chosen for a role is stored in IndexedDB and registered under the family and
 * weight the interface already uses, so it takes over without restyling (faces added to `document.fonts` come after
 * the stylesheet's and win). `fonts` names the chosen files; a role without one uses the bundled font.
 */
export function createCustomFonts(fonts: Accessor<AppSettings['fonts']>) {
  const faces = new Map<FontRole, FontFace>();

  createEffect(
    () => ({ ...fonts() }),
    (current) => {
      for (const role of Object.keys(fontFaces) as FontRole[]) {
        if (!current[role]) {
          remove(role);
        } else if (!faces.has(role)) {
          void load(role);
        }
      }
    }
  );

  async function load(role: FontRole): Promise<void> {
    try {
      const data: unknown = await request((await objectStore('fonts', 'readonly')).get(role));

      if (data instanceof ArrayBuffer) {
        await register(role, data);
      }
    } catch {
      // Missing or unreadable font: the bundled one stays.
    }
  }

  async function register(role: FontRole, data: ArrayBuffer): Promise<void> {
    const face = new FontFace(fontFaces[role].family, data, { weight: fontFaces[role].weight });
    await face.load();
    remove(role);
    document.fonts.add(face);
    faces.set(role, face);
  }

  function remove(role: FontRole): void {
    const face = faces.get(role);

    if (face) {
      document.fonts.delete(face);
      faces.delete(role);
    }
  }

  /** Stores a font file for a role and applies it; rejects for files the browser can't read as a font. */
  async function chooseFont(role: FontRole, file: File): Promise<void> {
    const data = await file.arrayBuffer();
    await register(role, data);
    await request((await objectStore('fonts', 'readwrite')).put(data, role));
  }

  /** Forgets a role's font file; the bundled font returns once the setting is cleared. */
  async function resetFont(role: FontRole): Promise<void> {
    remove(role);
    await request((await objectStore('fonts', 'readwrite')).delete(role)).catch(() => undefined);
  }

  return { chooseFont, resetFont };
}

/** The faces each role replaces: GodSVG Sans (regular and bold) and GodSVG Mono. */
const fontFaces = {
  main: { family: 'GodSVG Sans', weight: '100 650' },
  bold: { family: 'GodSVG Sans', weight: '651 1000' },
  mono: { family: 'GodSVG Mono', weight: '100 1000' }
} as const satisfies Record<FontRole, { readonly family: string; readonly weight: string }>;
