#version 300 es
layout(location=0) in vec3 a_pos;
//------------------------
uniform mediump float brush_size;
uniform mat4	ortho;      // Ortho Proj helps deal with things at a pixel level
//uniform vec2	move;       
uniform vec4	bound;  	// xy = Position, zw = Scale
out vec2        frag_pos;
//------------------------
void main(void){
	vec4 wpos = vec4( 0.0 );
	
	//wpos = vec4( a_pos * brush_size, 1.0 ) + vec4( move, 0.0, 0.0 );
	wpos = vec4( a_pos.xy * bound.zw + bound.xy, 0.0, 1.0 );
    
    frag_pos = wpos.xy;
	//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	
	gl_Position = ortho * wpos;
}