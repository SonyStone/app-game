import type { PsdBlockInfo, PsdLayerDetail, PsdLayerPixels } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import { kindLabels, percent } from '../layers';
import type { LayerContents } from '../psd-worker';
import { formatBytes } from '../shared/format';
import { RgbaCanvas } from '../viewport';
import styles from './inspector.module.css';
import { Properties, rectText, yesNo } from './Properties';

/**
 * Everything about one layer: properties, its own pixels and masks, layer style with each effect's settings and why
 * the exact render refuses one, adjustment settings, text, smart-object placement and contents, renderer notes and
 * raw blocks.
 */
export function LayerInspector(props: { contents: LayerContents }) {
  const detail = () => props.contents.detail;
  const properties = () => detail().properties;
  return (
    <div class={styles.inspector} data-layer-detail={detail().index}>
      <h2 class={styles.title}>
        {detail().name || '(unnamed)'}{' '}
        <span>
          {kindLabels[detail().kind]} · record {detail().index}
        </span>
      </h2>
      <Show when={detail().notes.length}>
        <ul class={styles.notes}>
          <For each={detail().notes}>{(note) => <li>{note}</li>}</For>
        </ul>
      </Show>
      <Properties
        title="Properties"
        rows={[
          ['Blend mode', `${properties().blendMode} (${properties().blendKey})`],
          ['Opacity', percent(properties().opacity)],
          ['Fill', percent(properties().fill)],
          ['Visible', yesNo(properties().visible)],
          ['Clipped', yesNo(properties().clipped)],
          ['Lock transparency', yesNo(properties().transparencyLocked)],
          ['Knockout', properties().knockout],
          ['Bounds', rectText(properties().bounds)],
          ['Channels', properties().channels.join(', ')],
          ['Blend clipped as group', yesNo(properties().blendClippedAsGroup)],
          ['Blend interior as group', yesNo(properties().blendInteriorAsGroup)],
          ['Transparency shapes layer', yesNo(properties().transparencyShapesLayer)],
          [
            'Blend If',
            properties().blendIf
              ? properties()
                  .blendIf!.map((range) => `${range.source.join('/')} ↔ ${range.destination.join('/')}`)
                  .join('; ')
              : undefined
          ],
          ['Layer ID', properties().layerId?.toString()]
        ]}
      />
      <Show when={props.contents.pixels.ok ? props.contents.pixels.value : undefined}>
        {(pixels) => <PixelPreview pixels={pixels()} />}
      </Show>
      <MaskSection detail={detail()} />
      <EffectsSection detail={detail()} />
      <Show when={detail().adjustment}>
        {(adjustment) => (
          <Properties
            title={`Adjustment: ${adjustment().label}`}
            rows={[['Rendered', adjustment().supported ? 'yes' : 'no, left unchanged']]}
          >
            <pre class={styles.settings}>{adjustment().settings}</pre>
          </Properties>
        )}
      </Show>
      <TextSection detail={detail()} />
      <SmartObjectSection detail={detail()} />
      <BlocksSection title="Tagged blocks" blocks={detail().blocks} />
    </div>
  );
}

/** The layer's own pixels and mask channels on a checkerboard. */
function PixelPreview(props: { pixels: PsdLayerPixels }) {
  return (
    <section class={styles.section} aria-label="Layer pixels">
      <h3>Pixels</h3>
      <div class={styles.previews}>
        <Show when={props.pixels.width && props.pixels.height} fallback={<span class={styles.muted}>No pixels</span>}>
          <figure>
            <RgbaCanvas class={styles.preview} label="Layer pixels" image={props.pixels} />
            <figcaption>
              {props.pixels.width} × {props.pixels.height} at {props.pixels.left}, {props.pixels.top}
            </figcaption>
          </figure>
        </Show>
        <For each={props.pixels.masks.filter((mask) => mask.width && mask.height)}>
          {(mask) => (
            <figure>
              <RgbaCanvas class={styles.preview} label={`Mask ${mask.id}`} image={grayImage(mask)} />
              <figcaption>
                {mask.id === -3 ? 'Real mask' : 'Mask'} {mask.width} × {mask.height}
                {mask.disabled ? ' (disabled)' : ''}
              </figcaption>
            </figure>
          )}
        </For>
      </div>
    </section>
  );
}

function MaskSection(props: { detail: PsdLayerDetail }) {
  return (
    <>
      <Show when={props.detail.mask} keyed>
        {(value) => {
          if ('error' in value) {
            return <Properties title="Mask" rows={[['Error', value.error]]} />;
          }

          return (
            <Properties
              title="Mask"
              rows={[
                ['Rectangle', rectText(value.rect)],
                ['Default color', String(value.defaultColor)],
                ['Disabled', yesNo(value.disabled)],
                [
                  'Real mask',
                  value.real ? `${rectText(value.real.rect)}${value.real.disabled ? ', disabled' : ''}` : undefined
                ],
                ['User density', value.userDensity?.toString()],
                ['User feather', value.userFeather?.toString()],
                ['Vector density', value.vectorDensity?.toString()],
                ['Vector feather', value.vectorFeather?.toString()]
              ]}
            />
          );
        }}
      </Show>
      <Show when={props.detail.vectorMask}>
        {(path) => (
          <Properties
            title="Vector mask"
            rows={[
              ['Path records', String(path().records)],
              ['Disabled', yesNo(path().disabled)],
              ['Inverted', yesNo(path().inverted)],
              ['Unlinked', yesNo(path().unlinked)]
            ]}
          />
        )}
      </Show>
    </>
  );
}

function EffectsSection(props: { detail: PsdLayerDetail }) {
  return (
    <Show when={props.detail.effects} keyed>
      {(value) => {
        if ('error' in value) {
          return <Properties title="Layer style" rows={[['Error', value.error]]} />;
        }

        return (
          <Properties title={`Layer style (${value.key})`} rows={[['Effects visible', yesNo(value.visible)]]}>
            <For each={value.instances.filter((instance) => instance.present || instance.enabled)}>
              {(instance) => (
                <details class={styles.effect}>
                  <summary>
                    {instance.name}
                    <span>{instance.enabled ? 'on' : 'off'}</span>
                    <Show when={instance.unsupported}>
                      <span class={styles.warning}>not rendered exactly: {instance.unsupported}</span>
                    </Show>
                    <Show when={instance.needsNoise}>
                      <span class={styles.warning}>needs Photoshop's noise table</span>
                    </Show>
                    <Show when={instance.needsAngleTable}>
                      <span class={styles.warning}>needs Photoshop's angle table</span>
                    </Show>
                  </summary>
                  <pre class={styles.settings}>{instance.settings}</pre>
                </details>
              )}
            </For>
          </Properties>
        );
      }}
    </Show>
  );
}

function TextSection(props: { detail: PsdLayerDetail }) {
  return (
    <Show when={props.detail.text} keyed>
      {(value) => {
        if ('error' in value) {
          return <Properties title="Text" rows={[['Error', value.error]]} />;
        }

        return (
          <Properties
            title="Text"
            rows={[
              ['Anti-aliasing', value.antiAlias],
              ['Vertical', yesNo(value.vertical)],
              ['Warp', value.warp],
              ['Transform', value.transform.map((number) => +number.toFixed(3)).join(', ')],
              ['Fonts', value.fonts?.join(', ')],
              [
                'Style runs',
                value.styleRuns?.map((run) => `${run.length} × ${run.font ?? '?'} ${run.size ?? '?'} pt`).join('; ')
              ],
              ['Engine data', value.engineError]
            ]}
          >
            <Show when={value.text !== undefined}>
              <blockquote class={styles.text}>{value.text}</blockquote>
            </Show>
          </Properties>
        );
      }}
    </Show>
  );
}

function SmartObjectSection(props: { detail: PsdLayerDetail }) {
  return (
    <Show when={props.detail.smartObject} keyed>
      {(value) => {
        if ('error' in value) {
          return <Properties title="Smart object" rows={[['Error', value.error]]} />;
        }

        const file = value.linkedFile;
        return (
          <Properties
            title={`Smart object (${value.key})`}
            rows={[
              [
                'Contents',
                file
                  ? `${file.fileName} · ${file.fileType.trim()} · ${file.kind} · ${formatBytes(file.size)}`
                  : value.external
                    ? 'external'
                    : 'not found'
              ],
              ['Content size', value.size ? `${value.size.width} × ${value.size.height}` : undefined],
              ['Resolution', value.resolution?.toString()],
              ['Transform', value.transform?.map((number) => +number.toFixed(2)).join(', ')],
              ['Warp', value.warp],
              ['Page', value.page === undefined ? undefined : `${value.page} of ${value.totalPages ?? '?'}`],
              ['Content ID', value.contentId],
              [
                'Smart filters',
                value.filters
                  ? value.filters.filters
                      .map(
                        (filter) =>
                          `${filter.name}${filter.enabled ? '' : ' (off)'} ${Math.round(filter.opacity)}% ${filter.mode}`
                      )
                      .join('; ') || 'none'
                  : undefined
              ]
            ]}
          />
        );
      }}
    </Show>
  );
}

/** Tagged blocks with their keys and payload sizes. */
export function BlocksSection(props: { title: string; blocks: PsdBlockInfo[] }) {
  return (
    <section class={styles.section} aria-label={props.title}>
      <h3>{props.title}</h3>
      <ul class={styles.keys}>
        <For each={props.blocks}>
          {(block) => (
            <li title={`${block.signature} ${block.key}`}>
              <code>{block.key}</code> {block.layers ? `${block.size} records` : formatBytes(block.size)}
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

/** A mask plane as opaque gray RGBA. */
function grayImage(mask: PsdLayerPixels['masks'][number]) {
  const pixels = new Uint8Array(mask.values.length * 4);
  mask.values.forEach((value, index) => pixels.set([value, value, value, 255], index * 4));
  return { width: mask.width, height: mask.height, pixels };
}
