export const canvasList: HTMLCanvasElement[] = [];

function patchCanvasElement() {
  const getContext = window.HTMLCanvasElement.prototype.getContext;
  (window.HTMLCanvasElement.prototype.getContext as any) = function (this: HTMLCanvasElement, ...args: any) {
    if (args[0] === 'webgl' || args[0] === 'webgl2') {
      canvasList.push(this);
    }
    const context = (getContext.apply as any)(this, [...args]);
    return context;
  };
}

patchCanvasElement();
