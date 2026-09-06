import type { FieldApi } from '@modular-forms/solid';
import type { BrushFormValues } from '../../brush-form-schema';
import { ControlSelectField } from '../form-fields/ControlSelectField';
import { SliderField } from '../form-fields/SliderField';

type TransferPanelFormProps = {
  Field: FieldApi<BrushFormValues, undefined>;
};

export function TransferPanelForm(props: TransferPanelFormProps) {
  return (
    <div class="space-y-4">
      <div>
        <props.Field name="transfer.opacityJitter" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Opacity Jitter" />}
        </props.Field>
        <props.Field name="transfer.opacityControl" type="number">
          {(field, fieldProps) => <ControlSelectField field={field} props={fieldProps} label="Control" />}
        </props.Field>
        <props.Field name="transfer.opacityMinimum" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Minimum" />}
        </props.Field>
      </div>

      <div class="border-ps-border border-t pt-4">
        <props.Field name="transfer.flowJitter" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Flow Jitter" />}
        </props.Field>
        <props.Field name="transfer.flowControl" type="number">
          {(field, fieldProps) => <ControlSelectField field={field} props={fieldProps} label="Control" />}
        </props.Field>
        <props.Field name="transfer.flowMinimum" type="number">
          {(field, fieldProps) => <SliderField field={field} props={fieldProps} label="Minimum" />}
        </props.Field>
      </div>
    </div>
  );
}
