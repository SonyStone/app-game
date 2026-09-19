import { createRoot, createSignal, onCleanup } from 'solid-js';
import { createPropsProxy } from '../src/index';

/** Controls exposed only to the browser integration test. */
export let controls: ReturnType<typeof createControls>;

/** SSR fixture with an owned overlay and a later sibling to catch hydration key drift. */
export function App() {
  const [target, setTarget] = createSignal<HTMLButtonElement>();
  const [base, setBase] = createSignal('black');
  const [overlay, setOverlay] = createSignal('red');
  const calls: string[] = [];
  const release = createRoot((dispose) => {
    createPropsProxy(target, {
      get style() {
        return { color: overlay() };
      },
      onClick: () => calls.push('proxy')
    });
    return dispose;
  });
  onCleanup(release);
  controls = createControls(setBase, setOverlay, release, calls);
  return (
    <>
      <button id="target" ref={setTarget} style={{ color: base() }} onClick={() => calls.push('base')}>
        Target
      </button>
      <span id="marker">After proxy</span>
    </>
  );
}

/** Keeps the fixture's control type derived from its actual values. */
function createControls(
  setBase: (value: string) => unknown,
  setOverlay: (value: string) => unknown,
  release: () => void,
  calls: string[]
) {
  return { setBase, setOverlay, release, calls };
}
