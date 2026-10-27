import { createSignal } from 'solid-js';
import type { CompositeDiagnostics } from './makeCompositePreviews';

/** Shows the latest byte disagreement without exposing the full tile/settings identity in the inspector. */
export function CompositeMismatch(props: {
  mismatch: CompositeDiagnostics['mismatches'][number];
  details: CompositeDiagnostics;
}) {
  const [copyStatus, setCopyStatus] = createSignal('');
  const pixel = () => Math.floor(props.mismatch.first / 4);
  const channel = () => ['R', 'G', 'B', 'A'][props.mismatch.first % 4] ?? 'unknown';

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(props.details, null, 2));
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed. Try again.');
    }
  }

  return (
    <div aria-label="GPU mismatch summary">
      <p>
        Tile {props.mismatch.tile.left}, {props.mismatch.tile.top} · {props.mismatch.tile.width} ×{' '}
        {props.mismatch.tile.height}
      </p>
      <p>{props.mismatch.differing} differing RGBA samples</p>
      <p>
        First difference at {props.mismatch.tile.left + (pixel() % props.mismatch.tile.width)},{' '}
        {props.mismatch.tile.top + Math.floor(pixel() / props.mismatch.tile.width)} · {channel()}: GPU{' '}
        {props.mismatch.gpu}, strict {props.mismatch.strict}
      </p>
      <button type="button" onClick={() => void copy()}>
        Copy details
      </button>
      <span role="status">{copyStatus()}</span>
    </div>
  );
}
