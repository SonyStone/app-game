import { For, Match, Show, Switch, type StoreSetter } from 'solid-js';
import type { BrushFormValues } from '../../brush-form-schema';
import { settingGroups } from '../../settings-fields';
import { CheckboxInput } from '../editable-input-components/CheckboxInput';
import { SliderInput } from '../editable-input-components/SliderInput';

/** Shared compact controls, driven by the same descriptor bindings as import/export. */
export function SettingsPanel(props: {
  group: keyof typeof settingGroups;
  values: BrushFormValues;
  setValues: StoreSetter<BrushFormValues>;
  mixer?: boolean;
}) {
  const fields = () => Object.entries(settingGroups[props.group]);
  const value = (key: string) => (props.values[props.group] as Record<string, unknown>)[key];
  const update = (key: string, next: unknown) =>
    props.setValues((draft) => {
      (draft[props.group] as Record<string, unknown>)[key] = next;
    });
  const visible = (key: string) => {
    // The dual-tip picker carries its source transform; Photoshop has no separate controls here.
    if (props.group === 'dualBrush' && ['angle', 'roundness', 'flipX', 'flipY'].includes(key)) return false;
    if (
      props.group === 'erodible' &&
      ['cutoff', 'granularity', 'streakiness', 'splatSize', 'splatCount'].includes(key) &&
      props.values.tipVariant === 0
    )
      return false;
    if (['patternId', 'patternName', 'tipId', 'sizeMinimum'].includes(key)) return false;
    if (/^(wetness|mix)/.test(key) && !props.mixer) return false;
    if (key.toLowerCase().endsWith('fade')) {
      const prefix = key.slice(0, -4);
      return value(prefix ? `${prefix}Control` : 'control') === 1;
    }
    return true;
  };
  return (
    <div class="abr-setting-fields">
      <For each={fields()}>
        {([key, field]) => (
          <Show when={visible(key)}>
            <Switch>
              <Match when={field.kind === 'boolean'}>
                <CheckboxInput
                  label={field.label}
                  checked={() => value(key) === true}
                  setChecked={(next) => update(key, next)}
                />
              </Match>
              <Match when={field.kind === 'control' || field.kind === 'choice'}>
                <label class="abr-setting-select">
                  <span>{field.label}</span>
                  <select
                    aria-label={field.label}
                    value={String(value(key))}
                    onChange={(event) =>
                      update(
                        key,
                        field.kind === 'control' ? Number(event.currentTarget.value) : event.currentTarget.value
                      )
                    }
                  >
                    <Show when={!field.options?.some((option) => option.value === value(key))}>
                      <option value={String(value(key))}>Imported ({String(value(key))})</option>
                    </Show>
                    <For each={field.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
                  </select>
                </label>
              </Match>
              <Match when={field.kind === 'number'}>
                <SliderInput
                  label={field.label}
                  value={() => Number(value(key))}
                  setValue={(next) => update(key, next)}
                  min={field.min}
                  max={field.max}
                  unit={field.unit === '#Prc' ? '%' : field.unit === '#Pxl' ? 'px' : key === 'rotation' ? '°' : ''}
                />
              </Match>
            </Switch>
          </Show>
        )}
      </For>
    </div>
  );
}
