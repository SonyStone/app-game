# Solid ViewCube

A controlled SolidJS 2 navigation cube with 26 preset directions, screen-relative adjacent views, 90° and free roll, upright pointer orbit, a compass and optional snapping. It needs no WebGPU context or camera engine.

The package is tested with **solid-js 2.0.0-rc.4** and **@solidjs/web 2.0.0-rc.4**. Both are peer dependencies. It is currently private and can be installed from a local tarball; it has not been published.

## Usage

```tsx
import { createSignal } from 'solid-js'
import { ViewCube, type ViewOrientation } from '@app-game/solid-view-cube'
import '@app-game/solid-view-cube/style.css'

export function OrientationControl() {
  const home: ViewOrientation = { direction: [0, -1, 0], up: [0, 0, 1] }
  const [orientation, setOrientation] = createSignal(home)

  return <ViewCube
    orientation={orientation()}
    onNavigate={request => setOrientation(request.orientation)}
    onHome={() => setOrientation(home)}
    size={160}
  />
}
```

In a viewport, apply `request.orientation` to the real camera and feed its actual orientation back to the component. The example above only controls the widget. Position the component with a host class or `style={{ position: 'absolute', top: '12px', right: '12px' }}` inside a positioned container.

## Coordinate contract

`ViewOrientation` contains two readonly world-space vectors:

- `direction` points **from the orbit target toward the camera**.
- `up` points toward the top of the screen. It is perpendicular to `direction`.

The world is right-handed. Screen right is `cross(up, direction)`. Finite nonzero vectors are normalized and up is orthogonalized; zero, non-finite or parallel vectors throw `RangeError`. Caller objects and arrays are not mutated. Always supply both vectors: a direction alone loses roll, especially at Top/Bottom.

`referenceFrame` defines the world directions of the cube's labels, independently of the camera. Defaults are `up: [0,0,1]`, `front: [0,-1,0]`. Cube Right is `cross(referenceFrame.up, referenceFrame.front)`.

For a Y-up application with Front=+Z:

```tsx
<ViewCube
  orientation={orientation()}
  onNavigate={applyCameraOrientation}
  referenceFrame={{ up: [0, 1, 0], front: [0, 0, 1] }}
/>
```

Convert left-handed camera conventions in the host adapter. The component never reads or changes pivot, distance, projection or a drawing-plane lock.

## Props

| Prop | Default | Contract |
| --- | --- | --- |
| `orientation` | required | Actual displayed camera frame, a reactive value rather than an accessor |
| `onNavigate` | required | Receives the complete requested frame; does not return a Promise |
| `onHome` | absent | Restores the host's saved camera; absence hides Home |
| `referenceFrame` | Z-up, Front=−Y | Directions of cube labels in world space |
| `animated` | `false` | Requests animated discrete changes; reduced motion forces instant |
| `snap` | `false` | After drag, snaps direction to a preset within 8°, transporting screen-up |
| `compass` | `true` | Shows the compass when viewing the upper side; edge-on/bottom hide it and its hit areas |
| `disabled` | `false` | Stops interaction and cancels active gestures; external updates still render |
| `size` | `160` | CSS pixels, finite and at least 100; controls the full widget scale |
| `class`, `style` | absent | Host placement and theme; size owns width, height and font-size |

CSS variables: `--view-cube-label`, `--view-cube-border`, `--view-cube-compass`, `--view-cube-accent`. The internal CSS perspective affects the widget only.

## Navigation and animation

Discrete requests have `source: 'preset' | 'adjacent' | 'roll' | 'snap'`, `orientation`, and `transition: 'instant' | 'animated'`.

Continuous requests have `source: 'drag' | 'compass-drag' | 'roll-drag'`, `phase: 'start' | 'move' | 'end' | 'cancel'`, `orientation`, and `transition: 'instant'`. Start occurs after a 4px threshold. One primary pointer owns the gesture; secondary buttons do not navigate. Native button clicks support Enter/Space. A drag suppresses its following pointer click.

Apply drag requests synchronously to camera state and cancel any host animation at `start`. Motion is computed from the initial gesture frame, so it does not accumulate errors from delayed rendering. `end` and `cancel` are lifecycle notifications and do not request an additional movement. Cancel keeps the current orientation; an external orientation update during drag cancels the gesture and wins. Unmount releases pointer capture without emitting callbacks.

Roll rotates the **image** clockwise or counterclockwise. Adjacent buttons follow screen right/up even after roll, and preserve the transported camera up. Roll controls are always visible. Click for a 90° step, or hold either arrow and drag around the cube center for continuous roll. Passing through the cube center pauses roll and rebases the angle on exit, preventing a 180° jump. Adjacent controls require the face normal and screen-up to align within 0.1° of a face preset with a quarter-turn roll; they stay hidden during a drag. Clicking a named preset chooses its canonical upright orientation; adjacent navigation preserves the current roll frame.

Cube dragging turns around `referenceFrame.up`, maps pointer movement through the current roll and stops elevation 0.5° short of Top/Bottom, and preserves existing roll without accumulating new tilt. The small pole margin keeps heading defined between gestures; clicking Top/Bottom still selects the exact pole. At an exact pole, screen-up supplies the otherwise undefined heading. Compass letters choose cardinal headings while preserving elevation and roll; dragging the ring or a letter rotates around world-up. The ring has a screen-space hit stroke of 24px for a mouse and 40px for a coarse pointer, beneath the cube's face buttons. Hover and keyboard focus highlight the selected target across its adjoining faces: three matching patches for a corner, two for an edge, and the center patch for a face. Snapping applies only to cube orbit, never to free roll or compass dragging.

The always-visible roll controls and free-roll gesture extend the Autodesk behavior. AutoCAD documents roll arrows for face views and confirms that compass letters rotate the model. See [reorienting the view](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-A90F5F1C-B338-4BDE-9D05-F26BFFE3B3A5.htm) and [ViewCube compass](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-E6D3896C-AF39-4F5C-A57C-CACE2A1117F9.htm).

The host owns the animation clock and feeds each displayed frame back to `orientation`. Use exported `interpolateOrientation(from, to, progress)` for the shortest quaternion rotation, including roll and pole crossings. Progress is clamped to [0,1]; non-finite progress throws `RangeError`. Set the exact requested pose on completion and interrupt the previous transition before starting another. Avoid animating the cube separately from the scene.

The Grease Pencil adapter is in `apps/grease-pencil-typegpu/src/render/viewCubeCamera.ts`. It converts direction/up to the existing Euler camera, preserves pivot and distance, and retains the 2D drawing-plane lock for both `roll` and `roll-drag`. Other navigation exits that application's 2D mode. These policies belong to the application.

## Distribution and checks

```sh
pnpm --filter @app-game/solid-view-cube test
pnpm --filter @app-game/solid-view-cube typecheck
pnpm --filter @app-game/solid-view-cube build
pnpm --filter @app-game/solid-view-cube pack --pack-destination /tmp/viewcube-package
```

The tarball includes a browser ESM build, a server ESM build, declarations, extracted CSS and a `solid` source condition for Solid-aware compilers. Import `style.css` once when consuming the precompiled browser build. Source compilation also loads the CSS module. The server build can be imported and rendered without `window` or `document`; browser gesture resources are created only during interaction. SSR and browser builds use the same CSS class names.

There are no workspace runtime imports, engine dependencies or unresolved catalog peers in the tarball. `private: true` protects against accidental publication; change publication metadata separately when choosing a registry and release policy.

The old `NavigationCubeCamera`, `onOrbit`, `onRoll`, `onSetView` and `animateViewChanges` contract has been removed in this pre-1.0 release. Migrate to `orientation`, `onNavigate` and `animated`. A host that previously accepted only a direction must now apply the supplied up vector too.
