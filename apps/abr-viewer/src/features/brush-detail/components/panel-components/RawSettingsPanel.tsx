export function RawSettingsPanel(props: { settings: unknown }) {
  return (
    <pre class="bg-ps-bg text-ps-text-muted max-h-96 overflow-auto rounded p-4 font-mono text-xs">
      {JSON.stringify(
        props.settings,
        (_, value: unknown) =>
          typeof value === 'bigint' ? `${value}n` : value instanceof Uint8Array ? [...value] : value,
        2
      )}
    </pre>
  );
}
