[I Optimised My Game Engine Up To 12000 FPS](https://www.youtube.com/watch?v=40JzyaOYJeY)

Generate a chunk mesh

voxels

group into 32x32x32 chunks
12 triangles per voxel

- when generating a mesh for the chunk, we skip the triangles between the voxels
- combine flat serface tringles into a single poligon
- compress vec3 position, vec3 normal, vec3 textureID into single intager

position
every triangle aligned to the grid. So we can store the position in byte

- 32-bit float = 3.4 undecillion (big)
- 8-bit byte = 255
- 7 bits = 127
- 6 bits = 63 - enough space for 32 chunks

6 bits for each xyz axis

|        |        |        |
| ------ | ------ | ------ |
| zzzzzz | yyyyyy | xxxxxx |
| 6 bits | 6 bits | 6 bits |

normal vector only 6 possabel values

|     |     |
| --- | --- |
| Y+  | 0   |
| Y-  | 1   |
| X+  | 2   |
| X-  | 3   |
| Z+  | 4   |
| Z-  | 5   |

3 bits for each xyz normal axis

|        |
| ------ |
| fff    |
| 3 bits |

textureID
only 70 unique textures
= 7 bits for textureID

|         |
| ------- |
| ttttttt |
| 7 bits  |

bit mask to get data in vertex shader

|        |         |        |        |        |        |
| ------ | ------- | ------ | ------ | ------ | ------ |
| 0000   | ttttttt | fff    | zzzzzz | yyyyyy | xxxxxx |
| 4 bits | 7 bits  | 3 bits | 6 bits | 6 bits | 6 bits |

32 bit data mapping

```glsl
int positionX = data & 63;
int positionY = (data >> 6) & 63;
int positionZ = (data >> 12) & 63;
int normal = (data >> 18) & 7;
int textureID = (data >> 21) & 63;
```

base model of voxelface that instansing it

glDrawArraysInstanced (glDrawArraysInstancedBaseInstance OpenGL 4.2)

we use Combined Buffer
Indirect Buffer

(glMultiDrawElementsIndirect OpenGL 4.3)

shader storage buffer object (SSBO)
