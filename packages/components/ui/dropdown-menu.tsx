import { cn } from '@app-game/utils/cn';
import type { ComponentProps, JSX } from '@solidjs/web';
import { createContext, createSignal, omit, Show, useContext, type ParentProps } from 'solid-js';

type MenuState = {
  open: () => boolean;
  setOpen: (open: boolean) => void;
};

const MenuContext = createContext<MenuState>();

export type DropdownMenuProps = ParentProps<{
  placement?: string;
  gutter?: number;
  flip?: boolean;
  shift?: number;
}>;

/** Solid 2-native dropdown state container. */
export function DropdownMenu(props: DropdownMenuProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  return (
    <MenuContext value={{ open, setOpen }}>
      <span class="relative inline-flex">{props.children}</span>
    </MenuContext>
  );
}

export function DropdownMenuTrigger(props: ComponentProps<'button'>): JSX.Element {
  const menu = useMenuContext();
  const rest = omit(props, 'type', 'aria-haspopup', 'aria-expanded', 'onClick');
  return (
    <button
      type={props.type ?? 'button'}
      aria-haspopup="menu"
      aria-expanded={menu.open() ? 'true' : 'false'}
      onClick={() => menu.setOpen(!menu.open())}
      {...rest}
    />
  );
}

export function DropdownMenuContent(props: ComponentProps<'div'>): JSX.Element {
  const menu = useMenuContext();
  const rest = omit(props, 'class');
  return (
    <Show when={menu.open()}>
      <div
        role="menu"
        class={cn(
          'min-w-8rem bg-popover text-popover-foreground focus-visible:(outline-none ring-1.5 ring-ring) absolute top-full left-0 z-50 mt-1 overflow-hidden rounded-md border p-1 shadow-md',
          props.class
        )}
        {...rest}
      />
    </Show>
  );
}

export type DropdownMenuItemProps = ComponentProps<'button'> & { inset?: boolean };

export function DropdownMenuItem(props: DropdownMenuItemProps): JSX.Element {
  const menu = useMenuContext();
  const rest = omit(props, 'class', 'inset', 'type', 'onClick');
  return (
    <button
      type="button"
      role="menuitem"
      class={cn(
        'focus:(bg-accent text-accent-foreground) disabled:(pointer-events-none opacity-50) relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors outline-none select-none',
        props.inset && 'pl-8',
        props.class
      )}
      onClick={(event) => {
        callHandler(props.onClick, event);
        menu.setOpen(false);
      }}
      {...rest}
    />
  );
}

export const DropdownMenuGroup = (props: ComponentProps<'div'>): JSX.Element => <div role="group" {...props} />;
export const DropdownMenuRadioGroup = DropdownMenuGroup;
export const DropdownMenuSub = (props: ComponentProps<'div'>): JSX.Element => <div class="relative" {...props} />;

export function DropdownMenuGroupLabel(props: ComponentProps<'div'>): JSX.Element {
  const rest = omit(props, 'class');
  return <div class={cn('px-2 py-1.5 text-sm font-semibold', props.class)} {...rest} />;
}

export const DropdownMenuItemLabel = DropdownMenuGroupLabel;

export function DropdownMenuSeparator(props: ComponentProps<'hr'>): JSX.Element {
  const rest = omit(props, 'class');
  return <hr class={cn('bg-muted -mx-1 my-1 h-px border-0', props.class)} {...rest} />;
}

export function DropdownMenuShortcut(props: ComponentProps<'span'>): JSX.Element {
  const rest = omit(props, 'class');
  return <span class={cn('ml-auto text-xs tracking-widest opacity-60', props.class)} {...rest} />;
}

export function DropdownMenuSubTrigger(props: ComponentProps<'button'>): JSX.Element {
  const rest = omit(props, 'class', 'children', 'type');
  return (
    <button
      type="button"
      class={cn(
        'focus:bg-accent flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none',
        props.class
      )}
      {...rest}
    >
      {props.children}
      <span class="ml-auto">›</span>
    </button>
  );
}

export function DropdownMenuSubContent(props: ComponentProps<'div'>): JSX.Element {
  const rest = omit(props, 'class');
  return (
    <div
      role="menu"
      class={cn(
        'min-w-8rem bg-popover text-popover-foreground ml-4 overflow-hidden rounded-md border p-1 shadow-md',
        props.class
      )}
      {...rest}
    />
  );
}

export type DropdownMenuCheckboxItemProps = DropdownMenuItemProps & { checked?: boolean };

export function DropdownMenuCheckboxItem(props: DropdownMenuCheckboxItemProps): JSX.Element {
  const rest = omit(props, 'children', 'checked');
  return (
    <DropdownMenuItem {...rest} role="menuitemcheckbox" aria-checked={props.checked ? 'true' : 'false'}>
      <span class="absolute left-2">{props.checked ? '✓' : ''}</span>
      {props.children}
    </DropdownMenuItem>
  );
}

export type DropdownMenuRadioItemProps = DropdownMenuItemProps & { checked?: boolean; value?: string };

export function DropdownMenuRadioItem(props: DropdownMenuRadioItemProps): JSX.Element {
  const rest = omit(props, 'children', 'checked', 'value');
  return (
    <DropdownMenuItem {...rest} role="menuitemradio" aria-checked={props.checked ? 'true' : 'false'}>
      <span class="absolute left-2">{props.checked ? '●' : ''}</span>
      {props.children}
    </DropdownMenuItem>
  );
}

function useMenuContext(): MenuState {
  const context = useContext(MenuContext);
  if (!context) throw new Error('Dropdown menu components must be nested inside DropdownMenu');
  return context;
}

function callHandler<T extends Event>(handler: unknown, event: T): void {
  if (typeof handler === 'function') handler(event);
}
