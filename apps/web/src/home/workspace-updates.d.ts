/** The latest change of every workspace directory, keyed by `apps/<name>` or `packages/<name>` (see `workspaceUpdates`). */
declare module 'virtual:workspace-updates' {
  const updates: Record<string, import('../../workspaceUpdates').WorkspaceUpdate>;
  export default updates;
}
