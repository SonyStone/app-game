#version 300 es
precision mediump float;

#define WIDTH 1.0
#define COUNT 16.0
#define SPEED 2.0
#define REVERSE false

uniform float uTime;
uniform sampler2D u_texture;
uniform vec2 u_textureSize;
in vec2 vUv;
out vec4 outColor;

vec3 diagonals(vec2 pos, bool reverse) {
    int w = 0;
    float time = SPEED * 10.0 * ((reverse)? uTime : - uTime );
    w = (int(pos.x - pos.y + time) & int(COUNT));
    return vec3(w,w,w);
}


void main() {
    float edgeDetectKernel[9] = float[9](
        -1.0, -1.0, -1.0,
        -1.0,  8.0, -1.0,
        -1.0, -1.0, -1.0
    );

    vec2 texel = 1.0 / u_textureSize;

    float sum = 0.0;
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            vec2 offset = vec2(float(i - 1), float(j - 1)) * texel;
            float value = texture(u_texture, vUv + offset).r;
            sum += value * edgeDetectKernel[i * 3 + j];
        }
    }

    vec3 edge = vec3(sum);
    vec3 col = diagonals(gl_FragCoord.xy, REVERSE);

    outColor = vec4(mix(edge, col, sum), sum);
}