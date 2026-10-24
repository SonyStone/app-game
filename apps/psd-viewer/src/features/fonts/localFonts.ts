import { fontFileFaces } from '@app-game/psd/fontFile';

/**
 * Whether the browser offers the Local Font Access API (`window.queryLocalFonts`, Chromium-based browsers in secure
 * contexts). Checked once at module load; `false` outside browsers.
 */
export const localFontAccess = typeof window !== 'undefined' && typeof localFontWindow().queryLocalFonts === 'function';

/**
 * The installed fonts of the given PostScript names, each as a file of its bytes named after the font. Call it in a
 * click handler before awaiting anything: the browser requires the user's activation and asks for permission on first
 * use, rejecting with a `NotAllowedError` when it is refused. Names that are not installed are left out. Collection
 * bytes stay intact so each face retains its original index. The filtered query is not a complete active-font inventory.
 */
export async function installedFonts(postscriptNames: readonly string[]): Promise<{ name: string; file: File }[]> {
  const query = localFontWindow().queryLocalFonts;
  if (!query) {
    throw new Error('this browser does not offer the Local Font Access API; choose font files instead');
  }

  const fonts = await query.call(window, { postscriptNames: [...postscriptNames] });
  return Promise.all(
    fonts.map(async (font) => {
      const blob = await font.blob();
      const faces = fontFileFaces(new Uint8Array(await blob.arrayBuffer()));
      if (!faces.some((face) => face.name === font.postscriptName)) {
        throw new Error(`installed font identity mismatch: ${font.postscriptName} is absent from the supplied file`);
      }

      return {
        name: font.postscriptName,
        file: new File([blob], `${font.fullName || font.postscriptName} (installed)`)
      };
    })
  );
}

/** The parts of the Local Font Access API used here, which TypeScript's DOM library does not declare yet. */
type LocalFontWindow = {
  queryLocalFonts?: (options?: {
    postscriptNames?: string[];
  }) => Promise<{ postscriptName: string; fullName: string; blob(): Promise<Blob> }[]>;
};

/** Browser API access without extending the global DOM declarations. */
function localFontWindow(): LocalFontWindow {
  return window as unknown as LocalFontWindow;
}
