The `ARRAY_BUFFER` binding point is mostly
just like an internal variable inside webgl. You set it by calling
`gl.bindBuffer(gl.ARRAY_BUFFER, someBuffer);` and then all other
buffer functions can refer to the buffer bound there.
