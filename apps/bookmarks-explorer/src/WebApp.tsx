import { BookmarksExplorer } from './App';
import { createFixtureExplorerBackend } from './backends/fixtures/createFixtureExplorerBackend';

/** Website composition using an editable workspace initialized from Tabs Outliner fixtures. */
export default function WebBookmarksExplorer() {
  return <BookmarksExplorer backend={createFixtureExplorerBackend()} backendLabel="Local" />;
}
