https://www.shadertoy.com/

uniforms Shadertoy provides:

| type      | name                  | where                      | description                                                    |
| --------- | --------------------- | -------------------------- | -------------------------------------------------------------- |
| vec3      | iResolution           | image / buffer             | The viewport resolution (z is pixel aspect ratio, usually 1.0) |
| float     | iTime                 | image / sound / buffer     | Current time in seconds                                        |
| float     | iTimeDelta            | image / buffer             | Time it takes to render a frame, in seconds                    |
| int       | iFrame                | image / buffer             | Current frame                                                  |
| float     | iFrameRate            | image / buffer             | Number of frames rendered per second                           |
| float     | iChannelTime[4]       | image / buffer             | Time for channel (if video or sound), in seconds               |
| vec3      | iChannelResolution[4] | image / buffer / sound     | Input texture resolution for each channel                      |
| vec4      | iMouse                | image / buffer             | xy = current pixel coords (if LMB is down). zw = click pixel   |
| sampler2D | iChannel              | {i} image / buffer / sound | Sampler for input textures i                                   |
| vec4      | iDate                 | image / buffer / sound     | Year, month, day, time in seconds in .xyzw                     |
| float     | iSampleRate           | image / buffer / sound     | The sound sample rate (typically 44100)                        |

If you want to learn more about the techniques used in these kinds of shader 2 good resources are
[the blog of the person that created the shadertoy website](https://iquilezles.org/articles/)
[The Book of Shaders](https://thebookofshaders.com/)
