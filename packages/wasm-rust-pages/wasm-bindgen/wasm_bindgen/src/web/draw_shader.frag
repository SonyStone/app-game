#version 300 es
precision mediump float;

uniform mediump float brush_size;
uniform vec4 segment;

in vec2 frag_pos;
out vec4 out_color;

// This finds the closet point on a line segment from a specific point
vec2 closet_to_seg(vec2 a, vec2 b, vec2 p){
	vec2 d = b - a;
    float t = ((p.x - a.x) * d.x + (p.y-a.y) * d.y) / ( d.x*d.x + d.y*d.y );
    t  = clamp( t, 0.0, 1.0 );

    return vec2(
        a.x + ( d.x * t ),
        a.y + ( d.y * t )
    );
}

void main(void) {
    float bh = brush_size * 0.5;
    vec2 center = closet_to_seg(segment.xy, segment.zw, frag_pos);

    // Reverse Lerp Frag Position in relation to brush quad area.
    // This gives use basicly the UV Coord that the frag position
    // has in the quad brush area        
    vec2 a = center - vec2(bh);
    vec2 b = center + vec2(bh);
    vec2 uv = (frag_pos - a) / (b - a);
    // Using UV Coords, We can do anything you normally can with any
    // quad, So how about a simple circle. So if the frag is within the
    // quad, What part of the circle does it live in.
    float len = 1.0 - smoothstep(0.45, 0.5, length(uv - vec2( 0.5 )));
    
    out_color = vec4(len); // Use the gradient value as color and alpha

    /*
    vec2 coord		= uv * 2.0 - 1.0;
    float radius	= dot( coord, coord );
    float dxdy 		= fwidth( radius );
    float len = smoothstep( 0.90 + dxdy, 0.90 - dxdy, radius );
    out_color = vec4( len );
    */

}