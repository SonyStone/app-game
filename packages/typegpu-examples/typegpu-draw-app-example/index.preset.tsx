/**
 * TypeGPU Drawing App - Example Entry Point
 *
 * This file demonstrates how to use the TypeGPU Drawing Framework presets.
 *
 * Available presets:
 * - SimpleDrawApp: Minimal drawing with basic brush controls
 * - FullDrawApp: Full-featured with layers, blend modes, and all controls
 *
 * You can also create custom configurations using the factory functions:
 * - createSimpleDrawApp(config)
 * - createFullDrawApp(config)
 *
 * Or build your own app using the framework components directly.
 */

// Option 1: Use the default full-featured drawing app
export { FullDrawApp as default } from './presets/FullDrawApp';

// Option 2: Use a simple drawing app (uncomment to use)
// export { SimpleDrawApp as default } from './presets/SimpleDrawApp';

// Option 3: Create a custom configured app (uncomment to use)
// import { createFullDrawApp } from './presets/FullDrawApp';
// export default createFullDrawApp({
//   canvasWidth: 2000,
//   canvasHeight: 2000,
//   initialColor: '#3366ff',
//   initialSize: 20,
//   showLayerPanel: true
// });

// Option 4: Build a completely custom app using framework components
// See ./presets/SimpleDrawApp.tsx and ./presets/FullDrawApp.tsx for examples
