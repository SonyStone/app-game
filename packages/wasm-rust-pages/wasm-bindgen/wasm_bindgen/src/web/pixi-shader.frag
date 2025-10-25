#define SHADER_NAME batch-fragment

#ifdef GL_ES// This checks if it is WebGL1
#define in varying
#define finalColor gl_FragColor
#define texture texture2D
#endif
precision mediump float;
in vec4 vColor;
in vec2 vUV;

//-----header START-----//

//----texture-batch-bit----//

in float vTextureId;
uniform sampler2D uTextures[16];

//----header FINISH----//

void main(void){
    vec4 outColor;
    
    //-----main START-----//
    
    //----texture-batch-bit----//
    
    if(vTextureId<.5){
        outColor=texture(uTextures[0],vUV);
    }
    else
    if(vTextureId<1.5){
        outColor=texture(uTextures[1],vUV);
    }
    else
    if(vTextureId<2.5){
        outColor=texture(uTextures[2],vUV);
    }
    else
    if(vTextureId<3.5){
        outColor=texture(uTextures[3],vUV);
    }
    else
    if(vTextureId<4.5){
        outColor=texture(uTextures[4],vUV);
    }
    else
    if(vTextureId<5.5){
        outColor=texture(uTextures[5],vUV);
    }
    else
    if(vTextureId<6.5){
        outColor=texture(uTextures[6],vUV);
    }
    else
    if(vTextureId<7.5){
        outColor=texture(uTextures[7],vUV);
    }
    else
    if(vTextureId<8.5){
        outColor=texture(uTextures[8],vUV);
    }
    else
    if(vTextureId<9.5){
        outColor=texture(uTextures[9],vUV);
    }
    else
    if(vTextureId<10.5){
        outColor=texture(uTextures[10],vUV);
    }
    else
    if(vTextureId<11.5){
        outColor=texture(uTextures[11],vUV);
    }
    else
    if(vTextureId<12.5){
        outColor=texture(uTextures[12],vUV);
    }
    else
    if(vTextureId<13.5){
        outColor=texture(uTextures[13],vUV);
    }
    else
    if(vTextureId<14.5){
        outColor=texture(uTextures[14],vUV);
    }
    else{
        outColor=texture(uTextures[15],vUV);
    }
    //----main FINISH----//
    
    finalColor=outColor*vColor;
}
