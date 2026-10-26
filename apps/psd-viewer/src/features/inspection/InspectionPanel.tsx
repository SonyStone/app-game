import type { PsdPathSummary, PsdSavedProcessChannels } from '@app-game/psd/viewer';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { DisplayImage } from '../gpu-viewport/displayTiles';
import type { PsdResultOf } from '../psd-worker';
import { RgbaCanvas } from '../viewport';
import { channelImage, displayPixel, nativeSample } from './pixels';

/** Explicit on-demand saved-channel inspection; native samples never masquerade as the current render. */
export function InspectionPanel(props: {
  image: DisplayImage | undefined;
  point: { x: number; y: number } | undefined;
  channels: PsdResultOf<PsdSavedProcessChannels> | undefined;
  paths: PsdResultOf<PsdPathSummary[]> | undefined;
  onChannels: () => void;
  onPaths: () => void;
  onLayer: (index: number) => void;
  maskMode: string;
  onMaskMode: (mode: 'off' | 'overlay' | 'only') => void;
  hasMask: boolean;
  maskIndex: number;
  masks: readonly { id: number; disabled: boolean }[];
  onMaskIndex: (index: number) => void;
}) {
  const [plane, setPlane] = createSignal(0);
  const channels = () => (props.channels?.ok ? props.channels.value : undefined);
  const preview = createMemo(() => (channels() ? channelImage(channels()!, plane()) : undefined));
  const rgba = () => (props.image && props.point ? displayPixel(props.image, props.point.x, props.point.y) : undefined);
  return (
    <details
      style={{
        padding: '8px 10px',
        'border-bottom': '1px solid #171717',
        'max-height': '32vh',
        overflow: 'auto',
        'flex-shrink': 0
      }}
    >
      <summary>Pixel, masks, channels and paths</summary>
      <p role="status" aria-label="Pixel inspection">
        {props.point
          ? `${props.point.x}, ${props.point.y}: RGBA ${rgba()?.rgba.join(', ') ?? 'unavailable coverage'} · display RGB8${rgba()?.step !== 1 ? ` · stride ${rgba()?.step ?? 'unknown'}` : ''}`
          : 'Move over the canvas to inspect display RGB8.'}
      </p>
      <label>
        Selected saved mask{' '}
        <select
          aria-label="Selected saved mask"
          disabled={!props.masks.length}
          value={props.maskIndex}
          onChange={(event) => props.onMaskIndex(Number(event.currentTarget.value))}
        >
          <For each={props.masks}>
            {(mask, index) => (
              <option value={index()}>
                {mask.id === -3 ? 'Real raster mask' : 'User mask'}
                {mask.disabled ? ' · disabled' : ''}
              </option>
            )}
          </For>
        </select>
      </label>
      <label>
        Mask view{' '}
        <select
          aria-label="Mask view"
          value={props.maskMode}
          disabled={!props.hasMask}
          onChange={(event) => props.onMaskMode(event.currentTarget.value as 'off' | 'overlay' | 'only')}
        >
          <option value="off">Off</option>
          <option value="overlay">Red overlay</option>
          <option value="only">Mask only</option>
        </select>
      </label>
      <p>Mask source: saved layer channel, display RGB8. Comp/frame transforms are not applied.</p>
      <button onClick={props.onChannels}>Load saved channels</button>
      <Show when={props.channels && !props.channels.ok ? props.channels.error.message : undefined}>
        {(error) => <p role="alert">{error()}</p>}
      </Show>
      <Show when={channels()}>
        {(saved) => (
          <>
            <p>Saved native planes, {saved().depth}-bit. May be stale; independent of current state and visibility.</p>
            <select
              aria-label="Saved channel"
              value={plane()}
              onChange={(event) => setPlane(Number(event.currentTarget.value))}
            >
              <For each={saved().planes}>
                {(channel, index) => (
                  <option value={index()}>
                    {channel.name || `Channel ${channel.index}`} · {channel.role}
                  </option>
                )}
              </For>
            </select>
            <Show when={preview()}>
              {(image) => (
                <RgbaCanvas
                  image={image()}
                  label="Saved channel preview"
                  style={{ width: '100%', 'max-height': '160px', 'object-fit': 'contain' }}
                />
              )}
            </Show>
            <p aria-label="Saved native sample">
              Saved native value:{' '}
              {props.point
                ? String(nativeSample(saved(), plane(), props.point.x, props.point.y) ?? 'outside')
                : 'move over canvas'}
              .{' '}
              {saved().depth === 32
                ? 'Float32, original units'
                : saved().depth === 16
                  ? '16-bit wire levels'
                  : 'Stored levels'}
            </p>
          </>
        )}
      </Show>
      <button onClick={props.onPaths}>List saved paths</button>
      <Show when={props.paths?.ok ? props.paths.value : undefined}>
        {(paths) => (
          <>
            <ul>
              <For each={paths()}>
                {(path) => (
                  <li>
                    {path.name} · {path.source}
                    {path.disabled ? ' · disabled' : ''}
                    <Show when={path.layerIndex !== undefined}>
                      <button onClick={() => props.onLayer(path.layerIndex!)}>Select path layer</button>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
            <p>{paths().length} saved paths. Geometry overlay requires a typed psd-rs/WASM geometry query.</p>
          </>
        )}
      </Show>
      <Show when={props.paths && !props.paths.ok ? props.paths.error.message : undefined}>
        {(error) => <p role="alert">{error()}</p>}
      </Show>
    </details>
  );
}
