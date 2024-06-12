#version 300 es
in vec2 uv;
in vec3 position;

// Add instanced attributes just like any attribute
in vec3 offset;
in vec3 random;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;

out vec2 vUv;
out vec3 vNormal;

void rotate2d(inout vec2 v, float a) {
  mat2 m = mat2(cos(a), -sin(a), sin(a), cos(a));
  v = m * v;
}

void main() {
  vUv = uv;

    // copy position so that we can modify the instances
  vec3 pos = position;

    // scale first
  pos *= 0.9f + random.y * 0.2f;

    // rotate around y axis
  rotate2d(pos.xz, random.x * 6.28f + 4.0f * uTime * (random.y - 0.5f));

    // rotate around x axis just to add some extra variation
  rotate2d(pos.zy, random.z * 0.5f * sin(uTime * random.x + random.z * 3.14f));

  pos += offset;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0f);
}