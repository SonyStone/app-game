import { createSignal, For } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';
import styles from './Styles.module.css';

/**
 * Styles: one small set of controls (an icon button, a number button, tabs and a small panel) in several visual
 * styles over the same painting, so that only the style differs. These are style studies, not Paint components: a
 * chosen style is applied to the real components afterwards.
 */
export function Styles() {
  return (
    <CanvasGroup
      id="styles"
      title="Styles"
      omitted={
        <>
          The painting behind each set shows what glass does over artwork; the controls work but change nothing else.
        </>
      }
    >
      <CanvasRow title="One set, four styles" note="over the same painting">
        <For each={looks}>
          {(look) => (
            <Specimen id={`styles/set/${look.id}`} label={look.label}>
              <div class={styles.painting}>
                <StyleSet look={look.id} />
              </div>
            </Specimen>
          )}
        </For>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** The controls of the set in `look`; the icon button toggles and the tabs switch, each set on its own. */
function StyleSet(props: { look: Look }) {
  const [pressed, setPressed] = createSignal(true);
  const [tab, setTab] = createSignal<(typeof tabs)[number]>('Brush');

  return (
    <div class={[styles.set, styles[props.look]]}>
      <div class={styles.line}>
        <button
          class={styles.iconButton}
          aria-label="Brush"
          aria-pressed={pressed() ? 'true' : 'false'}
          onClick={() => setPressed((value) => !value)}
        >
          <SketchIcon name="draw" size={22} />
        </button>
        <button class={styles.valueButton} aria-label="Size, 12 px">
          <small>Size</small>
          <b>
            12<small>px</small>
          </b>
        </button>
      </div>
      <div class={styles.tabs} role="tablist" aria-label="Panels">
        <For each={tabs}>
          {(name) => (
            <button role="tab" aria-selected={tab() === name ? 'true' : 'false'} onClick={() => setTab(name)}>
              {name}
            </button>
          )}
        </For>
      </div>
      <section class={styles.panel} aria-label="Layer">
        <h4>Ink</h4>
        <div class={styles.panelRow}>
          <span>Opacity</span>
          <b>100 %</b>
        </div>
        <div class={styles.panelRow}>
          <span>Blend</span>
          <b>Normal</b>
        </div>
      </section>
    </div>
  );
}

/** The styles compared: Paint's neutral greys, frosted glass, flat fills and outlines. */
const looks = [
  { id: 'neutral', label: 'Neutral (Paint today)' },
  { id: 'glass', label: 'Glass' },
  { id: 'flat', label: 'Flat' },
  { id: 'outline', label: 'Outline' }
] as const;

type Look = (typeof looks)[number]['id'];

const tabs = ['Brush', 'Color', 'Layers'] as const;
