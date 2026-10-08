import type { PsdInfo } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import { formatBytes } from '../shared/format';
import styles from './inspector.module.css';
import { BlocksSection } from './LayerInspector';
import { Properties, yesNo } from './Properties';

/** The document: header, merged image storage, image resources and document-level tagged blocks. */
export function DocumentInspector(props: { info: PsdInfo; name: string }) {
  const merged = () => props.info.mergedImage;
  return (
    <div class={styles.inspector}>
      <h2 class={styles.title}>
        {props.name} <span>{props.info.psb ? 'PSB' : 'PSD'}</span>
      </h2>
      <Show when={props.info.notes.length}>
        <ul class={styles.notes}>
          <For each={props.info.notes}>{(note) => <li>{note}</li>}</For>
        </ul>
      </Show>
      <Properties
        title="Document"
        rows={[
          ['Size', `${props.info.width} × ${props.info.height}`],
          ['Mode', `${props.info.modeName} (${props.info.mode})`],
          ['Depth', `${props.info.depth} bits`],
          ['Channels', String(props.info.channels)],
          [
            'Layer records',
            `${props.info.layerRecords} (${props.info.groups} groups) from the ${props.info.layerSource}`
          ],
          ['Color mode data', props.info.colorModeDataSize ? formatBytes(props.info.colorModeDataSize) : undefined],
          ['Global mask', props.info.globalMaskSize ? formatBytes(props.info.globalMaskSize) : undefined],
          [
            'Merged image',
            merged()
              ? `${merged()!.compression}, ${formatBytes(merged()!.size)}${merged()!.alpha ? ', alpha' : ''}${merged()!.matte ? ', matted on white' : ''}`
              : 'none (saved without Maximize Compatibility)'
          ],
          ['Merged transparency', yesNo(props.info.mergedTransparency)]
        ]}
      />
      <section class={styles.section} aria-label="Image resources">
        <h3>Image resources ({props.info.resources.length})</h3>
        <table class={styles.table}>
          <tbody>
            <For each={props.info.resources}>
              {(resource) => (
                <tr>
                  <td>{resource.id}</td>
                  <td>{resource.label || resource.name || '—'}</td>
                  <td>{formatBytes(resource.size)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>
      <BlocksSection title="Document blocks" blocks={props.info.blocks} />
    </div>
  );
}
