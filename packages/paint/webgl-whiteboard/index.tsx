import { onCleanup, onMount } from 'solid-js';
import { Camera } from './camera';
import { Context } from './context';
import { DotManager } from './dot-manager';
import { Keyboard } from './keyboard';
import { Pointer } from './pointer';
import { Renderer } from './renderer';
import { createUiColorPicker } from './ui-color-picker';
import { createUiScaleSlider } from './ui-scale-slider';

export default function WebglWhiteboard() {
  const canvas = (
    <canvas id="canvas" class="touch-none border border-black" width="800" height="600" />
  ) as HTMLCanvasElement;

  onMount(() => {
    const context = new Context(canvas);
    const pointer = new Pointer(context);
    const keyboard = new Keyboard();
    const uiColorPicker = createUiColorPicker(context);
    const uiScaleSlider = createUiScaleSlider(context);
    const camera = new Camera(pointer, keyboard);
    const dotManager = new DotManager(pointer, camera, uiColorPicker, uiScaleSlider);
    const renderer = new Renderer(context.canvas, context, camera, dotManager);

    renderer.setVectorsAttributePointer();
    renderer.setColorsAttributePointer();

    pointer.subscribe('down', renderer.render);
    pointer.subscribe('drag', renderer.render);

    onCleanup(() => {
      pointer.unsubscribe('down', renderer.render);
      pointer.unsubscribe('drag', renderer.render);
      dotManager.destroy();
      keyboard.destroy();
      uiColorPicker.destroy();
      uiScaleSlider.destroy();
      camera.destroy();
    });
  });

  return (
    <>
      <div></div>
      {canvas}
    </>
  );
}
