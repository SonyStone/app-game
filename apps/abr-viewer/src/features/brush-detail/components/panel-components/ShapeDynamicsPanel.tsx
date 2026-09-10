import type { StoreSetter } from 'solid-js';
import styles from './ShapeDynamicsPanel.module.css';
import type { BrushFormValues } from '../../brush-form-schema';
import { CheckboxInput } from '../editable-input-components/CheckboxInput';
import { ControlSelect } from '../editable-input-components/ControlSelect';
import { SliderInput } from '../editable-input-components/SliderInput';

export function ShapeDynamicsPanel(props: {
  values: BrushFormValues['shapeDynamics'];
  setValues: StoreSetter<BrushFormValues>;
}) {
  return (
    <div class={styles.spaceY4}>
      <div>
        <SliderInput
          label="Size Jitter"
          value={() => props.values.sizeJitter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.sizeJitter = v;
            })
          }
        />
        <ControlSelect
          label="Control"
          value={() => props.values.sizeControl}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.sizeControl = v;
            })
          }
        />
        <SliderInput
          label="Minimum"
          value={() => props.values.sizeMinimum}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.sizeMinimum = v;
            })
          }
        />
      </div>

      <SliderInput
        label="Minimum Diameter"
        value={() => props.values.minimumDiameter}
        setValue={(v: number) =>
          props.setValues((draft) => {
            draft.shapeDynamics.minimumDiameter = v;
          })
        }
      />
      <SliderInput
        label="Tilt Scale"
        value={() => props.values.tiltScale}
        setValue={(v: number) =>
          props.setValues((draft) => {
            draft.shapeDynamics.tiltScale = v;
          })
        }
        max={200}
      />

      <div class="border-ps-border border-t pt-4">
        <SliderInput
          label="Angle Jitter"
          value={() => props.values.angleJitter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.angleJitter = v;
            })
          }
          unit="°"
          max={360}
        />
        <ControlSelect
          label="Control"
          value={() => props.values.angleControl}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.angleControl = v;
            })
          }
        />
      </div>

      <div class="border-ps-border border-t pt-4">
        <SliderInput
          label="Roundness Jitter"
          value={() => props.values.roundnessJitter}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.roundnessJitter = v;
            })
          }
        />
        <ControlSelect
          label="Control"
          value={() => props.values.roundnessControl}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.roundnessControl = v;
            })
          }
        />
        <SliderInput
          label="Minimum"
          value={() => props.values.roundnessMinimum}
          setValue={(v: number) =>
            props.setValues((draft) => {
              draft.shapeDynamics.roundnessMinimum = v;
            })
          }
        />
      </div>

      <div class="border-ps-border flex items-center gap-6 border-t pt-4">
        <CheckboxInput
          label="Flip X Jitter"
          checked={() => props.values.flipXJitter}
          setChecked={(v: boolean) =>
            props.setValues((draft) => {
              draft.shapeDynamics.flipXJitter = v;
            })
          }
        />
        <CheckboxInput
          label="Flip Y Jitter"
          checked={() => props.values.flipYJitter}
          setChecked={(v: boolean) =>
            props.setValues((draft) => {
              draft.shapeDynamics.flipYJitter = v;
            })
          }
        />
      </div>

      <CheckboxInput
        label="Brush Projection"
        checked={() => props.values.brushProjection}
        setChecked={(v: boolean) =>
          props.setValues((draft) => {
            draft.shapeDynamics.brushProjection = v;
          })
        }
      />
    </div>
  );
}
