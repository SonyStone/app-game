#version 300 es
precision mediump float;
out vec4 out_color;
in vec2 frag_uv;
//------------------------
uniform sampler2D buf_color;	
//-------------------------
void main( void ){
	ivec2 fCoord    = ivec2( gl_FragCoord.xy );     // Get the Int of the current Screen pixel X,Y
	ivec2 texSize   = textureSize( buf_color, 0 );	// Get Size of Texture
	vec4 color      = texelFetch( buf_color, fCoord , 0 );		
	out_color		= color;
}