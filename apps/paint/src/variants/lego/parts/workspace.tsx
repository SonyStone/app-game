import { WorkspaceMenu } from '../WorkspacePreview';
import { ActionPart } from './actions';
import { definePart } from './definition';

/**
 * The Workspace part: a button naming the active workspace (the short name where the full one does not fit, the icon
 * alone at one cell) that opens the list of workspaces beside itself to switch. Inert where the editor offers no
 * workspaces, as in previews outside the studio.
 */
export const workspacePart = definePart({
  kind: 'action:workspace',
  family: 'action',
  group: 'interface',
  section: 'Tools',
  label: 'Workspace',
  icon: 'workspace',
  defaultSpan: { columns: 4, rows: 1 },
  needs: (s, f) => {
    const current = () => {
      const workspaces = s.options.workspaces;
      return workspaces?.list.find((workspace) => workspace.id === workspaces.active());
    };

    return {
      label: 'Workspace',
      icon: 'workspace' as const,
      get span() {
        return f.span;
      },
      get status() {
        return current()?.name;
      },
      get statusShort() {
        return current()?.short;
      },
      get disabled() {
        return !s.options.workspaces;
      },
      onPress: (anchor: Element) => f.onPopup(anchor, { kind: 'part', partKind: f.kind })
    };
  },
  View: ActionPart,
  popup: {
    needs: (s, f) => ({
      get workspaces() {
        return s.options.workspaces;
      },
      onSwitch: f.command((id: Parameters<NonNullable<typeof s.options.workspaces>['switchTo']>[0]) =>
        s.options.workspaces?.switchTo(id)
      ),
      onDone: f.onDone
    }),
    View: WorkspaceMenu
  }
});
