import { ComponentProps, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { canvasList } from '../patch-canvas-element';
import { LogLevel } from '../shared/utils/logger';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'spector-capture-menu': ComponentProps<'div'>;
      'fps-counter': ComponentProps<'span'>;
      'capture-menu-actions': ComponentProps<'div'>;
      'canvas-list-item': ComponentProps<'span'>;
    }
  }
}

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

export interface ICaptureMenuComponentState {
  readonly visible: boolean;
  readonly logText: string;
  readonly logLevel: LogLevel;
  readonly logVisible: boolean;
}

const SELECT_CANVAS_HELP_TEXT = 'Please, select a canvas in the list above.';
const ACTIONS_HELP_TEXT = 'Record with the red button, you can also pause or continue playing the current scene.';
const PLEASE_WAIT_HELP_TEXT = 'Capturing, be patient (this can take up to 3 minutes)...';

const ERROR = 'text-red-600';

export default function CaptureMenu(props: { options?: ICaptureMenuOptions }) {
  const [state, setState] = createStore<ICaptureMenuComponentState>({
    visible: true,
    logLevel: LogLevel.info,
    logText: SELECT_CANVAS_HELP_TEXT,
    logVisible: !props.options?.hideLog
  });

  let isTrackingCanvas = false;

  function trackPageCanvases(): void {
    isTrackingCanvas = true;
    if (document.body) {
      const canvases = document.body.querySelectorAll('canvas');
      console.log('canvases', canvases);
      // this.updateCanvasesList(canvases);
    }
  }

  const canvases = canvasList;

  return (
    <spector-capture-menu class="z-99999 left-50% -translate-x-50% text-#f9f9f9 absolute top-2.5 font-['Consolas']">
      <div class="bg-#2c2c2c flex place-content-between gap-2 p-2">
        <CanvasList showList={false} />
        <CaptureMenuActions
          play={true}
          onCaptureRequested={() => {
            console.log('capture requested');
            trackPageCanvases();
          }}
          onPauseRequested={() => {
            console.log('pause requested');
          }}
          onPlayNextFrameRequested={() => {
            console.log('play next frame requested');
          }}
          onPlayRequested={() => {
            console.log('play requested');
          }}
        />
        <FpsCounter fps={0} />
      </div>
      <div class="bg-#2c2c2c p-2">
        <span class={[state.logLevel === LogLevel.error ? ERROR : ''].join(' ')}>{state.logText}</span>
      </div>
    </spector-capture-menu>
  );
}

const FpsCounter = (props: { fps: number }) => <fps-counter>{props.fps.toFixed(2)} Fps</fps-counter>;

const CanvasListItem = (props: ICanvasInformation) => (
  <canvas-list-item>
    <span>
      Id: {props.id} - Size: {props.width}*{props.height}
    </span>
    <button>click</button>
  </canvas-list-item>
);

export interface ICanvasListComponentState {
  currentCanvasInformation?: ICanvasInformation;
  showList: boolean;
}

const CanvasList = (props: ICanvasListComponentState) => (
  <div class="w-45 truncate">
    <Show when={props.currentCanvasInformation} fallback={<span>Choose Canvas...</span>}>
      {(currentCanvasInformation) => (
        <span>
          {currentCanvasInformation().id} ({currentCanvasInformation().width}*{currentCanvasInformation().height}
        </span>
      )}
    </Show>
    <Show when={props.showList}>
      <ul class="">
        <li>canvas 1</li>
        <li>canvas 2</li>
      </ul>
    </Show>
  </div>
);

const CaptureMenuActions = (props: {
  play: boolean;
  onCaptureRequested?: () => void;
  onPauseRequested?: () => void;
  onPlayRequested?: () => void;
  onPlayNextFrameRequested?: () => void;
}) => (
  <div class="flex gap-2">
    <button
      onClick={props.onCaptureRequested}
      class="bg-#2c2c2c w-5.5 h-5.5 rounded-full border-2 border-red-600"
    ></button>
    <Show
      when={!props.play}
      fallback={
        <button
          onClick={props.onPauseRequested}
          class="bg-#2c2c2c border-#f9f9f9 w-5.5 h-5.5 flex place-content-center place-items-center overflow-hidden rounded-full border-2 text-2xl"
        >
          ⏸️
        </button>
      }
    >
      <button
        onClick={props.onPlayRequested}
        class="bg-#2c2c2c border-#f9f9f9 w-5.5 h-5.5 flex place-content-center place-items-center overflow-hidden rounded-full border-2 text-2xl"
      >
        ▶️
      </button>
      <button
        onClick={props.onPlayNextFrameRequested}
        class="bg-#2c2c2c border-#f9f9f9 w-5.5 h-5.5 flex place-content-center place-items-center overflow-hidden rounded-full border-2 text-2xl"
      >
        ⏯️
      </button>
    </Show>
  </div>
);
