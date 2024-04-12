// Import application Styles.
import '../styles/captureMenu.scss';

import { LogLevel } from '../../shared/utils/logger';
import { Observable } from '../../shared/utils/observable';
import { MVX } from '../mvx/mvx';
import { CanvasListComponent, ICanvasListComponentState } from './canvasListComponent';
import { CanvasListItemComponent } from './canvasListItemComponent';
import { CaptureMenuActionsComponent } from './captureMenuActionsComponent';
import { CaptureMenuComponent, ICaptureMenuComponentState } from './captureMenuComponent';
import { FpsCounterComponent } from './fpsCounterComponent';

export interface ICanvasInformation {
  id: string;
  width: number;
  height: number;
  ref: any;
}

export interface ICaptureMenuOptions {
  readonly rootPlaceHolder?: Element;
  readonly canvas?: HTMLCanvasElement;
  readonly hideLog?: boolean;
}

interface IArrayLike<T> {
  length: number;
  [index: number]: T;
}

export class CaptureMenu {
  static SelectCanvasHelpText = 'Please, select a canvas in the list above.';
  static ActionsHelpText = 'Record with the red button, you can also pause or continue playing the current scene.';
  static PleaseWaitHelpText = 'Capturing, be patient (this can take up to 3 minutes)...';

  readonly onCanvasSelected = new Observable<ICanvasInformation | null>();
  readonly onCaptureRequested = new Observable<ICanvasInformation>();
  readonly onPauseRequested = new Observable<ICanvasInformation>();
  readonly onPlayRequested = new Observable<ICanvasInformation>();
  readonly onPlayNextFrameRequested = new Observable<ICanvasInformation>();

  private readonly rootPlaceHolder: Element = this.options.rootPlaceHolder || document.body;
  private readonly mvx = new MVX(this.rootPlaceHolder);

  private readonly captureMenuComponent = new CaptureMenuComponent();
  private readonly canvasListItemComponent = new CanvasListItemComponent();
  private readonly actionsComponent = new CaptureMenuActionsComponent();
  private readonly canvasListComponent = new CanvasListComponent();
  private readonly fpsCounterComponent = new FpsCounterComponent();

  private readonly rootStateId = this.mvx.addRootState(
    {
      visible: true,
      logLevel: LogLevel.info,
      logText: CaptureMenu.SelectCanvasHelpText,
      logVisible: !this.options.hideLog
    },
    this.captureMenuComponent
  );
  private readonly canvasListStateId = this.mvx.addChildState(
    this.rootStateId,
    { currentCanvasInformation: null, showList: false },
    this.canvasListComponent
  );
  private readonly actionsStateId = this.mvx.addChildState(this.rootStateId, true, this.actionsComponent);
  private readonly fpsStateId = this.mvx.addChildState(this.rootStateId, 0, this.fpsCounterComponent);

  private isTrackingCanvas: boolean = false;

  constructor(private readonly options: ICaptureMenuOptions = {}) {
    this.actionsComponent.onCaptureRequested.add(() => {
      const currentCanvasInformation = this.getSelectedCanvasInformation();
      if (currentCanvasInformation) {
        this.updateMenuStateLog(LogLevel.info, CaptureMenu.PleaseWaitHelpText, true);
      }

      // Defer to ensure the log displays.
      setTimeout(() => {
        this.onCaptureRequested.trigger(currentCanvasInformation);
      }, 200);
    });
    this.actionsComponent.onPauseRequested.add(() => {
      this.onPauseRequested.trigger(this.getSelectedCanvasInformation());
      this.mvx.updateState(this.actionsStateId, false);
    });
    this.actionsComponent.onPlayRequested.add(() => {
      this.onPlayRequested.trigger(this.getSelectedCanvasInformation());
      this.mvx.updateState(this.actionsStateId, true);
    });
    this.actionsComponent.onPlayNextFrameRequested.add(() => {
      this.onPlayNextFrameRequested.trigger(this.getSelectedCanvasInformation());
    });

    this.canvasListComponent.onCanvasSelection.add((eventArgs) => {
      this.mvx.updateState(this.canvasListStateId, {
        currentCanvasInformation: null,
        showList: !eventArgs.state.showList
      });
      this.updateMenuStateLog(LogLevel.info, CaptureMenu.SelectCanvasHelpText);

      this.onCanvasSelected.trigger(null);
      if (this.isTrackingCanvas) {
        this.trackPageCanvases();
      }

      if (eventArgs.state.showList) {
        this.showMenuStateLog();
      } else {
        this.hideMenuStateLog();
      }
    });

    this.canvasListItemComponent.onCanvasSelected.add((eventArgs) => {
      this.mvx.updateState(this.canvasListStateId, {
        currentCanvasInformation: eventArgs.state,
        showList: false
      });
      this.onCanvasSelected.trigger(eventArgs.state);
      this.updateMenuStateLog(LogLevel.info, CaptureMenu.ActionsHelpText);
      this.showMenuStateLog();
    });
  }

  getSelectedCanvasInformation(): ICanvasInformation {
    const canvasListState = this.mvx.getGenericState<ICanvasListComponentState>(this.canvasListStateId);
    return canvasListState.currentCanvasInformation;
  }

  trackPageCanvases(): void {
    this.isTrackingCanvas = true;
    if (document.body) {
      const canvases = document.body.querySelectorAll('canvas');
      this.updateCanvasesList(canvases);
    }
  }

  updateCanvasesList(canvases: NodeListOf<HTMLCanvasElement>): void {
    this.updateCanvasesListInformationInternal(canvases, (info) => {
      return {
        id: info.id,
        width: info.width,
        height: info.height,
        ref: info
      };
    });
  }

  updateCanvasesListInformation(canvasesInformation: ICanvasInformation[]): void {
    this.updateCanvasesListInformationInternal(canvasesInformation, (info) => {
      return {
        id: info.id,
        width: info.width,
        height: info.height,
        ref: info.ref
      };
    });
  }

  display(): void {
    this.updateMenuStateVisibility(true);
  }

  hide(): void {
    this.updateMenuStateVisibility(false);
  }

  captureComplete(errorText?: string): void {
    if (errorText) {
      this.updateMenuStateLog(LogLevel.error, errorText);
    } else {
      this.updateMenuStateLog(LogLevel.info, CaptureMenu.ActionsHelpText);
    }
  }

  setFPS(fps: number): void {
    this.mvx.updateState(this.fpsStateId, fps);
  }

  private updateCanvasesListInformationInternal<T>(
    canvasesInformation: ArrayLike<T>,
    convertToListInfo: (info: T) => ICanvasInformation
  ): void {
    // Create a consumable information list for the view.
    this.mvx.removeChildrenStates(this.canvasListStateId);
    const canvasesInformationClone: ICanvasInformation[] = [];
    for (let i = 0; i < canvasesInformation.length; i++) {
      const canvas = canvasesInformation[i];
      const canvasInformationClone = convertToListInfo(canvas);
      canvasesInformationClone.push(canvasInformationClone);
      this.mvx.addChildState(this.canvasListStateId, canvasInformationClone, this.canvasListItemComponent);
    }

    // Auto Select in the list if only one canvas.
    const canvasesCount = canvasesInformationClone.length;
    const canvasListState = this.mvx.getGenericState<ICanvasListComponentState>(this.canvasListStateId);
    const visible = canvasListState.showList;
    if (!visible) {
      if (canvasesCount === 1) {
        const canvasToSelect = canvasesInformationClone[0];
        this.mvx.updateState(this.canvasListStateId, {
          currentCanvasInformation: canvasToSelect,
          showList: visible
        });
        this.updateMenuStateLog(LogLevel.info, CaptureMenu.ActionsHelpText);
        this.onCanvasSelected.trigger(canvasToSelect);
      } else {
        this.updateMenuStateLog(LogLevel.info, CaptureMenu.SelectCanvasHelpText);
        this.onCanvasSelected.trigger(null);
      }
    }
  }

  private hideMenuStateLog() {
    const menuState = this.mvx.getGenericState<ICaptureMenuComponentState>(this.rootStateId);
    this.mvx.updateState(this.rootStateId, {
      visible: menuState.visible,
      logLevel: menuState.logLevel,
      logText: menuState.logText,
      logVisible: false
    });
  }

  private showMenuStateLog() {
    const menuState = this.mvx.getGenericState<ICaptureMenuComponentState>(this.rootStateId);
    this.mvx.updateState(this.rootStateId, {
      visible: menuState.visible,
      logLevel: menuState.logLevel,
      logText: menuState.logText,
      logVisible: !this.options.hideLog
    });
  }

  private updateMenuStateLog(logLevel: LogLevel, logText: string, immediate = false) {
    const menuState = this.mvx.getGenericState<ICaptureMenuComponentState>(this.rootStateId);
    this.mvx.updateState(
      this.rootStateId,
      {
        visible: menuState.visible,
        logLevel,
        logText,
        logVisible: !this.options.hideLog
      },
      immediate
    );
  }

  private updateMenuStateVisibility(visible: boolean) {
    const menuState = this.mvx.getGenericState<ICaptureMenuComponentState>(this.rootStateId);
    this.mvx.updateState(this.rootStateId, {
      visible,
      logLevel: menuState.logLevel,
      logText: menuState.logText,
      logVisible: menuState.logVisible
    });
  }
}
