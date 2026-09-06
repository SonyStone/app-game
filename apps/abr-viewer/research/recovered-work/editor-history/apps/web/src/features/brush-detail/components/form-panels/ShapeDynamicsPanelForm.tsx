import type { FieldApi } from '@modular-forms/solid';
import type { BrushFormValues } from '../../brush-form-schema';
import { CheckboxField } from '../form-fields/CheckboxField';
import { ControlSelectField } from '../form-fields/ControlSelectField';
import { SliderField } from '../form-fields/SliderField';

type ShapeDynamicsPanelFormProps = {
  Field: FieldApi<BrushFormValues, undefined>;
};

export function ShapeDynamicsPanelForm(props: ShapeDynamicsPanelFormProps) {
  return (
    <div class="space-y-4">
      <div>
        <props.Field name="shapeDynamics.sizeJitter" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Size Jitter" />}
        </props.Field>
        <props.Field name="shapeDynamics.sizeControl" type="number">
          {(field, fieldProps) => <ControlSelectField field={field} props={fieldProps} label="Control" />}
        </props.Field>
        <props.Field name="shapeDynamics.sizeMinimum" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Minimum" />}
        </props.Field>
      </div>

      <props.Field name="shapeDynamics.minimumDiameter" type="number">
        {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Minimum Diameter" />}
      </props.Field>
      <props.Field name="shapeDynamics.tiltScale" type="number">
        {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Tilt Scale" max={200} />}
      </props.Field>

      <div class="border-ps-border border-t pt-4">
        <props.Field name="shapeDynamics.angleJitter" type="number">
          {(field, fieldProps) => (
            <SliderField field={field} props={fieldProps} label="Angle Jitter" unit="°" max={360} />
          )}
        </props.Field>
        <props.Field name="shapeDynamics.angleControl" type="number">
          {(field, fieldProps) => <ControlSelectField field={field} props={fieldProps} label="Control" />}
        </props.Field>
      </div>

      <div class="border-ps-border border-t pt-4">
        <props.Field name="shapeDynamics.roundnessJitter" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Roundness Jitter" />}
        </props.Field>
        <props.Field name="shapeDynamics.roundnessControl" type="number">
          {(field, fieldProps) => <ControlSelectField field={field} props={fieldProps} label="Control" />}
        </props.Field>
        <props.Field name="shapeDynamics.roundnessMinimum" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Minimum" />}
        </props.Field>
      </div>

      <div class="border-ps-border flex items-center gap-6 border-t pt-4">
        <props.Field name="shapeDynamics.flipXJitter" type="boolean">
          {(field, fieldProps) => <CheckboxField field={field} props={fieldProps} label="Flip X Jitter" />}
        </props.Field>
        <props.Field name="shapeDynamics.flipYJitter" type="boolean">
          {(field, fieldProps) => <CheckboxField field={field} props={fieldProps} label="Flip Y Jitter" />}
        </props.Field>
      </div>

      <props.Field name="shapeDynamics.brushProjection" type="boolean">
        {(field, fieldProps) => <CheckboxField field={field} props={fieldProps} label="Brush Projection" />}
      </props.Field>
    </div>
  );
}
