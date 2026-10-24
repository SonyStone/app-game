import { createSignal, onCleanup } from 'solid-js';
import { createNativeHover } from './createNativeHover';
import { nativeShell, type NativeShellClient, type ShellInfo } from './shellClient';

/**
 * Paint inside the Android shell app (`apps/paint-android`), and nothing outside it. In the shell, the pen hover the
 * shell forwards reaches every hover consumer even when the WebView stopped reporting it (see `createNativeHover`),
 * and the back button or gesture first closes what `onBack` handlers close; when none does, the shell asks whether to
 * exit Paint. Must be created within a Solid owner, once per page.
 */
export function createNativeShell(client: NativeShellClient | undefined = nativeShell()) {
  const [info, setInfo] = createSignal<ShellInfo>();
  /** Back handlers, newest last. */
  const backHandlers: (() => boolean)[] = [];

  if (client) {
    // The first message also opens the channel: the shell can only send to a page that has sent.
    void client.request('info', {}).then((result) => result.map((value) => setInfo(() => value)));
    createNativeHover(client);
    onCleanup(
      client.handle('back', () => ({
        handled: closePopover() || [...backHandlers].reverse().some((handler) => handler())
      }))
    );
  }

  return {
    /** Whether the page runs in the shell: then hover never needs a fresh tab, as the shell supplies it. */
    active: client !== undefined,
    /** The shell's version and capabilities, once it answered; see `ShellInfo`. */
    info,
    /** The bridge for calling the shell's other methods; `undefined` outside it. */
    client,
    /**
     * Lets `handler` take the back button or gesture while the calling owner lives: it returns whether it closed
     * something. Newer handlers go first; an open popover menu closes before any of them. Does nothing outside the
     * shell.
     */
    onBack(handler: () => boolean) {
      backHandlers.push(handler);
      onCleanup(() => backHandlers.splice(backHandlers.indexOf(handler), 1));
    }
  };
}

/** Closes the open popover that light-dismisses (as Escape would), if any; returns whether there was one. */
function closePopover() {
  let open: HTMLElement[];
  try {
    open = [...document.querySelectorAll(':popover-open')].filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element.popover === 'auto'
    );
  } catch {
    // No popover support.
    return false;
  }

  const topmost = open[open.length - 1];
  topmost?.hidePopover();
  return topmost !== undefined;
}
