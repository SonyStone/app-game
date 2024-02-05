The `ACTIVE_TEXTURE` is just an index into the texture units array
so that other function that take a target like `TEXTURE_2D` or
`TEXTURE_CUBE_MAP` know which texture unit to look at. It is set
with `gl.activeTexture(gl.TEXTURE0 + unit)`

**Pseudo Code**

```js
class WebGL {
  constructor() {
    this.activeTexture = 0;
    this.textureUnits = [
      { TEXTURE_2D: null, TEXTURE_CUBE_MAP: null, },
      { TEXTURE_2D: null, TEXTURE_CUBE_MAP: null, },
      ...
    ]
  }
  activeTexture(enum) {
    this.activeTexture = enum - gl.TEXTURE0;  // convert to index
  }
  texParameteri(target, pname, value) {
    const texture = this.textureUnits[this.activeTexture][target];
    ... set parameter on 'texture'...
  }
  ...
```
