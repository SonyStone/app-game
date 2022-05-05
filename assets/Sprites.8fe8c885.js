import{A as J,G as I,a7 as Y,c as $,W as K,a6 as V,g as T,n as Q,J as U,K as Z,N as ee,O as te,a8 as b,q as y,X as re,B as ae,p as oe,o as ne,t as ie}from"./vendor.110b933d.js";import{i as S}from"./isometric-grass-and-water.e6b4a19f.js";import{a as se,u as ce}from"./index.3962126e.js";import{s as le}from"./SvgLoader.module.81d7d1f7.js";var de=`uniform mat4 savedModelMatrix;\r
uniform mat4 viewMatrixCamera;\r
uniform mat4 projectionMatrixCamera;\r
uniform mat4 modelMatrixCamera;\r
\r
varying vec4 vWorldPosition;\r
varying vec3 vNormal;\r
varying vec4 vTexCoords;\r
\r
\r
void main() {\r
  vNormal = mat3(savedModelMatrix) * normal;\r
  vWorldPosition = savedModelMatrix * vec4(position, 1.0);\r
  vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;\r
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\r
}`,me=`uniform vec3 color;\r
uniform sampler2D pointTexture;\r
uniform vec3 projPosition;\r
\r
varying vec3 vNormal;\r
varying vec4 vWorldPosition;\r
varying vec4 vTexCoords;\r
\r
void main() {\r
  vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;\r
\r
  vec4 outColor = texture2D(pointTexture, uv);\r
\r
  gl_FragColor = outColor;\r
}`;function G({camera:t,texture:h,color:o}){t.updateProjectionMatrix(),t.updateMatrixWorld(),t.updateWorldMatrix(!1,!1);const M=t.matrixWorldInverse.clone(),a=t.projectionMatrix.clone(),p=t.matrixWorld.clone(),s=t.position.clone(),i=new J({uniforms:{color:{value:new I(o!=null?o:65280)},pointTexture:{value:h},viewMatrixCamera:{value:M},projectionMatrixCamera:{value:a},modelMatrixCamera:{value:p},projPosition:{value:s},savedModelMatrix:{value:new Y}},vertexShader:de,fragmentShader:me,transparent:!0});return i.isProjectedMaterial=!0,i}function E(t){if(!t.material.isProjectedMaterial)throw new Error("The mesh material must be a ProjectedMaterial");t.updateMatrixWorld(),t.material.uniforms.savedModelMatrix.value.copy(t.matrixWorld)}const ue=ie("<canvas></canvas>");function Me(){const t=(()=>{const r=ue.cloneNode(!0);return $(()=>r.className=le.canvas),r})(),{camera:h,controls:o,resize:M}=se(),a=new K({antialias:!0,canvas:t});a.setPixelRatio(window.devicePixelRatio),a.setSize(window.innerWidth,window.innerHeight),a.outputEncoding=V,a.sortObjects=!1,o.init(a.domElement);const p=ce();T(()=>{const{width:r,height:e}=M();a.setSize(r,e),d()});const s=new Q,i=new U;function N(r){return new Z().loadAsync(r).then(e=>(e.magFilter=ee,e))}function H(r){return fetch(r).then(e=>e.json())}T(async()=>{const r=await N(S.tiles),e=await H(S.map),{imageheight:m,imagewidth:X}=e.tilesets[0],u=new te(0,X,0,-m,0,m*2);u.rotateX(-30*Math.PI/180),u.position.set(0,0,0),u.updateMatrixWorld();const B=G({camera:u,texture:r}),C=new b(256,384*2);C.rotateX(-Math.PI/2);const L=new y(C,B);E(L);function O(c,n){const w=G({camera:u,texture:r}),l=new b(64,64*2);l.rotateX(-Math.PI/2);const v=new y(l,w);return v.position.set(c,0,n),E(v),v}const _=e.tilewidth,P=e.tileheight,j=_/2,z=P/2,A=e.layers[0].data,F=e.layers[0].width,k=e.layers[0].height,q=Object.entries(e.spritesheet.frames).map(([c,n])=>({x:n.frame.x+j,y:n.frame.y*2+P*2}));let W=0;for(let c=0;c<k;c++)for(let n=0;n<F;n++){const w=A[W]-1,l=q[w];if(l){const v=(n-c)*j,D=(n+c)*z*2,g=O(l.x,l.y);g.position.set(v,0,D),g.rotateX(Math.PI/8),i.add(g)}W++}d()}),s.add(i),s.background=new I(1087931);const x=Math.sqrt(32*32+32*32),f=new re(x*25,25),R=x*25/1.472;f.position.set(0,.1,R),f.rotateY(Math.PI/4),i.add(f),i.position.set(x*12,0,-(x*12)),i.rotateY(-Math.PI/4);{const r=new ae(32,64,32),e=new oe({color:5635925}),m=new y(r,e);m.position.set(500,10,400),s.add(m)}function d(){p.begin(),a.render(s,h),p.end()}return o.addEventListener("change",d),o.screenSpacePanning=!0,d(),ne(()=>{a.dispose(),o.dispose(),s.clear(),o.removeEventListener("change",d)}),t}export{Me as default};
