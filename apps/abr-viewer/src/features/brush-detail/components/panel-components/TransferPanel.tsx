import type { StoreSetter } from 'solid-js';
import styles from './TransferPanel.module.css';
import type { BrushFormValues } from '../../brush-form-schema';
import { ControlSelect } from '../editable-input-components/ControlSelect';
import { SliderInput } from '../editable-input-components/SliderInput';

export function TransferPanel(props: { values: BrushFormValues['transfer']; setValues: StoreSetter<BrushFormValues> }) {
  return (
    <div class={styles.spaceY4}>
      <div>
        <SliderInput
          label="Opacity Jitter"
          value={() => props.values.opacityJitter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.transfer.opacityJitter = v;
            })
          }
        />
        <ControlSelect
          label="Control"
          value={() => props.values.opacityControl}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.transfer.opacityControl = v;
            })
          }
        />
        <SliderInput
          label="Minimum"
          value={() => props.values.opacityMinimum}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.transfer.opacityMinimum = v;
            })
          }
        />
      </div>

      <div class="border-ps-border border-t pt-4">
        <SliderInput
          label="Flow Jitter"
          value={() => props.values.flowJitter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.transfer.flowJitter = v;
            })
          }
        />
        <ControlSelect
          label="Control"
          value={() => props.values.flowControl}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.transfer.flowControl = v;
            })
          }
        />
        <SliderInput
          label="Minimum"
          value={() => props.values.flowMinimum}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.transfer.flowMinimum = v;
            })
          }
        />
      </div>
    </div>
  );
}
