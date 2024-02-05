The current vertex array.

In WebGL 1.0 this is only settable via the
[`OES_vertex_array_object`](https://www.khronos.org/registry/webgl/extensions/OES_vertex_array_object/)
extension. Otherwise there is only the 1 default vertex array in WebGL 1.0.

In WebGL 2.0 set with

```js
gl.bindVertexArray(someVertexArray);
```

passing in `null` binds the default vertex array.
