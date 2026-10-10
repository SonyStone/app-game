import { NavigationPuck } from '@app-game/navigation-puck';
import type { JSX } from '@solidjs/web';
import { createSignal, For, Show, untrack } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import {
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays,
  type PaintSession
} from '../../features/session';
import styles from './FeatureDemo.module.css';

/**
 * The frame of a feature demo: the canvas and a card naming one feature, saying how to try it and holding only that
 * feature's controls (`children`), with undo, redo and Start over. Nothing else of the editor is on screen, so a
 * tester sees the feature and nothing to be distracted by. The card folds away to a button.
 */
export function FeatureDemo(props: {
  session: PaintSession;
  title: string;
  /** What the feature does, in one or two sentences. */
  summary: string;
  /** How to try it, one short instruction per step. */
  steps: string[];
  /** Restores the demo's starting drawing; see `createDemoStart`. */
  onReset: () => void;
  /** Link back to the embedding playground, if any. */
  experimentsHref?: string;
  children: JSX.Element;
}) {
  const session = untrack(() => props.session);
  const { camera, engine, ready } = session;
  const [folded, setFolded] = createSignal(false);
  session.createShortcuts({ closePanel: () => false });

  return (
    <PaintEditor session={session} class={styles.demo}>
      <PaintStage session={session}>
        <StageGuides session={session} />
        <StageOverlays session={session} />
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div class={styles.ui}>
        <SessionNotices session={session} />
        <Show
          when={!folded()}
          fallback={
            <button class={styles.unfold} aria-label={`Show the ${props.title} demo card`} onClick={() => setFolded(false)}>
              {props.title}
            </button>
          }
        >
          <section class={styles.card} aria-label={`${props.title} demo`}>
            <header>
              <Show when={props.experimentsHref}>
                {(href) => (
                  <a href={href()} aria-label="Back to experiments" title="Back to experiments">
                    <SketchIcon name="undo" size={16} />
                  </a>
                )}
              </Show>
              <h1>{props.title}</h1>
              <button aria-label="Hide card" title="Hide card" onClick={() => setFolded(true)}>
                <SketchIcon name="close" size={16} />
              </button>
            </header>
            <p>{props.summary}</p>
            <ol>
              <For each={props.steps}>{(step) => <li>{step}</li>}</For>
            </ol>
            <div class={styles.controls}>{props.children}</div>
            <footer>
              <button
                aria-label="Undo"
                title="Undo"
                disabled={!engine.state().canUndo || !ready()}
                onClick={session.undo}
              >
                <SketchIcon name="undo" size={18} />
              </button>
              <button
                class={styles.redo}
                aria-label="Redo"
                title="Redo"
                disabled={!engine.state().canRedo || !ready()}
                onClick={session.redo}
              >
                <SketchIcon name="undo" size={18} />
              </button>
              <button class={styles.reset} disabled={!ready()} onClick={() => props.onReset()}>
                Start over
              </button>
            </footer>
          </section>
        </Show>
      </div>
    </PaintEditor>
  );
}
