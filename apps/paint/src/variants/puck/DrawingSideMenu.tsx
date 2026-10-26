import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import type { PaintSession } from '../../features/session';
import { SideMenu, SideMenuGroup, SideMenuItem } from '../../features/side-menu';

/**
 * The Puck variant's drawing menu: what the cluster under the pen leaves out, as it is not for drawing. Opening,
 * saving and exporting the drawing, placing an image, the session's windows and the view, in a `SideMenu` that pushes
 * the drawing (`children`) aside. File commands wait for the engine.
 */
export function DrawingSideMenu(props: {
  session: PaintSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A pull toward opening, 0 to 1, while it lasts; see `createEdgePull`. */
  progress?: number;
  /** Link back to the embedding playground. */
  experimentsHref?: string;
  children: JSX.Element;
}) {
  const { edit, images, windows, camera, fullscreen } = props.session;
  const ready = () => props.session.ready();
  // Outside the panel, which turns inert as the menu closes.
  let drawingFile!: HTMLInputElement;
  let imageFile!: HTMLInputElement;

  return (
    <>
      <input
        ref={drawingFile}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => {
          const file = takeFile(event.currentTarget);
          if (file) {
            edit({ type: 'import', file });
          }
        }}
      />
      <input
        ref={imageFile}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = takeFile(event.currentTarget);
          if (file) {
            images.place(file);
          }
        }}
      />
      <SideMenu
        open={props.open}
        onOpenChange={props.onOpenChange}
        progress={props.progress}
        menu={
          <>
            <SideMenuGroup caption="Drawing">
              <SideMenuItem disabled={!ready()} note=".paint .psd" onSelect={() => drawingFile.click()}>
                Open
              </SideMenuItem>
              <SideMenuItem disabled={!ready()} note=".paint" onSelect={() => edit({ type: 'download' })}>
                Save
              </SideMenuItem>
              <SideMenuItem disabled={!ready()} note="new layer" onSelect={() => imageFile.click()}>
                Place image
              </SideMenuItem>
              <SideMenuItem disabled={!ready()} note="PNG" onSelect={() => edit({ type: 'png' })}>
                Export picture
              </SideMenuItem>
              <SideMenuItem disabled={!ready()} note="PSD" onSelect={() => edit({ type: 'psd' })}>
                Export layers
              </SideMenuItem>
            </SideMenuGroup>
            <SideMenuGroup caption="Windows" small>
              <SideMenuItem onSelect={() => windows.open('palette')}>Mixing palette</SideMenuItem>
              <SideMenuItem onSelect={() => windows.open('pen')}>Pen and palm</SideMenuItem>
              <SideMenuItem onSelect={() => windows.open('pressure')}>Pen pressure</SideMenuItem>
            </SideMenuGroup>
            <SideMenuGroup caption="View" small>
              <SideMenuItem onSelect={() => camera.reset()}>Reset view</SideMenuItem>
              <Show when={fullscreen.shown}>
                <SideMenuItem disabled={fullscreen.props.disabled} onSelect={() => void fullscreen.props.onClick()}>
                  {fullscreen.isActive() ? 'Leave full screen' : 'Full screen'}
                </SideMenuItem>
              </Show>
              <Show when={props.experimentsHref}>
                {(href) => <SideMenuItem href={href()}>Paint experiments</SideMenuItem>}
              </Show>
            </SideMenuGroup>
          </>
        }
      >
        {props.children}
      </SideMenu>
    </>
  );
}

/** The file chosen in `input`, which is cleared so that choosing the same file again reports it again. */
function takeFile(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  return file;
}
