import { cn } from '@app-game/utils/cn';
import type { ComponentProps, JSX } from '@solidjs/web';
import { omit, type ParentProps } from 'solid-js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type DropdownMenuProps
} from './dropdown-menu';

/** Horizontal container for Solid 2-native menu groups. */
export function Menubar(props: ComponentProps<'div'>): JSX.Element {
  const rest = omit(props, 'class');
  return (
    <div
      role="menubar"
      class={cn('bg-background flex h-9 items-center space-x-1 rounded-md border p-1 shadow-sm', props.class)}
      {...rest}
    />
  );
}

export function MenubarMenu(props: DropdownMenuProps): JSX.Element {
  return <DropdownMenu {...props} />;
}

export function MenubarTrigger(props: ComponentProps<'button'>): JSX.Element {
  const rest = omit(props, 'class');
  return (
    <DropdownMenuTrigger
      class={cn(
        'focus:(bg-accent text-accent-foreground) flex cursor-default items-center rounded-sm px-3 py-1 text-sm font-medium outline-none select-none',
        props.class
      )}
      {...rest}
    />
  );
}

export function MenubarContent(props: ComponentProps<'div'>): JSX.Element {
  return <DropdownMenuContent {...props} />;
}

export type MenubarItemProps = ComponentProps<'button'> & { inset?: boolean };

export function MenubarItem(props: MenubarItemProps): JSX.Element {
  return <DropdownMenuItem {...props} />;
}

export const MenubarSeparator = DropdownMenuSeparator;
export const MenubarShortcut = DropdownMenuShortcut;
export const MenubarSub = DropdownMenuSub;
export const MenubarSubContent = DropdownMenuSubContent;
export const MenubarSubTrigger = DropdownMenuSubTrigger;
export const MenubarCheckboxItem = DropdownMenuCheckboxItem;
export const MenubarRadioItem = DropdownMenuRadioItem;

export type MenubarRadioGroupProps = ParentProps<{ value?: string }>;

export function MenubarRadioGroup(props: MenubarRadioGroupProps): JSX.Element {
  return <DropdownMenuGroup>{props.children}</DropdownMenuGroup>;
}
