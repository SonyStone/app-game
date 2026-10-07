import type { JSX } from '@solidjs/web';

/** A labelled settings row: the label text, then its control. */
export function SettingsField(props: { readonly children: JSX.Element }) {
  return <label class="grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] items-center gap-2.5">{props.children}</label>;
}

/** A checkbox row: the checkbox, then its label text. */
export function CheckboxField(props: { readonly children: JSX.Element }) {
  return <label class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">{props.children}</label>;
}

/** The settings text/number/color input style; `class` adds to it. */
export function FormInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      class={[
        "block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]",
        props.class
      ]}
    />
  );
}

/** The settings select style. */
export function FormSelect(props: JSX.SelectHTMLAttributes<HTMLSelectElement> & { readonly children: JSX.Element }) {
  return (
    <select
      {...props}
      class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
    >
      {props.children}
    </select>
  );
}
