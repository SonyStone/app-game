import type { FieldApi } from '@modular-forms/solid';
import { Show } from 'solid-js';
import type { BrushWithPreview } from '~/lib/abr';
import type { BrushFormValues } from '../../brush-form-schema';
import { CheckboxField } from '../form-fields/CheckboxField';
import { SliderField } from '../form-fields/SliderField';

type BrushTipPanelFormProps = {
  brush: BrushWithPreview;
  Field: FieldApi<BrushFormValues, undefined>;
  onDownload: () => void;
  downloading: boolean;
};

export function BrushTipPanelForm(props: BrushTipPanelFormProps) {
  return (
    <div class="grid gap-6 md:grid-cols-2">
      {/* Preview */}
      <div class="space-y-4">
        <div class="checkered-bg relative mx-auto aspect-square max-w-64 overflow-hidden rounded-lg">
          <Show
            when={props.brush.imageDataUrl}
            fallback={
              <div class="absolute inset-0 flex items-center justify-center">
                <p class="text-ps-text-muted text-sm">
                  {props.brush.type === 'computed' ? 'Computed brush' : 'No preview'}
                </p>
              </div>
            }
          >
            <props.Field name="angle">
              {(angleField) => (
                <props.Field name="flipX">
                  {(flipXField) => (
                    <props.Field name="flipY">
                      {(flipYField) => (
                        <img
                          src={props.brush.imageDataUrl}
                          alt={props.brush.name}
                          class="absolute inset-0 h-full w-full object-contain p-2"
                          style={{
                            transform: `rotate(${angleField.value ?? 0}deg) scaleX(${flipXField.value ? -1 : 1}) scaleY(${flipYField.value ? -1 : 1})`
                          }}
                        />
                      )}
                    </props.Field>
                  )}
                </props.Field>
              )}
            </props.Field>
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
        <props.Field name="diameter" type="number">
          {(field, fieldProps) => (
            <SliderField field={field} props={fieldProps} label="Size" min={1} max={2500} unit=" px" />
          )}
        </props.Field>

        <div class="ml-8 flex items-center gap-4 py-2">
          <props.Field name="flipX" type="boolean">
            {(field, fieldProps) => <CheckboxField field={field} props={fieldProps} label="Flip X" />}
          </props.Field>
          <props.Field name="flipY" type="boolean">
            {(field, fieldProps) => <CheckboxField field={field} props={fieldProps} label="Flip Y" />}
          </props.Field>
        </div>

        <props.Field name="angle" type="number">
          {(field, fieldProps) => (
            <SliderField field={field} props={fieldProps} label="Angle" min={-180} max={180} unit="°" />
          )}
        </props.Field>

        <props.Field name="roundness" type="number">
          {(field, fieldProps) => (
            <SliderField field={field} props={fieldProps} label="Roundness" min={0} max={100} unit="%" />
          )}
        </props.Field>

        <Show when={props.brush.type === 'computed'}>
          <props.Field name="hardness" type="number">
            {(field, fieldProps) => (
              <SliderField field={field} props={fieldProps} label="Hardness" min={0} max={100} unit="%" />
            )}
          </props.Field>
        </Show>

        <div class="border-ps-border mt-4 border-t pt-4">
          <props.Field name="spacing" type="number">
            {(field, fieldProps) => (
              <SliderField field={field} props={fieldProps} label="Spacing" min={1} max={1000} unit="%" />
            )}
          </props.Field>
        </div>
      </div>
    </div>
  );
}
