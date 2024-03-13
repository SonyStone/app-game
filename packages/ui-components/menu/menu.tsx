import { computePosition, offset } from '@floating-ui/dom';
import { createButton } from '@solid-aria/button';
import { ForItems, Item } from '@solid-aria/collection';
import { FocusScope } from '@solid-aria/focus';
import { createFocus } from '@solid-aria/interactions';
import {
  AriaMenuItemProps,
  AriaMenuProps,
  AriaMenuTriggerProps,
  createMenu,
  createMenuItem,
  createMenuTrigger
} from '@solid-aria/menu';
import { AriaOverlayProps, DismissButton, createOverlay } from '@solid-aria/overlays';
import { combineProps } from '@solid-primitives/props';
import { FlowProps, JSX, ParentProps, Show, createSignal } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Transition } from 'solid-transition-group';
import { Ripple } from '../ripple/Ripple';

type MenuButtonProps = FlowProps<AriaMenuTriggerProps & AriaMenuProps & { label: JSX.Element }>;

function MenuButton(props: MenuButtonProps) {
  let ref: HTMLButtonElement | undefined;

  // Get props for the menu trigger and menu elements
  const { menuTriggerProps, menuProps, state } = createMenuTrigger({}, () => ref);

  // Get props for the button based on the trigger props from createMenuTrigger
  const { buttonProps } = createButton(menuTriggerProps, () => ref);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button {...buttonProps} ref={ref} class="relative px-4 py-2 rounded-2 border flex gap-2">
        {props.label}
        <span aria-hidden="true" class={['transition-transform', state.isOpen() ? 'rotate-180' : ''].join(' ')}>
          ▼
        </span>
        <Ripple />
      </button>

      <Portal>
        <Transition
          onEnter={(el, done) => {
            const a = el.animate([{ opacity: 0, transform: 'translateY(-10%)' }, { opacity: 1 }], {
              duration: 150
            });
            a.finished.then(done);
          }}
          onExit={(el, done) => {
            const a = el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10%)' }], {
              duration: 100
            });
            a.finished.then(done);
          }}
        >
          <Show when={state.isOpen()}>
            <div
              ref={(menuRef) => {
                computePosition(ref!, menuRef, {
                  placement: 'bottom-start',
                  middleware: [offset()]
                }).then((pos) => {
                  menuRef.style.left = pos.x + 'px';
                  menuRef.style.top = pos.y + 'px';
                });
              }}
              class="bg-white border shadow rounded-2 absolute overflow-hidden"
            >
              <MenuPopup {...props} {...menuProps} autofocus={state.focusStrategy()} onClose={() => state.close()} />
            </div>
          </Show>
        </Transition>
      </Portal>
    </div>
  );
}

function MenuPopup(props: AriaMenuProps & AriaOverlayProps) {
  let ref: HTMLUListElement | undefined;

  // Get props for the menu element
  const { MenuProvider, menuProps, state } = createMenu(props, () => ref);

  // Handle events that should cause the menu to close,
  // e.g. blur, clicking outside, or pressing the escape key.
  let overlayRef: HTMLDivElement | undefined;
  const { overlayProps } = createOverlay(
    {
      onClose: props.onClose,
      shouldCloseOnBlur: true,
      isOpen: true,
      isDismissable: true
    },
    () => overlayRef
  );

  // Wrap in <FocusScope> so that focus is restored back to the
  // trigger when the menu is closed. In addition, add hidden
  // <DismissButton> components at the start and end of the list
  // to allow screen reader users to dismiss the popup easily.
  return (
    <MenuProvider>
      <FocusScope restoreFocus>
        <div {...overlayProps} ref={overlayRef}>
          <DismissButton onDismiss={props.onClose} />
          <ul {...menuProps} ref={ref} class="list-none border-none p-0 m-0">
            <ForItems in={state.collection()}>
              {(item) => (
                <MenuItem key={item().key} onAction={props.onAction} onClose={props.onClose}>
                  {item().children}
                </MenuItem>
              )}
            </ForItems>
          </ul>
          <DismissButton onDismiss={props.onClose} />
        </div>
      </FocusScope>
    </MenuProvider>
  );
}

function MenuItem(props: ParentProps<AriaMenuItemProps>) {
  let ref: HTMLLIElement | undefined;

  // Get props for the menu item element
  const { menuItemProps } = createMenuItem(props, () => ref);

  // Handle focus events so we can apply highlighted
  // style to the focused menu item
  const [isFocused, setIsFocused] = createSignal(false);
  const { focusProps } = createFocus({ onFocusChange: setIsFocused });

  const rootProps = combineProps(menuItemProps, focusProps);

  return (
    <li
      {...rootProps}
      ref={ref}
      class="relative outline-none cursor-pointer px-4 py-2"
      style={{
        background: isFocused() ? 'gray' : 'transparent',
        color: isFocused() ? 'white' : 'black'
      }}
    >
      {props.children}
      <Ripple />
    </li>
  );
}

export function Menu() {
  return (
    <MenuButton label="Actions" onAction={(key) => console.log(key)}>
      <Item key="copy">Copy</Item>
      <Item key="cut">Cut</Item>
      <Item key="paste">Paste</Item>
    </MenuButton>
  );
}
