import { NavigationPuck } from '@app-game/navigation-puck';
import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import type { PaintVariantProps } from '..';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageHint,
  StageOverlays,
  type PaintSession
} from '../../features/session';
import styles from './LayoutStudio.module.css';
import { placementOf, type PageLayout } from './pageLayout';
import { layoutParts, type PartContext } from './parts';

/**
 * A page built in the component canvas's constructor (`PageLayout`), on the drawing session: the drawing fills the
 * screen and the page's parts sit over it where the layout places them. The session's navigation puck opens as in the
 * other variants (Space, V, the right button, the pen's side button). Parts the layout names but `layoutParts` no
 * longer has are left out.
 */
export function LayoutStudio(props: PaintVariantProps & { layout: PageLayout }) {
  const session = createPaintSession();
  const context = sessionContext(session);
  session.createShortcuts({ closePanel: () => false });

  return (
    <PaintEditor session={session} class={styles.editor}>
      <PaintStage session={session}>
        <StageGuides session={session} />
        <Show when={session.ready() && session.engine.state().tileCount === 0}>
          <StageHint>Pen to draw. Space, the right button or the pen's side button for the view.</StageHint>
        </Show>
        <StageOverlays session={session} />
        <Show when={session.camera.navigation.center()}>
          <NavigationPuck navigation={session.camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div class={styles.parts}>
        <For each={props.layout.parts.filter((placed) => layoutParts[placed.part])}>
          {(placed) => (
            <div class={styles.part} style={placementOf(placed, props.layout.screen)}>
              {layoutParts[placed.part]!.render(context)}
            </div>
          )}
        </For>
      </div>
      <SessionNotices session={session} />
    </PaintEditor>
  );
}

/** The layout variant for `layout`, as the variant registry loads it. */
export function layoutPage(layout: PageLayout): Component<PaintVariantProps> {
  return (props) => <LayoutStudio {...props} layout={layout} />;
}

/** What page parts read and change, from the drawing session. Must be created within a Solid owner. */
function sessionContext(session: PaintSession): PartContext {
  const { recentColors } = session;

  return {
    brush: session.brush,
    updateBrush: session.tools.updateBrush,
    swapColors: session.tools.swapColors,
    recentColors: recentColors.colors,
    rememberColor: recentColors.remember,
    document: session.engine.state,
    ready: session.ready,
    layer: (action) => session.edit({ type: 'layer', action }),
    blending: (linear) => session.edit({ type: 'blending', linear }),
    presets: session.library.presets,
    preset: session.tools.preset,
    recentPresets: () => [session.tools.preset(), ...session.recentPresets.recent(7)],
    usePreset: session.usePreset,
    tool: session.tool,
    chooseTool: session.chooseTool,
    mirrored: () => session.camera.camera().mirrored,
    toggleMirror: session.camera.toggleMirror,
    palette: { open: () => session.windows.isOpen('palette'), toggle: () => session.windows.toggle('palette') },
    coolorus: session.coolorus,
    wheel: session.colorWheel
  };
}
