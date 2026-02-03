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

## Component Patterns

```tsx
import type { Accessor, JSX, Setter } from 'solid-js';

export type ComponentProps = {
  value: Accessor<string>;
  setValue: Setter<string>;
  class?: string; // Allow custom classes
};

export function Component(props: ComponentProps): JSX.Element {
  return <div class={`flex items-center gap-2 ${props.class ?? ''}`}>{/* content */}</div>;
}
```
