import type { createCmykProfile } from '@app-game/chroma/io/cmyk/cmykProfile';
import { createSignal, onCleanup } from 'solid-js';

/** Owns one optional CMYK profile per editor. Failed replacements retain the previous profile.
 * Late loads cannot overwrite a newer selection or publish after the editor is disposed.
 */
export function createColorProfile(
  load = async (bytes: Uint8Array) => {
    const { createBrowserCmykProfile } = await import('@app-game/chroma/io/cmyk/browser');
    return createBrowserCmykProfile(bytes);
  }
) {
  type Profile = Awaited<ReturnType<typeof createCmykProfile>>;
  const [profile, setProfile] = createSignal<Profile>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  let current: Profile | undefined;
  let generation = 0;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    generation++;
    current?.dispose();
  });
  return {
    profile,
    loading,
    error,
    /** The accessor, not the returned converter, must be tracked to follow profile replacement. */
    converter: () => profile()?.convert,
    async select(file: Pick<File, 'size' | 'arrayBuffer'>) {
      if (disposed) return;
      const request = ++generation;
      setLoading(true);
      setError('');
      try {
        if (file.size > 16 * 1024 * 1024) throw new Error('Choose a CMYK ICC profile up to 16 MiB.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (disposed || request !== generation) return;
        const next = await load(bytes);
        if (disposed || request !== generation) {
          next.dispose();
          return;
        }
        const previous = current;
        current = next;
        setProfile(next);
        previous?.dispose();
      } catch (cause: unknown) {
        if (!disposed && request === generation)
          setError(cause instanceof Error ? cause.message : 'Could not open the CMYK profile.');
      } finally {
        if (!disposed && request === generation) setLoading(false);
      }
    },
    clear() {
      if (disposed) return;
      generation++;
      current?.dispose();
      current = undefined;
      setProfile(undefined);
      setLoading(false);
      setError('');
    }
  };
}
