The current **draw** framebuffer (`null` = the canvas).
This is framebuffer pixels are written to when calling
`gl.clear`, `gl.drawXXX`, `gl.blitFramebuffer`.

Set with

```js
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, someFramebuffer);
```

or with

```js
gl.bindFramebuffer(gl.FRAMEBUFFER, someFramebuffer);
```
