import { Setter } from 'solid-js';
import PanelResizeHandle from './panel-resize-handle';

export default function PanelResizers(props: { onDimensionsChange: Setter<Dimensions> }) {
  return (
    <>
      <PanelResizeHandle
        which="Bottom"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const height = state.height + vec[1];
            return {
              ...state,
              height
            };
          })
        }
      />
      <PanelResizeHandle
        which="Top"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const bottom = state.top + state.height;
            const top = state.top + vec[1];
            const height = bottom - top;
            return {
              ...state,
              top,
              height
            };
          })
        }
      />
      <PanelResizeHandle
        which="Left"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const right = state.left + state.width;
            const left = state.left + vec[0];
            const width = right - left;

            return {
              ...state,
              left,
              width
            };
          })
        }
      />
      <PanelResizeHandle
        which="Right"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const width = state.width + vec[0];

            return {
              ...state,
              width
            };
          })
        }
      />
      <PanelResizeHandle
        which="TopLeft"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const bottom = state.top + state.height;
            const top = state.top + vec[1];
            const height = bottom - top;
            const right = state.left + state.width;
            const left = state.left + vec[0];
            const width = right - left;

            return {
              top,
              height,
              left,
              width
            };
          })
        }
      />
      <PanelResizeHandle
        which="TopRight"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const width = state.width + vec[0];
            const bottom = state.top + state.height;
            const top = state.top + vec[1];
            const height = bottom - top;

            return {
              ...state,
              width,
              top,
              height
            };
          })
        }
      />
      <PanelResizeHandle
        which="BottomLeft"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const height = state.height + vec[1];
            const right = state.left + state.width;
            const left = state.left + vec[0];
            const width = right - left;
            return {
              ...state,
              height,
              left,
              width
            };
          })
        }
      />
      <PanelResizeHandle
        which="BottomRight"
        onDrag={(vec) =>
          props.onDimensionsChange((state) => {
            const height = state.height + vec[1];
            const width = state.width + vec[0];
            return {
              ...state,
              height,
              width
            };
          })
        }
      />
    </>
  );
}
