# WebGL debug interception

`@app-game/webgl-debug` contains the browser patch and method interception shared by the Spector
and WebGL state diagram packages. It has no UI dependency, so another workspace package can use it
to build a logger, debugger, recorder, or state inspector.

Install the hook before the target application asks a canvas for WebGL:

```ts
import { createMethodProxy, installWebGLContextHook } from '@app-game/webgl-debug';

const hook = installWebGLContextHook({
  wrapContext(context) {
    return createMethodProxy(context, {
      onCall(call) {
        if (call.status === 'returned') {
          console.debug(call.name, call.arguments, call.result);
        } else {
          console.error(call.name, call.arguments, call.error);
        }
      }
    });
  }
});

startApplication();

// Restore HTMLCanvasElement.prototype.getContext during teardown.
hook.restore();
```

Pass `{ target: iframe.contentWindow! }` to intercept a same-origin iframe. Browser origin rules
prevent this technique from reaching a cross-origin iframe.
