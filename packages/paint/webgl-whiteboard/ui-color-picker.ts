import { Color } from './color';
import { Context } from './context';

export class UiColorPicker {
  private buttons: HTMLButtonElement[];
  public value: Color;

  constructor(context: Context, colors: Color[]) {
    this.value = colors[0];

    this.buttons = colors.map(this.createButton);

    this.buttons.forEach((button) => context.body.insertBefore(button, context.canvas));
  }

  destroy() {
    this.buttons.forEach((button) => button.remove());
  }

  createButton = (color: Color, index: number) => {
    const button = document.createElement('button');
    button.value = color.toArray().toString();
    button.style.position = 'absolute';
    button.style.width = '30px';
    button.style.height = '30px';
    button.style.padding = '0';
    button.style.top = '5px';
    button.style.background = `rgba(${color.toArray().toString()})`;
    button.style.border = '0px';
    button.style.left = `${200 + index * 35}px`;
    button.onclick = this.onButtonClick;

    return button;
  };

  onButtonClick = (ev: MouseEvent) => {
    const button = ev.target as HTMLButtonElement;
    const args = button.value.split(',').map((v) => parseInt(v, 10));
    const color = new Color(...args);

    this.value = color;
  };
}

export function createUiColorPicker(context: Context) {
  return new UiColorPicker(context, [
    new Color(0, 0, 0),
    new Color(255, 0, 0),
    new Color(0, 255, 0),
    new Color(0, 0, 255)
  ]);
}
