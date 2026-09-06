# ABR Brush Editor - Web Implementation

This project is a browser-based brush editor for Adobe Photoshop `.abr` files.

## Project Structure

- **`packages/abr-parser/`** - ABR file parser/writer library with full documentation
  - See [`packages/abr-parser/docs/`](../packages/abr-parser/docs/README.md) for brush settings documentation
  - See [`packages/abr-parser/task-prompt.md`](../packages/abr-parser/task-prompt.md) for implementation tasks
- **`apps/web/`** - SolidJS web application

## ✅ Completed Features

### Parser

- [x] Parse ABR files (v6, v9, v10)
- [x] Write/save ABR files
- [x] Roundtrip tests (parse → write → parse)

### Web Editor

- [x] Load ABR files
- [x] View brush list with previews
- [x] Rename brushes

---

## 🚧 Features To Implement

### Brush Organization

#### Brush Groups

- [ ] Create groups and sub-groups
- [ ] Edit/rename groups
- [ ] Drag-and-drop sorting (brushes & groups)
- [ ] Move brushes between groups/sub-groups
- [ ] Consider: Global brush list to move brushes between `.abr`'s groups/sub-groups

**Libraries to evaluate:** `@thisbeyond/solid-dnd`, `solidjs-use`

#### Reset Functionality

- [ ] Reset button for each input or panel
- [ ] Define default values: from loaded `.abr` vs input defaults?

---

### Brush Settings UI

Implement UI panels for each brush setting. See documentation in `packages/abr-parser/docs/settings/`:

- [ ] Brush Tip Shape panel
- [ ] Shape Dynamics panel
- [ ] Scattering panel
- [ ] Texture panel
- [ ] Dual Brush panel
- [ ] Color Dynamics panel
- [ ] Transfer panel
- [ ] Brush Pose panel

Quick toggle checkboxes (sidebar):

- [ ] Noise
- [ ] Wet Edges
- [ ] Build-up
- [ ] Smoothing
- [ ] Protect Texture

**Note:** These appear in sidebar but have no expanded panel.

---

### Specific Settings To Implement

#### Spacing Checkbox

- Like in Photoshop, allow disabling spacing for speed-based stamp placement

#### Brush Tip Image

- [ ] View current brush tip image
- [ ] Replace/upload new brush tip image
- [ ] For Dual Brush: upload secondary brush tip

#### Preset Save Options

- [ ] `Capture Brush Size in Preset`
- [ ] `Include Tool Settings`
- [ ] `Include Color` (Brush Tool, Pencil Tool, Mixer Brush Tool only)

---

## Implementation Priority

### Phase 1: Core Brush Editor

1. Brush Tip Shape (all settings)
2. Toolbar: Opacity, Flow, Size
3. Shape Dynamics
4. Transfer

### Phase 2: Advanced Dynamics

1. Scattering
2. Texture
3. Dual Brush
4. Color Dynamics

### Phase 3: Organization & Polish

1. Brush groups & drag-drop
2. Brush Pose
3. Smoothing with options
4. Symmetry

### Phase 4: Multi-Tool Support

1. Pencil Tool
2. Eraser Tool
3. Clone Stamp Tool
4. Remaining tools

---

## Documentation

All brush settings documentation has been consolidated in the abr-parser package:

- **Settings Reference:** [`packages/abr-parser/docs/`](../packages/abr-parser/docs/README.md)
- **Tool Panel Matrix:** [`packages/abr-parser/docs/tools/panel-matrix.md`](../packages/abr-parser/docs/tools/panel-matrix.md)
- **TypeScript Types:** [`packages/abr-parser/src/types.ts`](../packages/abr-parser/src/types.ts)
- **Descriptor Keys:** [`packages/abr-parser/src/descriptor-keys.ts`](../packages/abr-parser/src/descriptor-keys.ts)
