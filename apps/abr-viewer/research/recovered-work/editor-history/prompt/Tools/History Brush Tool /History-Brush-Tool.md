# History Brush Tool

A tool that paints with pixels from a selected history state, allowing you to selectively restore parts of an image to a previous state.

## Toolbar Options

![History Brush Tool Toolbar](./History%20Brush%20Tool%20-%20Toolbar.png)

| Setting            | Type           | Range                                    | Default | Description                                |
| ------------------ | -------------- | ---------------------------------------- | ------- | ------------------------------------------ |
| **History Source** | Icon/button    | -                                        | -       | Opens History panel to select source state |
| **Mode**           | Dropdown       | [Blend Modes](../_Common/Blend-Modes.md) | Normal  | Painting blend mode                        |
| **Opacity**        | Slider + Input | 0% - 100%                                | 100%    | Overall stroke opacity                     |
| **Flow**           | Slider + Input | 0% - 100%                                | 100%    | Paint flow rate                            |
| **Airbrush Mode**  | Toggle button  | On/Off                                   | Off     | Enable airbrush-style buildup              |
| **Angle**          | Display        | 0° - 360°                                | 0°      | Shows current brush angle                  |

### Differences from Clone Stamp

| Feature           | Clone Stamp            | History Brush |
| ----------------- | ---------------------- | ------------- |
| Source            | Alt+Click sample point | History state |
| Aligned option    | ✅ Yes                 | ❌ No         |
| Sample dropdown   | ✅ Yes                 | ❌ No         |
| Smoothing toolbar | ❌ No                  | ❌ No         |

## How It Works

1. **Select History Source**: In the History panel, click the empty box next to a history state to set it as the source
2. **Paint**: Brush over areas to restore them to how they looked at that history state
3. **Result**: Pixels are replaced with the corresponding pixels from the source state

### Use Cases

- Selectively undo changes to specific areas
- Restore details after over-editing
- Create before/after effects
- Fix localized mistakes without global undo

## Brush Settings Panel

### Available Panels

| Panel           | Checkbox | Lock | Status                                              |
| --------------- | -------- | ---- | --------------------------------------------------- |
| Brush Tip Shape | -        | -    | ✅ [Brush Tip Shape](../_Common/Brush-Tip-Shape.md) |
| Shape Dynamics  | ✅       | 🔒   | ✅ [Shape Dynamics](../_Common/Shape-Dynamics.md)   |
| Scattering      | ✅       | 🔒   | ✅ [Scattering](../_Common/Scattering.md)           |
| Texture         | ✅       | 🔒   | ✅ [Texture](../_Common/Texture.md)                 |
| Dual Brush      | ✅       | 🔒   | ✅ [Dual Brush](../_Common/Dual-Brush.md)           |
| Color Dynamics  | -        | -    | ❌ DISABLED                                         |
| Transfer        | ✅       | 🔒   | ✅ [Transfer](../_Common/Transfer.md)               |
| Brush Pose      | ✅       | 🔒   | ✅ [Brush Pose](../_Common/Brush-Pose.md)           |

### Quick Toggles

| Setting         | Available | Description                      |
| --------------- | --------- | -------------------------------- |
| Noise           | ✅        | Adds grain to brush edges        |
| Wet Edges       | ✅        | Watercolor edge effect           |
| Build-up        | ✅        | Enable airbrush-style buildup    |
| Smoothing       | ✅        | Enable stroke smoothing          |
| Protect Texture | ✅        | Use same texture for all brushes |

## Why Color Dynamics Is Disabled

### Color Dynamics: ❌

- History Brush restores existing pixels from history
- It doesn't apply foreground/background colors
- Color jitter would have no meaning (same as Clone Stamp)

## Transfer Panel

Standard Transfer options (no Wetness/Mix):

| Setting        | Status      | Notes                      |
| -------------- | ----------- | -------------------------- |
| Opacity Jitter | ✅ ENABLED  | Controls opacity variation |
| Flow Jitter    | ✅ ENABLED  | Controls flow variation    |
| Wetness Jitter | ❌ DISABLED | Mixer Brush only           |
| Mix Jitter     | ❌ DISABLED | Mixer Brush only           |

## History Panel Integration

The History Brush requires the History panel to function:

### History Panel Structure

```
┌─ History ──────────────────────────┐
│                                    │
│  📷 Snapshot 1                     │  ← Snapshots (manual saves)
│  📷 Snapshot 2                     │
│  ─────────────────────────────     │
│  ☐ Open                            │  ← Initial state
│  ☐ Brush Tool                      │  ← History states
│  ☐ Brush Tool                      │
│  🖌️ Levels                         │  ← Source indicator (brush icon)
│  ☐ Brush Tool                      │
│  ☐ Gaussian Blur        ◄──────────│  ← Current state (highlighted)
│                                    │
└────────────────────────────────────┘
```

### Setting History Source

1. **Open History panel:** Window > History
2. **Locate desired state:** Scroll to find the state you want to paint from
3. **Click source checkbox:** Click the empty box to the LEFT of the state name
4. **Verify selection:** A brush icon (🖌️) appears indicating it's the source
5. **Paint:** Use History Brush to restore pixels from that state

### Snapshots vs History States

| Type              | Description                     | Persistence                       |
| ----------------- | ------------------------------- | --------------------------------- |
| **Snapshot**      | Manual save of document state   | Persists until document closes    |
| **History State** | Automatic record of each action | Limited by history states setting |

**Creating a Snapshot:**

- Click camera icon at bottom of History panel
- Or: History panel menu > New Snapshot
- Useful for saving a "checkpoint" to paint from later

### History State Requirements

- Source state must exist in history
- If history is cleared or document is reopened, source is lost
- Some operations may make certain states unavailable as source
- Default history states limit: 20-1000 (set in Preferences > Performance)

### Source State Indicator

| Icon         | Meaning                              |
| ------------ | ------------------------------------ |
| ☐ (empty)    | Not selected as source               |
| 🖌️ (brush)   | Selected as History Brush source     |
| 🎨 (palette) | Selected as Art History Brush source |

## Keyboard Shortcuts

| Shortcut      | Action                    |
| ------------- | ------------------------- |
| `Y`           | Select History Brush Tool |
| `[`           | Decrease brush size       |
| `]`           | Increase brush size       |
| `0-9`         | Set opacity               |
| `Shift + 0-9` | Set flow                  |

## Implementation Notes

### History State Sampling

```typescript
interface HistoryState {
  id: string;
  name: string;
  snapshot: ImageData; // Full canvas state at that point
  timestamp: number;
}

function historyBrushStroke(brushX: number, brushY: number, sourceState: HistoryState): Color {
  // Sample directly from the history state's snapshot
  // Position is absolute - same X,Y coordinates
  return sourceState.snapshot.getPixel(brushX, brushY);
}
```

### Key Difference from Clone Stamp

| Aspect   | Clone Stamp                       | History Brush                   |
| -------- | --------------------------------- | ------------------------------- |
| Source   | Relative offset from sample point | Absolute position in history    |
| Movement | Source moves with brush           | Source is fixed canvas position |
| Storage  | Sample point coordinates          | Full image snapshot             |

### Position Mapping

```
Current canvas position (100, 200)
  ↓
History state position (100, 200)
  ↓
Pixel color from history
```

The History Brush always samples from the **same coordinates** in the history state - there's no offset or alignment concept.

### Web Editor Considerations

For a web-based editor, History Brush requires:

1. **History system**: Store snapshots of canvas states
2. **Memory management**: History states can be large (full canvas)
3. **History panel UI**: Show states, allow source selection
4. **Snapshot storage**: Consider compression or delta storage

### Limitations

- Cannot paint if source state doesn't exist
- Document size changes may invalidate history
- Layer structure changes may cause issues
- Memory intensive for large documents with many states
