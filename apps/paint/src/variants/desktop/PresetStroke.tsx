import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Result } from 'neverthrow';
import type { BrushPreset } from '../../features/brush-library';
import { StrokePreview } from '../procreate/StrokePreview';

/** Library adapter for the shared Paint preview, including every resource referenced by an imported preset. */
export function PresetStroke(props: {
  preset: BrushPreset;
  resources: (preset: BrushPreset) => Promise<Result<BrushResource[], unknown>>;
  color: string;
  height: number;
  /** Sample background; omitted to keep the shared preview default. */
  background?: string;
  /** Samples in `color` even when the preset saves its own color. */
  overrideColor?: boolean;
}) {
  return (
    <StrokePreview
      settings={props.preset.settings}
      color={props.color}
      background={props.background}
      colorOverride={props.overrideColor ? props.color : undefined}
      height={props.height}
      resources={async () => {
        const result = await props.resources(props.preset);
        if (result.isErr()) {
          throw result.error;
        }
        return result.value;
      }}
    />
  );
}
