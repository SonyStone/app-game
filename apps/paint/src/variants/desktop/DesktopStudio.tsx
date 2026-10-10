import { NavigationPuck } from '@app-game/navigation-puck';
import { Show } from 'solid-js';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import type { PaintVariantProps } from '..';
import styles from './DesktopStudio.module.css';

/** The Desktop variant: placeholder composition of the drawing session, to be replaced by the variant's own UI. */
export function DesktopStudio(_props: PaintVariantProps) {
  const session = createPaintSession();
  const { camera } = session;
  session.createShortcuts({ closePanel: () => false });

  return (
    <PaintEditor session={session} class={styles.editor}>
      <PaintStage session={session}>
        <StageGuides session={session} />
        <StageOverlays session={session} />
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div class={styles.ui}>
        <SessionNotices session={session} />
      </div>
    </PaintEditor>
  );
}
