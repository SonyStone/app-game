import { createSignal } from 'solid-js';
import { createStepBack, SideMenu, SideMenuGroup, SideMenuItem } from '../../features/side-menu';
import { TryButton } from '../Screen';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';
import styles from './SideMenus.module.css';

/**
 * Side menus: the menu that pushes the drawing aside into a card (`features/side-menu`), in its states and from both
 * sides, over a stand-in painting. The closed and open ones work: the pill and the card toggle them. The full-screen
 * one also steps back with three fingers pinched together, as the Puck variant does on the drawing.
 */
export function SideMenus() {
  return (
    <CanvasGroup
      id="side-menu"
      title="Side menu"
      omitted={<>The entries only close the menu here; the Puck variant's run the drawing's commands.</>}
    >
      <CanvasRow title="States" note="on a MovinkPad-sized screen">
        <Specimen
          id="side-menu/states/closed"
          label="Closed"
          below={<TryButton label="Open full screen" title="Side menu" render={() => <LiveSideMenu />} />}
        >
          <MenuBox />
        </Specimen>
        <Specimen id="side-menu/states/pinching" label="Pinching, half way">
          <MenuBox progress={0.5} />
        </Specimen>
        <Specimen id="side-menu/states/open" label="Open">
          <MenuBox open />
        </Specimen>
      </CanvasRow>
      <CanvasRow title="Side" note="for the other hand">
        <Specimen id="side-menu/side/left" label="From the left">
          <MenuBox open side="left" />
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** A side menu in a box of the MovinkPad's screen, starting `open` or held at `progress`. */
function MenuBox(props: { open?: boolean; progress?: number; side?: 'left' | 'right' }) {
  // The specimen starts in its state and is then the user's to toggle.
  const [open, setOpen] = createSignal(props.open ?? false);

  return (
    <div class={styles.box} inert={props.progress !== undefined}>
      <SideMenu open={open()} onOpenChange={setOpen} progress={props.progress} side={props.side} menu={<DemoEntries />}>
        <div class={styles.painting} />
      </SideMenu>
    </div>
  );
}

/** The side menu full screen, with the pinch that steps back into it. */
function LiveSideMenu() {
  const [open, setOpen] = createSignal(false);
  const [painting, setPainting] = createSignal<HTMLElement>();
  const stepBack = createStepBack({ target: painting, enabled: () => !open(), onCommit: () => setOpen(true) });

  return (
    <div class={styles.full}>
      <SideMenu open={open()} onOpenChange={setOpen} progress={stepBack.progress()} menu={<DemoEntries />}>
        <div ref={setPainting} class={styles.painting}>
          <p class={styles.hint}>Pinch three fingers together, or press Menu</p>
        </div>
      </SideMenu>
    </div>
  );
}

/** The Puck variant's drawing menu without its commands. */
function DemoEntries() {
  return (
    <>
      <SideMenuGroup caption="Drawing">
        <SideMenuItem note=".paint .psd">Open</SideMenuItem>
        <SideMenuItem note=".paint">Save</SideMenuItem>
        <SideMenuItem note="new layer">Place image</SideMenuItem>
        <SideMenuItem note="PNG">Export picture</SideMenuItem>
        <SideMenuItem note="PSD">Export layers</SideMenuItem>
      </SideMenuGroup>
      <SideMenuGroup caption="Windows" small>
        <SideMenuItem>Mixing palette</SideMenuItem>
        <SideMenuItem>Pen and palm</SideMenuItem>
        <SideMenuItem>Pen pressure</SideMenuItem>
      </SideMenuGroup>
      <SideMenuGroup caption="View" small>
        <SideMenuItem>Reset view</SideMenuItem>
        <SideMenuItem>Full screen</SideMenuItem>
      </SideMenuGroup>
    </>
  );
}
