import type { FieldApi } from '@modular-forms/solid';
import type { BrushFormValues } from '../../brush-form-schema';
import { CheckboxField } from '../form-fields/CheckboxField';
import { ControlSelectField } from '../form-fields/ControlSelectField';
import { SliderField } from '../form-fields/SliderField';

type ScatteringPanelFormProps = {
  Field: FieldApi<BrushFormValues, undefined>;
};

export function ScatteringPanelForm(props: ScatteringPanelFormProps) {
  return (
    <div class="space-y-4">
      <div>
        <props.Field name="scattering.scatter" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Scatter" max={1000} />}
        </props.Field>
        <props.Field name="scattering.bothAxes" type="boolean">
          {(field, fieldProps) => <CheckboxField field={field} props={fieldProps} label="Both Axes" />}
        </props.Field>
        <props.Field name="scattering.control" type="number">
          {(field, fieldProps) => <ControlSelectField field={field} props={fieldProps} label="Control" />}
        </props.Field>
      </div>

      <div class="border-ps-border border-t pt-4">
        <props.Field name="scattering.count" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Count" min={1} max={16} unit="" />}
        </props.Field>
        <props.Field name="scattering.countJitter" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Count Jitter" />}
        </props.Field>
        <props.Field name="scattering.countControl" type="number">
          {(field, fieldProps) => <ControlSelectField field={field} props={fieldProps} label="Control" />}
        </props.Field>
      </div>
    </div>
  );
}
