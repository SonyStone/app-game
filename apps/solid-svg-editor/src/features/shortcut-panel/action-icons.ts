import DuplicateIcon from '../../App.icons/Duplicate.svg';
import MoveDownIcon from '../../App.icons/MoveDown.svg';
import MoveUpIcon from '../../App.icons/MoveUp.svg';
import type { SvgIcon } from '../../editor/svg-icon';
import CompressIcon from '../../icons/Compress.svg';
import EvaluateIcon from '../../icons/Evaluate.svg';
import NewOriginIcon from '../../icons/NewOrigin.svg';
import PlaceholderIcon from '../../icons/Placeholder.svg';
import ReloadIcon from '../../icons/Reload.svg';
import ReverseIcon from '../../icons/Reverse.svg';
import SearchIcon from '../../icons/Search.svg';
import SelectAllIcon from '../../icons/SelectAll.svg';
import CreateTabIcon from '../chrome/icons/CreateTab.svg';
import DebugIcon from '../chrome/icons/Debug.svg';
import GearIcon from '../chrome/icons/Gear.svg';
import LinkIcon from '../chrome/icons/Link.svg';
import RedoIcon from '../chrome/icons/Redo.svg';
import SaveIcon from '../chrome/icons/Save.svg';
import UndoIcon from '../chrome/icons/Undo.svg';
import type { EditorActionId } from '../shortcuts/createEditorShortcuts';
import CopyIcon from '../ui/icons/Copy.svg';
import DeleteIcon from '../ui/icons/Delete.svg';
import ExportIcon from '../ui/icons/Export.svg';
import HeartIcon from '../ui/icons/Heart.svg';
import ImportIcon from '../ui/icons/Import.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import ExpandIcon from '../viewport/icons/Expand.svg';
import MinusIcon from '../viewport/icons/Minus.svg';
import ReferenceIcon from '../viewport/icons/Reference.svg';
import SnapIcon from '../viewport/icons/Snap.svg';

/** The icon GodSVG shows for an action on the shortcut panel (`ShortcutUtils.get_action_icon`); a placeholder otherwise. */
export function actionIcon(id: string): SvgIcon {
  return icons[id as EditorActionId] ?? PlaceholderIcon;
}

const icons: Partial<Record<EditorActionId, SvgIcon>> = {
  'file.import': ImportIcon,
  'file.export': ExportIcon,
  'file.save-svg': SaveIcon,
  'file.save-as': SaveIcon,
  'file.new-tab': CreateTabIcon,
  'edit.copy-svg': CopyIcon,
  'file.optimize': CompressIcon,
  'file.reset-svg': ReloadIcon,
  'view.reset-zoom': ReloadIcon,
  'edit.undo': UndoIcon,
  'edit.redo': RedoIcon,
  'edit.duplicate': DuplicateIcon,
  'edit.move-up': MoveUpIcon,
  'edit.move-down': MoveDownIcon,
  'edit.set-as-initial': NewOriginIcon,
  'edit.reverse-order': ReverseIcon,
  'edit.delete': DeleteIcon,
  'edit.find': SearchIcon,
  'view.zoom-in': PlusIcon,
  'view.zoom-out': MinusIcon,
  'view.debug': DebugIcon,
  'tool.toggle-snap': SnapIcon,
  'help.settings': GearIcon,
  'help.donate': HeartIcon,
  'help.repository': LinkIcon,
  'help.website': LinkIcon,
  'view.toggle-fullscreen': ExpandIcon,
  'view.load-reference': ReferenceIcon,
  'edit.select-all': SelectAllIcon,
  'edit.evaluate': EvaluateIcon
};
