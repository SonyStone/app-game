# Instanced Drawing

insted of uniform we store data in attributes (multipule array buffers)

- `createVertexArray` (vao)
- `bindVertexArray` binde this vao

next: vertex position buffer

- `createBuffer`
- `bindBuffer` bind this buffer as array buffer
- `bufferData` set data for binded buffer

next:

- `enableVertexAttribArray`
- `vertexAttribPointer`

next:
mesh position buffer
here we creates 1 Float32Array and 5 pointers to matrices data on this array, so we can use this poiters insted of searhing for matrix data on this one big array

- `createBuffer` we create buffer
- `bindBuffer` bind
- `bufferData` set data for this one big data array

next:
we set pointers in webgl2?
4 times for 4 istanced objects

- `enableVertexAttribArray`
- `vertexAttribPointer`
- `vertexAttribDivisor`

next:
color data

- `createBuffer`
- `bindBuffer`
- `bufferData`

- `enableVertexAttribArray`
- `vertexAttribPointer`
- `vertexAttribDivisor`
