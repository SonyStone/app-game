export function RawSettingsPanel(props: { settings: Record<string, unknown> }) {
  return (
    <pre class="bg-ps-bg text-ps-text-muted max-h-96 overflow-auto rounded p-4 font-mono text-xs">
      {JSON.stringify(props.settings, null, 2)}
    </pre>
  );
}
