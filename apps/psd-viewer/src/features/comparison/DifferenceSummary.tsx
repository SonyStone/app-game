import type { PsdDifference } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import { formatCount } from '../shared/format';
import styles from './comparison.module.css';

/**
 * Mismatch statistics of a difference: differing samples and pixels, the largest difference in its unit, the
 * smallest differences' counts, and the heat map's color scale.
 */
export function DifferenceSummary(props: { difference: PsdDifference }) {
  const exact = () => props.difference.differingSamples === 0;
  return (
    <section
      class={[styles.summary, { [styles.exact]: exact() }]}
      aria-label="Difference statistics"
      data-mismatches={props.difference.differingSamples}
    >
      <strong>
        {exact()
          ? `Exact: 0 of ${formatCount(props.difference.samples)} samples differ`
          : `${formatCount(props.difference.differingSamples)} of ${formatCount(props.difference.samples)} samples differ`}
      </strong>
      <span>
        {formatCount(props.difference.differingPixels)} pixels · max {formatCount(props.difference.max)}{' '}
        {props.difference.unit}
        {props.difference.max === 1 ? '' : 's'}
        <Show when={props.difference.alphaDiffering}> · alpha {formatCount(props.difference.alphaDiffering)}</Show>
      </span>
      <Show when={props.difference.unit === 'sRGB level'}>
        <span>Approximate color mode: compared after converting both images to sRGB.</span>
      </Show>
      <Show when={props.difference.unit === '8-bit level'}>
        <span>Approximate render at 8 bits: compared with the merged image reduced to 8 bits.</span>
      </Show>
      <Show when={channelSpace(props.difference.unit)}>
        {(space) => (
          <span>
            Compared in the document's {space()} channels, as Photoshop saves them; only the views convert to sRGB.
          </span>
        )}
      </Show>
      <Show when={!exact()}>
        <span class={styles.histogram}>
          <For each={props.difference.histogram.slice(0, 6)}>
            {(bucket) => (
              <span>
                ±{bucket.difference}: {formatCount(bucket.samples)}
              </span>
            )}
          </For>
        </span>
        <span class={styles.scale} aria-hidden="true">
          <span>1</span>
          <i />
          <span>max</span>
        </span>
      </Show>
    </section>
  );
}

/** The color space whose own channels a difference counts levels of: CMYK and Lab, `undefined` for other units. */
function channelSpace(unit: PsdDifference['unit']) {
  if (unit.includes('CMYK')) {
    return 'CMYK';
  }

  return unit.includes('Lab') ? 'Lab' : undefined;
}
