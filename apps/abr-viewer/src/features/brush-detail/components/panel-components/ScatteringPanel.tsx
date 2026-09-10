import type { StoreSetter } from 'solid-js';
import styles from './ScatteringPanel.module.css';
import type { BrushFormValues } from '../../brush-form-schema';
import { CheckboxInput } from '../editable-input-components/CheckboxInput';
import { ControlSelect } from '../editable-input-components/ControlSelect';
import { SliderInput } from '../editable-input-components/SliderInput';

export function ScatteringPanel(props: {
  values: BrushFormValues['scattering'];
  setValues: StoreSetter<BrushFormValues>;
}) {
  return (
    <div class={styles.spaceY4}>
      <div>
        <SliderInput
          label="Scatter"
          value={() => props.values.scatter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.scattering.scatter = v;
            })
          }
          max={1000}
        />
        <CheckboxInput
          label="Both Axes"
          checked={() => props.values.bothAxes}
          setChecked={(v: boolean) =>
            props.setValues((draft) => {
              draft.scattering.bothAxes = v;
            })
          }
        />
        <ControlSelect
          label="Control"
          value={() => props.values.control}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.scattering.control = v;
            })
          }
        />
      </div>

      <div class="border-ps-border border-t pt-4">
        <SliderInput
          label="Count"
          value={() => props.values.count}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.scattering.count = v;
            })
          }
          min={1}
          max={16}
          unit=""
        />
        <SliderInput
          label="Count Jitter"
          value={() => props.values.countJitter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.scattering.countJitter = v;
            })
          }
        />
        <ControlSelect
          label="Control"
          value={() => props.values.countControl}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.scattering.countControl = v;
            })
          }
        />
      </div>
    </div>
  );
}
