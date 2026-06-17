attribute vec3 position;
attribute vec4 random;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;

varying vec4 vRandom;

void main() {
    vRandom = random;

    vec3 pos = position * 2.0 - 1.0;
    pos.z *= 10.0;

    vec4 mPos = modelMatrix * vec4(pos, 1.0);

    float t = uTime * 0.6;
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);

    vec4 mvPos = viewMatrix * mPos;
    gl_PointSize = 300.0 / length(mvPos.xyz) * (random.x + 0.1);
    gl_Position = projectionMatrix * mvPos;
}