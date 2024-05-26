http://wiki.custommapmakers.org/index.php?title=Textures:Shaders

- ZERO
- ONE
- SRC_COLOR
- ONE_MINUS_SRC_COLOR
- DST_COLOR
- ONE_MINUS_DST_COLOR
- SRC_ALPHA
- ONE_MINUS_SRC_ALPHA
- DST_ALPHA
- ONE_MINUS_DST_ALPHA
- CONSTANT_COLOR
- ONE_MINUS_CONSTANT_COLOR
- CONSTANT_ALPHA
- ONE_MINUS_CONSTANT_ALPHA
- SRC_ALPHA_SATURATE

# Blend modes

For Blend modes need to put two objects over each other. So it is blend `gl_FragColor` with existing color. To customize this blending you can enable blending and set the blend function using `gl.blendFunc` or `gl.blendFuncSeparate`.
This will determine how the color computed in the fragment shader is combined with the color that is already in the color buffer.

But for drawing program this functionality is very limited.
