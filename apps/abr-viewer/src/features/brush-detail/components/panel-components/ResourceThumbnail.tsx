import { createEffect, onSettled } from 'solid-js';
import type { BrushTipImage } from '../../../../lib/abr';
import { attachPreview } from '../../../brush-preview/client';
import type { PreviewResourceSource } from '../../../brush-preview/resources';
import { brushToFormValues } from '../../brush-form-schema';

/** Lazily renders a tip or texture on the shared worker; hidden picker items don't decode resources. */
export function ResourceThumbnail(props: {
  label: string;
  kind: 'tip' | 'dual' | 'pattern';
  tip?: BrushTipImage;
  hardness?: number;
  resources?: PreviewResourceSource;
}) {
  let canvas!: HTMLCanvasElement;
  let refresh = () => {};
  createEffect(
    () => [props.kind, props.tip, props.hardness, props.resources],
    () => refresh()
  );
  onSettled(() => {
    const connection = attachPreview(canvas);
    let visible = false;
    refresh = () => {
      if (!visible) return;
      connection.update(
        {
          values: brushToFormValues({
            id: 'swatch',
            name: '',
            type: 'computed',
            settings: {},
            spacing: 25,
            hardness: props.hardness ?? 100
          }),
          width: 96,
          height: 96,
          dpr: 1,
          color: '#ffffff',
          background: '#282828',
          opacity: 1,
          flow: 1,
          resourcePreview: props.kind
        },
        props.tip,
        1,
        props.resources
      );
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) refresh();
      else connection.pause();
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      connection.dispose();
      refresh = () => {};
    };
  });
  return (
    <canvas
      ref={canvas}
      class="abr-resource-thumbnail"
      role="img"
      aria-label={props.label}
      data-preview-state="waiting"
    />
  );
}
