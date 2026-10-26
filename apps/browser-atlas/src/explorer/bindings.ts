import { type Accessor, createSignal, onSettled } from 'solid-js';
import type { DocumentExplorerBackend } from '../backends/document/createDocumentExplorerBackend';
import type { ExplorerBackend, ExplorerCloudBackupAttempt } from './backend';
import { createExplorerSources } from './createExplorerSources';

/** A backend an explorer panel can show, with the reactive sources loaded from it. */
export type ExplorerBackendBinding = BrowserBackendBinding | DocumentBackendBinding;

/** A live or simulated browser identity. */
export type BrowserBackendBinding = {
  kind: 'browser';
  /** Runtime id; unique per Browser Atlas page, so drops from other windows are recognized as foreign. */
  id: string;
  /** Stable key that survives reloads: `browser` for the primary browser, `browser:<option id>` for others. */
  key: string;
  label: Accessor<string>;
  backend: ExplorerBackend;
  sources: ExplorerSources;
  /** Latest cloud-backup attempt of this browser session, shown on every Cloud toolbar button. */
  cloudAttempt: CloudBackupAttemptState;
};

/** An editable in-memory document owned by one explorer panel and loaded from files or backups. */
export type DocumentBackendBinding = {
  kind: 'document';
  /** Runtime id, unique per Browser Atlas page. */
  id: string;
  /** Stable key, `file:<explorer panel id>`. */
  key: string;
  label: Accessor<string>;
  setLabel: (label: string) => void;
  backend: ExplorerBackend;
  sources: ExplorerSources;
  document: DocumentExplorerBackend;
};

/** Reactive trees of one backend. */
export type ExplorerSources = ReturnType<typeof createExplorerSources>;

/** Latest cloud-backup attempt of one browser, refreshed after every cloud operation. */
export type CloudBackupAttemptState = Readonly<{
  attempt: Accessor<ExplorerCloudBackupAttempt>;
  set: (attempt: ExplorerCloudBackupAttempt) => void;
  /** Rereads the attempt from the provider; keeps the current value when the read fails. */
  refresh: () => Promise<void>;
}>;

/** Binds a browser backend. Must run under an owner; reads the cloud attempt once settled. */
export function createBrowserBinding(
  id: string,
  key: string,
  label: string,
  backend: ExplorerBackend
): BrowserBackendBinding {
  return {
    kind: 'browser',
    id,
    key,
    label: () => label,
    backend,
    sources: createExplorerSources(backend),
    cloudAttempt: createCloudBackupAttempt(backend)
  };
}

/** Binds an explorer's own document. Must run under an owner, which keeps the document alive. */
export function createDocumentBinding(
  id: string,
  key: string,
  initialLabel: string,
  document: DocumentExplorerBackend
): DocumentBackendBinding {
  const [label, setLabel] = createSignal(initialLabel);

  return {
    kind: 'document',
    id,
    key,
    label,
    setLabel,
    backend: document.backend,
    sources: createExplorerSources(document.backend),
    document
  };
}

function createCloudBackupAttempt(backend: ExplorerBackend): CloudBackupAttemptState {
  const [attempt, setAttempt] = createSignal<ExplorerCloudBackupAttempt>({ status: 'none' });

  async function refresh(): Promise<void> {
    const cloudBackups = backend.cloudBackups;
    if (!cloudBackups) {
      return;
    }

    try {
      setAttempt(await cloudBackups.lastAttempt());
    } catch {
      // The attempt strip is informational; a failed read keeps the last known attempt.
    }
  }

  // Writes are not allowed while the binding is created, so the first read waits for the settled render.
  onSettled(() => void refresh());

  return { attempt, set: setAttempt, refresh };
}
