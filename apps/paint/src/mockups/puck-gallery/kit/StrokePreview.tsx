import { StrokePreview as PaintStrokePreview } from '../../../features/brush-library/StrokePreview';
import type { Preset } from './catalog';

/** Gallery settings adapter for Paint's shared engine preview. */
export function StrokePreview(props: { preset: Preset; color: string; height?: number; class?: string }) {
  return (
    <PaintStrokePreview
      settings={{
        size: Number(props.preset.values.size ?? 10),
        hardness: Number(props.preset.values.hardness ?? 100) / 100,
        opacity: Number(props.preset.values.opacity ?? 100) / 100,
        flow: Number(props.preset.values.flow ?? 100) / 100,
        pressureSize: props.preset.values.pressureSize === true,
        tool: props.preset.tool === 'eraser' ? 'eraser' : 'brush'
      }}
      color={props.color}
      height={props.height ?? 36}
      class={props.class}
    />
  );
}
