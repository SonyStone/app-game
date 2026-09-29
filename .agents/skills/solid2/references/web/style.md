# style

The `style` prop sets an element's inline styles.
It accepts a CSS string or an object of CSS declarations.

## Type

```ts
style?: string | JSX.CSSProperties | false | undefined;
```

## CSS strings

A string supplies the complete `style` attribute:

```tsx
<div style="color: white; background-color: navy">Status</div>
```

A reactive string replaces the element's complete `cssText` value when it changes.

## Style objects

An object sets declarations by CSS property name:

```tsx
<div
	style={{
		color: props.color,
		"background-color": props.background,
		"font-weight": props.important ? 700 : 400,
		"--accent-color": props.accent,
	}}
>
	Status
</div>
```

Use CSS property names such as `background-color` rather than JavaScript names such as `backgroundColor`.
Names beginning with `--` set CSS custom properties.

Solid updates changed declarations and removes declarations whose values become `null` or `undefined`.
It passes numeric values to the CSS property without adding a unit.
Include the unit when the property requires one:

```tsx
<div style={{ width: `${props.width}px` }} />
```

Passing `false` or `undefined` as the complete `style` value removes the style attribute.
