import type { StoreSetter } from 'solid-js';
import { createMemo, Show } from 'solid-js';
import type { BrushWithPreview } from '../../../../lib/abr';
import { brushTipToDataUrl } from '../../../../lib/abr';
import styles from './BrushTipPanel.module.css';
import { generateComputedBrushTip } from '../../../brush-preview/stroke';
import type { BrushFormValues } from '../../brush-form-schema';
import { AngleRoundnessControl } from '../editable-input-components/AngleRoundnessControl';
import { CheckboxInput } from '../editable-input-components/CheckboxInput';
import { NonLinearSliderInput } from '../editable-input-components/NonLinearSliderInput';
import { SliderInput } from '../editable-input-components/SliderInput';

export function BrushTipPanel(props: {
  brush: BrushWithPreview;
  values: BrushFormValues;
  setValues: StoreSetter<BrushFormValues>;
  onDownload: () => void;
  downloading: boolean;
}) {
  const tip = createMemo(
    () =>
      props.brush.imageDataUrl ??
      (props.values.tipKind === 'computedBrush'
        ? brushTipToDataUrl(generateComputedBrushTip(96, props.values.hardness))
        : undefined)
  );
  return (
    <div class={styles.tipPanel}>
      {/* Preview */}
      <div class={styles.tipImage}>
        <div class={`${styles.checkeredBg} relative mx-auto aspect-square max-w-64 overflow-hidden rounded-lg`}>
          <Show
            when={tip()}
            fallback={
              <div class="absolute inset-0 flex items-center justify-center">
                <p class="text-ps-text-muted text-sm">
                  {props.values.tipKind === 'computedBrush' ? 'Computed brush' : 'No preview'}
                </p>
              </div>
            }
          >
            <img
              src={tip()}
              alt={props.brush.name}
              class="absolute inset-0 h-full w-full object-contain p-2"
              style={{
                transform: `rotate(${props.values.angle}deg) scaleX(${props.values.flipX ? -1 : 1}) scaleY(${((props.values.flipY ? -1 : 1) * props.values.roundness) / 100})`
              }}
            />
          </Show>
        </div>

        <Show when={props.brush.brushTip}>
          <button
            onClick={props.onDownload}
            disabled={props.downloading}
            class="bg-ps-accent hover:bg-ps-accent-hover w-full rounded px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {props.downloading ? 'Downloading...' : 'Download PNG'}
          </button>
        </Show>
      </div>

      {/* Settings */}
      <div class="space-y-1">
        <SliderInput
          label="Size"
          value={() => props.values.diameter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.diameter = v;
            })
          }
          min={1}
          max={2500}
          unit=" px"
        />

        <div class="ml-8 flex items-center gap-4 py-2">
          <CheckboxInput
            label="Flip X"
            checked={() => props.values.flipX}
            setChecked={(v: boolean) =>
              props.setValues((draft) => {
                draft.flipX = v;
              })
            }
          />
          <CheckboxInput
            label="Flip Y"
            checked={() => props.values.flipY}
            setChecked={(v: boolean) =>
              props.setValues((draft) => {
                draft.flipY = v;
              })
            }
          />
        </div>

        <div class="flex flex-wrap items-start gap-4">
          <div class="min-w-40 flex-1">
            <SliderInput
              label="Angle"
              value={() => props.values.angle}
              setValue={(v: number) =>
                props.setValues((draft) => {
                  draft.angle = v;
                })
              }
              min={-180}
              max={180}
              unit="°"
            />

            <SliderInput
              label="Roundness"
              value={() => props.values.roundness}
              setValue={(v: number) =>
                props.setValues((draft) => {
                  draft.roundness = v;
                })
              }
              min={1}
              max={100}
              unit="%"
            />
          </div>

          {/* Interactive angle/roundness control */}
          <div class="flex-shrink-0 pt-1">
            <AngleRoundnessControl
              angle={() => props.values.angle}
              setAngle={(v) =>
                props.setValues((draft) => {
                  draft.angle = v;
                })
              }
              roundness={() => props.values.roundness}
              setRoundness={(v) =>
                props.setValues((draft) => {
                  draft.roundness = v;
                })
              }
              size={96}
            />
          </div>
        </div>

        <Show when={props.values.tipKind === 'computedBrush'}>
          <SliderInput
            label="Hardness"
            value={() => props.values.hardness}
            setValue={(v: number) =>
              props.setValues((draft) => {
                draft.hardness = v;
              })
            }
            min={0}
            max={100}
            unit="%"
          />
        </Show>

        <div class={`border-ps-border ${styles.mt4} border-t pt-4`}>
          <CheckboxInput
            label="Use Spacing"
            checked={() => props.values.spacingEnabled}
            setChecked={(value) =>
              props.setValues((draft) => {
                draft.spacingEnabled = value;
              })
            }
          />
          <NonLinearSliderInput
            label="Spacing"
            value={() => props.values.spacing}
            setValue={(v: number) =>
              props.setValues((draft) => {
                draft.spacing = v;
              })
            }
            min={1}
            breakpoint={100}
            max={1000}
            unit="%"
          />
        </div>
      </div>
    </div>
  );
}
