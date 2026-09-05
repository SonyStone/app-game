# Shared Puck verification

Passed on 2026-09-05.

- Library: strict TypeScript and 28 controller/input tests passed.
- Paint: TypeScript, 38 tests and standalone production build passed.
- Grease Pencil: TypeScript/production build, existing 51 tests and 2 new camera-adapter tests passed.
- Main playground resolves the workspace package through its Vite/TypeScript aliases.
- Browser: Paint and Grease 2D expose the same shared component, image URL and pan/zoom/rotate controls. Grease 2D pan completes and closes the Puck. Switching Grease to 3D shows the shared four-zone layout; Orbit changes the view and closes after release. Final warning/error logs were empty in both tabs.
- Adapter checks include client-space viewport offsets, mirrored/rotated Paint cameras, Grease's opposite roll sign and 3D-only Orbit forwarding.

The renderer and GPU worker are unchanged. Space-held lifecycle, capture cancellation and secondary pointers were checked by automated input/controller tests; physical pen/multitouch hardware was not exercised in this pass.

## SVG and first-drag regression check

Verified on 2026-09-05 after the 2D layout update.

- Shared library: 30 tests and TypeScript passed. Regression coverage reproduces canvas-to-button focus transfer in both modes and direct pan from the exact center. Actual window blur still cancels navigation.
- Paint: 38 tests and TypeScript passed. Grease Pencil: 53 tests passed. Both production builds passed.
- Main playground browser check at `127.0.0.1:3121`: SVG loads with the explicit `?url` import. The center pans, the lower segment zooms and the outer ring rotates. Each worked on its first drag; zoom changed 100% to 113%, center pan moved a test stroke, and ring rotation changed the angle to 90°.
- Grease 3D: the first Orbit drag changed the grid and view cube orientation. These checks used separate test tabs and did not modify the user's open drawing.
