import type { PsdNativeRegion, PsdNativeRender } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import type { PsdResultOf } from '../psd-worker';
import { wireSample } from '../psd-worker/nativePixels';

/** On-demand one-pixel comparison, preserving native units and explicit saved/current provenance. */
export function NativeInspection(props: {
  result: PsdResultOf<{ saved: PsdResultOf<PsdNativeRegion>; current: PsdResultOf<PsdNativeRender> }> | undefined;
  onInspect: () => void;
}) {
  const result = () => (props.result?.ok ? props.result.value : undefined);
  const current = () => {
    const value = result()?.current;
    return value?.ok ? value.value : undefined;
  };
  const currentFailure = () => {
    const value = result()?.current;
    return value && !value.ok ? value.error : undefined;
  };
  const savedFailure = () => {
    const value = result()?.saved;
    return value && !value.ok ? value.error : undefined;
  };
  const saved = () => {
    const value = result()?.saved;
    return value?.ok ? value.value : undefined;
  };
  const values = () => {
    const image = current();
    if (!image) {
      return [];
    }
    return Array.from(
      image.encoding === 'rgba-f32-bits'
        ? new Float32Array(image.samples.buffer, image.samples.byteOffset, image.samples.length)
        : image.samples
    );
  };
  return (
    <details style={{ padding: '8px 10px' }}>
      <summary>Native pixel comparison</summary>
      <button onClick={props.onInspect}>Inspect native pixel at pointer</button>
      <Show when={current()}>
        {(image) => (
          <p aria-label="Current native sample">
            Current {image().left}, {image().top}: {values().join(', ')} · {image().encoding}.{' '}
            {image().depth === 16
              ? 'Internal levels 0–32768.'
              : image().depth === 32
                ? 'Float32 original units; no RGB8 conversion.'
                : 'Native channel levels.'}
          </p>
        )}
      </Show>
      <Show when={saved()}>
        {(region) => (
          <p aria-label="Comparison saved native sample">
            Saved original wire samples:{' '}
            <For each={region().planes}>
              {(plane) => `${plane.id}: ${wireSample(region(), plane.id, plane.left, plane.top)}; `}
            </For>{' '}
            · {region().depth}-bit. May be stale; saved matte retained.
          </p>
        )}
      </Show>
      <Show when={current() && saved() && [1, 3].includes(saved()!.mode)}>
        <p aria-label="Native sample deltas">
          Current minus saved native color levels: {nativeDeltas(current()!, saved()!).join(', ')}. Saved matte can
          affect these deltas; this compares the chosen state with the saved snapshot.
        </p>
      </Show>
      <Show when={savedFailure()}>
        {(failure) => (
          <p role="note">
            Saved {failure().kind}: {failure().message}
          </p>
        )}
      </Show>
      <Show when={currentFailure()}>
        {(failure) => (
          <p role="note">
            {failure().kind}: {failure().message}
          </p>
        )}
      </Show>
      <Show when={props.result && !props.result.ok ? props.result.error.message : undefined}>
        {(message) => <p role="alert">{message()}</p>}
      </Show>
    </details>
  );
}

/** RGB/Gray deltas use internal 16-bit units and linear floats, preserving all native precision. */
export function nativeDeltas(current: PsdNativeRender, saved: PsdNativeRegion): number[] {
  const values =
    current.encoding === 'rgba-f32-bits'
      ? new Float32Array(current.samples.buffer, current.samples.byteOffset, current.samples.length)
      : current.samples;
  const channels = saved.mode === 1 ? 1 : 3;
  return Array.from({ length: channels }, (_, id) => {
    const sample = wireSample(saved, id, current.left, current.top) ?? NaN;
    return values[id]! - (saved.depth === 16 ? Math.round((sample * 32768) / 65535) : sample);
  });
}
