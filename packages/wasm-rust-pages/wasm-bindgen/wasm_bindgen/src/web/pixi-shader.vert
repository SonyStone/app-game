#define SHADER_NAME batch-vertex

#ifdef GL_ES// This checks if it is WebGL1
#define in attribute
#define out varying
#endif
precision highp float;
in vec2 aPosition;
in vec2 aUV;
out vec4 vColor;
out vec2 vUV;

//-----header START-----//

//----global-uniforms-bit----//

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec2 uResolution;

//----color-bit----//

in vec4 aColor;

//----texture-batch-bit----//

in vec2 aTextureIdAndRound;
out float vTextureId;

//----round-pixels-bit----//

vec2 roundPixels(vec2 position,vec2 targetSize){
    return(floor(((position*.5+.5)*targetSize)+.5)/targetSize)*2.-1.;
}
//----header FINISH----//

void main(void){
    mat3 worldTransformMatrix=uWorldTransformMatrix;
    mat3 modelMatrix=mat3(
        1.,0.,0.,0.,1.,0.,0.,0.,1.
    );
    vec2 position=aPosition;
    vec2 uv=aUV;
    vColor=vec4(1.);
    
    //-----main START-----//
    
    //----color-bit----//
    
    vColor*=vec4(aColor.rgb*aColor.a,aColor.a);
    
    //----texture-batch-bit----//
    
    vTextureId=aTextureIdAndRound.y;
    
    //----main FINISH----//
    
    vUV=uv;
    mat3 modelViewProjectionMatrix=uProjectionMatrix*worldTransformMatrix*modelMatrix;
    gl_Position=vec4((modelViewProjectionMatrix*vec3(position,1.)).xy,0.,1.);
    vColor*=uWorldColorAlpha;
    
    //-----end START-----//
    
    //----texture-batch-bit----//
    
    if(aTextureIdAndRound.x==1.){
        gl_Position.xy=roundPixels(gl_Position.xy,uResolution);
    }
    //----end FINISH----//
}
