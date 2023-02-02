import s from "./DebugWebgl.module.scss";
import {
  clear_webgl,
  create_webgl_context,
  setup_some_webgl_defaults,
  set_clear_color,
  set_size,
} from "./fungi/Context";

export default function () {
  const canvas = (<canvas class={s.debug}></canvas>) as HTMLCanvasElement;

  const gl = create_webgl_context(canvas);
  setup_some_webgl_defaults(gl);
  set_size(gl, canvas, 400, 400);
  set_clear_color(gl, "#4f5f8f");
  clear_webgl(gl);

  return canvas;
}
