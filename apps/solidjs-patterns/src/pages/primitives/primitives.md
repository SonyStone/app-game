<Page
title="Solid Primitives"
badge="Advanced"
description="@solid-primitives provides community utilities built on SolidJS reactivity. Covers event listeners, storage, timers, and much more."

>

  <Section
    title="Event listeners"
    description="Use makeEventListener / createEventListener instead of manual addEventListener for automatic cleanup."
  >

```tsx
import { makeEventListener, createEventListener } from '@solid-primitives/event-listener';
import { onMount } from 'solid-js';

// makeEventListener - in reactive scope (auto cleanup)
onMount(() => {
  makeEventListener(window, 'resize', (e) => {
    console.log('resized:', window.innerWidth);
  });
});

// createEventListener - reactive target (re-registers when target changes)
createEventListener(
  () => containerRef,
  'click',
  (e) => console.log('clicked:', e.target)
);
```

  </Section>

  <Section title="Keyboard" description="createKeyHold and createShortcut for keyboard interactions.">

```tsx
import { createKeyHold, createShortcut } from '@solid-primitives/keyboard';

// Detect if a key is currently held down
const [spaceHeld] = createKeyHold('Space');

// Register a keyboard shortcut
createShortcut(['Control', 'K'], () => {
  openCommandPalette();
});

// In JSX
<div class={spaceHeld() ? 'zoomed' : ''}> ... </div>;
```

  </Section>

  <Section
    title="Storage"
    description="createLocalStorage and createCookieStorage for persistent reactive state."
  >

```tsx
import { makePersisted } from '@solid-primitives/storage';
import { createSignal, createStore } from 'solid-js';
import { createStore } from 'solid-js/store';

// Persist a signal to localStorage
const [theme, setTheme] = makePersisted(createSignal<'light' | 'dark'>('dark'), { name: 'theme' });

// Persist a store
const [prefs, setPrefs] = makePersisted(createStore({ fontSize: 14, lang: 'en' }), { name: 'user-prefs' });
```

  </Section>

  <Section title="Bounds & resize" description="createElementBounds for reactive element dimensions.">

```tsx
import { createElementBounds } from '@solid-primitives/bounds';

function ResponsiveChart(): JSX.Element {
  let el!: HTMLDivElement;
  const bounds = createElementBounds(() => el);

  return (
    <div ref={el} class="w-full">
      <canvas width={bounds.width ?? 0} height={bounds.height ?? 0} />
    </div>
  );
}
```

  </Section>

  <Callout type="tip" title="Browse all primitives">
    Over 50 primitives at <a href="https://primitives.solidjs.community">primitives.solidjs.community</a>. Each
    package is independently installable.
  </Callout>
</Page>
