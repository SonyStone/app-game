import { Notebook } from '../examples/Notebook';

/** Mounts the notebook without standalone document setup or root rendering. */
export default function RoutedNotebook() {
  return <Notebook folderHref="/card-stack" debug />;
}
