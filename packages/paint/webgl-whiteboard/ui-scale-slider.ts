import { Context } from './context';

interface UiScaleSliderOptions {
  min: number;
  max: number;
}
export class UiScaleSlider {
  public value: number;
  private element: HTMLInputElement;
  private min: number;
  private max: number;

  constructor(context: Context, opts: UiScaleSliderOptions) {
    this.min = opts.min;
    this.max = opts.max;
    this.value = (opts.min + opts.max) / 2;

    this.element = this.createSlider();

    context.body.insertBefore(this.element, context.canvas);
  }

  destroy() {
    this.element.remove();
  }

  createSlider = () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.style.position = 'absolute';
    slider.style.top = '10px';
    slider.style.left = '10px';
    slider.min = this.min.toString();
    slider.max = this.max.toString();
    slider.value = this.value.toString();
    slider.onchange = this.onSliderChange;

    return slider;
  };

  onSliderChange = (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    this.value = parseInt(input.value, 10);
  };
}

export const createUiScaleSlider = (context: Context) => {
  return new UiScaleSlider(context, {
    min: 10,
    max: 50
  });
};
