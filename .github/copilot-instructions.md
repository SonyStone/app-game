# Project Coding Guidelines

## Styling

**Use UnoCSS utility classes instead of inline styles.**

- ❌ Don't use `style={{ display: 'flex', gap: '8px' }}`
- ✅ Use `class="flex gap-2"`

### UnoCSS Configuration

This project uses UnoCSS with the following presets:

- `@unocss/preset-wind4` - Tailwind CSS compatible utilities
- `unocss-preset-animations` - Animation utilities

### Common Patterns

```tsx
// Layout
class="flex items-center gap-2"
class="flex flex-col"
class="flex justify-between items-center"

// Spacing
class="p-2 px-4 py-1"
class="m-2 mt-4"
class="gap-2 gap-4"

// Colors (using neutral palette for dark UI)
class="bg-neutral-800 text-neutral-400"
class="border border-neutral-700"
class="text-red-400 text-green-500 text-yellow-400"

// Typography
class="text-xs text-sm text-base"
class="font-mono font-bold"

// Sizing
class="w-20 h-8 min-w-50 max-h-100"

// Positioning
class="absolute top-2 left-2 z-1000"
class="fixed inset-0"

// Interactivity
class="cursor-pointer touch-none pointer-events-none"

// Conditional classes (SolidJS)
class={`base-class ${condition() ? 'active-class' : 'inactive-class'}`}
```

### When to Use Inline Styles

Use inline `style` only for:

- Dynamic values from props/state (e.g., `style={{ width: \`${size()}px\` }}`)
- Calculated positions (e.g., `style={{ left: \`${x}px\`, top: \`${y}px\` }}`)
- CSS custom properties

## Framework

- **UI Framework**: SolidJS
- **Build Tool**: Vite
- **Language**: TypeScript

## Event Listeners

**Use `@solid-primitives/event-listener` instead of manual `addEventListener`/`removeEventListener`.**

This provides automatic cleanup when the component unmounts, preventing memory leaks.

```tsx
// ❌ Don't - manual cleanup required
onMount(() => {
  const handler = (e: PointerEvent) => { ... };
  window.addEventListener('pointermove', handler);
  onCleanup(() => window.removeEventListener('pointermove', handler));
});

// ✅ Do - automatic cleanup
import { makeEventListener } from '@solid-primitives/event-listener';

onMount(() => {
  makeEventListener(window, 'pointermove', (e) => { ... });
});

// ✅ Or use createEventListener for reactive targets
import { createEventListener } from '@solid-primitives/event-listener';

createEventListener(
  () => containerRef,
  'click',
  (e) => { ... }
);
```

## Pointer Events

**Use `PointerEvent` instead of `MouseEvent` or `TouchEvent`.**

Pointer Events provide a unified API for mouse, touch, and pen input. Use `pointerType` to differentiate input types when needed.

```tsx
// ❌ Don't - separate mouse and touch handling
const isTouch = 'ontouchstart' in window;
const handleClick = (e: MouseEvent) => {
  if (isTouch) { /* touch behavior */ }
  else { /* mouse behavior */ }
};

// ❌ Don't - use MouseEvent or TouchEvent
const handleMouseDown = (e: MouseEvent) => { ... };
const handleTouchStart = (e: TouchEvent) => { ... };

// ✅ Do - use PointerEvent with pointerType
let lastPointerType: string = 'mouse';

const handlePointerDown = (e: PointerEvent) => {
  lastPointerType = e.pointerType; // 'mouse' | 'touch' | 'pen'
};

const handleClick = (e: PointerEvent) => {
  if (lastPointerType === 'touch') {
    // Touch-specific behavior (e.g., single tap to navigate)
  } else {
    // Mouse/pen behavior (e.g., click to select)
  }
};
```

### PointerEvent Types

- `e.pointerType === 'mouse'` - Mouse input
- `e.pointerType === 'touch'` - Touch input (finger)
- `e.pointerType === 'pen'` - Stylus/pen input

### Common Pointer Event Handlers

```tsx
onPointerDown = { handlePointerDown };
onPointerUp = { handlePointerUp };
onPointerMove = { handlePointerMove };
onPointerEnter = { handlePointerEnter };
onPointerLeave = { handlePointerLeave };
onPointerCancel = { handlePointerCancel };
```

## TypeScript Conventions

**Use `type` instead of `interface` for type definitions.**

- ❌ Don't use `interface Props { ... }`
- ✅ Use `type Props = { ... }`

```tsx
// ❌ Don't
interface UserData {
  name: string;
  age: number;
}

// ✅ Do
type UserData = {
  name: string;
  age: number;
};
```

**Don't use default exports. Always use named exports.**

## Component Patterns

### Props Types

**For internal/private components, define props inline in the function signature:**

```tsx
// ✅ Inline props for internal components
function PointerCircle(props: { pointer: PointerDebugInfo }): JSX.Element {
  return <circle cx={props.pointer.x} cy={props.pointer.y} r="8" />;
}

function UserAvatar(props: { name: string; size?: number }): JSX.Element {
  return <img src={`/avatar/${props.name}`} class="rounded-full" />;
}
```

**For exported/public components, define props type separately:**

```tsx
// ✅ Separate type for exported components
export type ComponentProps = {
  value: Accessor<string>;
  setValue: Setter<string>;
  class?: string;
};

export function Component(props: ComponentProps): JSX.Element {
  return <div class={`flex items-center gap-2 ${props.class ?? ''}`}>{/* content */}</div>;
}
```

### Component Structure

**Refactor large components into smaller, focused sub-components.**

Keep components small and single-purpose. Extract repeated patterns and complex JSX into separate components within the same file.

### File Organization (Newspaper Style)

**Organize files top-to-bottom by importance, like a newspaper article.**

The most important content (main exports) should be at the top, with supporting details (sub-components, helpers) at the bottom. Readers should understand the file's purpose without scrolling.

```tsx
// ============================================================================
// MARK: Types (exported types first)
// ============================================================================

export type MyComponentProps = { ... };

// ============================================================================
// MARK: Main Component (the primary export)
// ============================================================================

export function MyComponent(props: MyComponentProps): JSX.Element {
  // Main component uses sub-components defined below
  return (
    <div>
      <Header />
      <Content />
      <Footer />
    </div>
  );
}

// ============================================================================
// MARK: Sub-Components (internal, used by main component)
// ============================================================================

function Header(): JSX.Element { ... }
function Content(): JSX.Element { ... }
function Footer(): JSX.Element { ... }

// ============================================================================
// MARK: Helper Functions (utilities at the bottom)
// ============================================================================

function formatDate(date: Date): string { ... }
function calculateTotal(items: Item[]): number { ... }
```

**Section order:**

1. **Types** - Exported types and interfaces
2. **Main Component(s)** - Primary exported components
3. **Sub-Components** - Internal components used by main
4. **Helper Functions** - Utility functions

This allows readers to quickly understand the file's API and main functionality before diving into implementation details.
