type CheckboxFieldProps = {
  checked: boolean | undefined;
  name: string;
  inputRef: (el: HTMLInputElement) => void;
  onInput: (e: Event) => void;
  onChange: (e: Event) => void;
  onBlur: (e: Event) => void;
  label: string;
};

export function CheckboxField(props: CheckboxFieldProps) {
  return (
    <label class="flex cursor-pointer items-center gap-2 py-1">
      <input
        type="checkbox"
        checked={props.checked ?? false}
        ref={props.inputRef}
        onInput={props.onInput}
        onChange={props.onChange}
        onBlur={props.onBlur}
        name={props.name}
        class="border-ps-border bg-ps-bg-dark checked:bg-ps-accent h-4 w-4 rounded"
      />
      <span class="text-ps-text text-sm">{props.label}</span>
    </label>
  );
}
