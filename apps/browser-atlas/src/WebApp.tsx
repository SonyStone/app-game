import { BrowserAtlas } from './App';
import { createMockExplorerBackend } from './backends/mock/createMockExplorerBackend';

/** Website composition using the same feature contract as the browser extension. */
export default function WebBrowserAtlas() {
  return (
    <BrowserAtlas
      backend={createMockExplorerBackend()}
      backendLabel="Chrome (mock)"
      additionalBrowserBackends={[
        {
          id: 'firefox',
          label: 'Firefox (mock)',
          backend: createMockExplorerBackend({ identity: 'firefox' })
        }
      ]}
    />
  );
}
