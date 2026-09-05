# Navigation Puck

Shared Solid 2 component, controller and input bindings for Paint and Grease Pencil. Both editors use the same 2D image/zones. The 3D view adds the four-zone layout with Orbit. Gesture behavior, pointer ownership, hotkeys and styles live here.

## Integration

Create `createNavigationPuck` with viewport bounds, mode, clockwise screen rotation and two camera callbacks. Render `<NavigationPuck navigation={navigation} focusTarget={() => canvas} />`, then attach `attachNavigationPuck(canvas, navigation, { busy })` after mounting. Return the binding's cleanup from Solid's `onSettled` callback. Canvas should have `tabindex={0}`.

- `viewport`, pointer points and `transform.from/to` use **client CSS pixels**, including viewport left/top offsets.
- `transform` receives incremental `scale` and clockwise screen `rotation` in radians. Preserve the world point under `from` while transforming, then translate it to `to`.
- `rotation()` returns the current clockwise screen angle for absolute Shift snapping. Paint supplies `camera.angle`; Grease supplies `-camera.roll`. Each editor owns this conversion, not the shared controller.
- `orbit(dx, dy)` receives pixel deltas only in 3D. Shift snapping assumes 0.006 rad/px horizontally and 0.005 rad/px vertically, matching Grease's renderer.
- `busy()` blocks invocation during painting or an existing touch/edit gesture. `ready()` optionally blocks it before renderer initialization.
- The component imports scoped CSS automatically. Headless consumers can import `/controller` and `/input` without loading JSX or assets.

## Controls

Hold Space to invoke at the last canvas pointer, or use V/right click/the editor launcher for one operation. During capture the Puck hides. A held invocation reopens at the release point; releasing Space during a drag lets that drag finish. Right-drag selects an action after 30 px travel. Right-drag selection has a 12 px dead zone at the Puck center. Direct button presses start immediately, including at the center. In 2D the center pans, the lower segment zooms and the outer ring rotates. Zoom uses vertical movement and, like rotation, pivots around the viewport center. Shift snaps rotation and 3D orbit to 15° steps. Arrow keys nudge actions. Escape, window blur, resize and pointer cancellation clear navigation. Input bindings capture navigation before the editor's painting handlers.

`src/assets/navigation-puck.svg` is the vector recreation used by the 2D component. It contains paths, circles, gradients and shadows, without an embedded bitmap. The original user-supplied `navigation-puck.png` is retained as a reference. Both use the same 560×560 coordinate system; the SVG icons follow the current action layout. The explicit `?url` import keeps the image working in hosts that compile ordinary SVG imports into components. 3D icon paths originated in Grease Pencil's existing icon set.

## Verification

```sh
pnpm --filter @app-game/navigation-puck typecheck
pnpm --filter @app-game/navigation-puck test
pnpm --filter @app-game/paint test:studio
pnpm --filter @app-game/grease-pencil-typegpu exec vitest run
```

Tests cover 2D/3D selection, capture ownership, Space release during active drag, one-shot lifecycle, angle seams, absolute snapping, orbit mode changes, right-drag interception, busy/editable controls and teardown. Camera-adapter tests remain with their respective editors. Production bundling is verified through both applications; this internal source package is not separately published.
