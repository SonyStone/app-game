import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';

/** Validated, versioned inspector preference. Unavailable storage falls back to memory. */
export function createInspectorSetting<T>(scope: string, name: string, initial: T, valid: (value: unknown) => boolean) {
  // Solid's value overload excludes Function; a computed initializer would overwrite restored values.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return makePersisted(createSignal<T>(initial as Exclude<T, Function>, { ownedWrite: true }), {
    name: `motion-inspector:v1:${encodeURIComponent(scope)}:${name}`,
    storage: {
      getItem(key: string) { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
      setItem(key: string, value: string) { try { globalThis.localStorage?.setItem(key, value); } catch { /* Keep the in-memory preference. */ } },
      removeItem(key: string) { try { globalThis.localStorage?.removeItem(key); } catch { /* Storage can be disabled. */ } }
    },
    deserialize(raw) {
      try { const value: unknown = JSON.parse(raw); return valid(value) ? value as T : initial; }
      catch { return initial; }
    }
  });
}

/** Independent overlay visibility for a stable element key; null enables the default track. */
export type MotionSelection = Record<string, { visible?: boolean; onion: boolean; trajectory: boolean }> | null;

/** Reject malformed persisted selections before they reach the renderer. */
export function validMotionSelection(value: unknown): value is MotionSelection {
  return value === null || (typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length <= 512 && Object.values(value).every(item =>
      item && typeof item === 'object' && typeof item.onion === 'boolean' && typeof item.trajectory === 'boolean' &&
      (item.visible === undefined || typeof item.visible === 'boolean')));
}

/** Older saved choices showed the current pose whenever either overlay was enabled. */
export function resolveElementLayers(choice?: NonNullable<MotionSelection>[string]) {
  return { visible: choice?.visible ?? !!(choice?.onion || choice?.trajectory), onion: !!choice?.onion, trajectory: !!choice?.trajectory };
}
