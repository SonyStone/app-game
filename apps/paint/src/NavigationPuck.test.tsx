import { NavigationPuck } from '@app-game/navigation-puck';
import { createNavigationPuck } from '@app-game/navigation-puck/controller';
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it.each(['once', 'held'] as const)('restores canvas focus only when a %s drag closes the puck', (source) => {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  document.body.append(canvas, host);
  let navigation!: ReturnType<typeof createNavigationPuck>;
  dispose = render(() => {
    navigation = createNavigationPuck({
      viewport: () => ({ left: 0, top: 0, width: 600, height: 400 }),
      mode: () => '2d',
      rotation: () => 0,
      transform: vi.fn(),
      orbit: vi.fn()
    });
    return <NavigationPuck navigation={navigation} focusTarget={() => canvas} />;
  }, host);
  navigation.open(undefined, source);
  flush();
  const pan = host.querySelector<HTMLButtonElement>('[aria-label="Drag to pan"]')!;
  pan.setPointerCapture = vi.fn();
  const pointer = (type: string) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 300, clientY: 200 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    pan.dispatchEvent(event);
  };
  pointer('pointerdown');
  flush();
  expect(document.activeElement).toBe(pan);
  pointer('pointerup');
  flush();

  if (source === 'once') {
    expect(host.querySelector('[aria-label="Canvas navigation"]')).toBeNull();
    expect(document.activeElement).toBe(canvas);
  } else {
    expect(host.querySelector('[aria-label="Drag to pan"]')).toBe(pan);
    expect(document.activeElement).toBe(pan);
  }
});
