import{o as Ze,m as Je}from"./vendor.110b933d.js";import{S as N,T as Y,P as S,C as F,R as de,A as bt,B as Re,p as $e,a as Ve,b as ke,M as Ee,c as Be,d as Ne,e as tr,f as xt,O as er,g as Ce,Q as rr,W as zt,h as nr,i as or,D as ir,j as qe,k as pe,l as Xe,m as Pt,n as me,F as j,o as Ge,G as Ue,q as Ct,r as E,s as sr,t as yt,u as nt,v as q,w as X,x as Te,y as ar,z as cr,E as we,H as Mt,I as We,J as lr,L as ur,K as fr,N as hr}from"./pixi.4c9cfd7e.js";import{o as dr,c as Se,i as pr,a as mr,m as je,p as yr,t as vr,b as xr,f as dt,d as _r}from"./tap.4df8a27d.js";import{u as gr}from"./index.3962126e.js";import{i as Oe}from"./isometric-grass-and-water.e6b4a19f.js";function Pe(i,e){return dr(function(t,r){var n=null,o=0,s=!1,a=function(){return s&&!n&&r.complete()};t.subscribe(Se(r,function(c){n==null||n.unsubscribe();var u=0,l=o++;pr(i(c,l)).subscribe(n=Se(r,function(h){return r.next(e?e(c,h,l,u++):h)},function(){n=null,a()}))},function(){s=!0,a()}))})}function br(i,e){return mr(e)?Pe(function(){return i},e):Pe(function(){return i})}function Cr(i,e,t){const r=new N(Y.WHITE);r.position.set((i.screen.width-100)/2,(i.screen.height-100)/2),r.width=100,r.height=100,r.tint=65280,r.acceleration=new S(0),r.mass=3;const n=new N(Y.WHITE);n.position.set(0,0),n.width=100,n.height=100,n.tint=16711680,n.acceleration=new S(0),n.mass=1,i.ticker.add(s=>{t.begin(),n.acceleration.set(n.acceleration.x*.99,n.acceleration.y*.99),r.acceleration.set(r.acceleration.x*.99,r.acceleration.y*.99);const a=new S(i.renderer.plugins.interaction.mouse.global.x-e.x,i.renderer.plugins.interaction.mouse.global.y-e.y);if((r.x<0||r.x>i.screen.width-100)&&(r.acceleration.x=-r.acceleration.x),(r.y<0||r.y>i.screen.height-100)&&(r.acceleration.y=-r.acceleration.y),(r.x<-30||r.x>i.screen.width+30||r.y<-30||r.y>i.screen.height+30)&&r.position.set((i.screen.width-100)/2,(i.screen.height-100)/2),i.screen.width>a.x||a.x>0||i.screen.height>a.y||a.y>0){const c=new S(n.x+n.width*.5,n.y+n.height*.5),u=new S(a.x-c.x,a.y-c.y),l=Math.atan2(u.y,u.x),p=jr(a,c)*Tr;n.acceleration.set(Math.cos(l)*p,Math.sin(l)*p)}if(Sr(r,n)){const c=Or(r,n);n.acceleration.set(c.x*r.mass,c.y*r.mass),r.acceleration.set(-(c.x*n.mass),-(c.y*n.mass))}r.x+=r.acceleration.x*s,r.y+=r.acceleration.y*s,n.x+=n.acceleration.x*s,n.y+=n.acceleration.y*s,t.end()});const o=new F;return o.addChild(n,r),o}const Tr=.05,wr=5;function Sr(i,e){const t=i.getBounds(),r=e.getBounds();return t.x<r.x+r.width&&t.x+t.width>r.x&&t.y<r.y+r.height&&t.y+t.height>r.y}function jr(i,e){const t=i.x-e.x,r=i.y-e.y;return Math.hypot(t,r)}function Or(i,e){if(!i||!e)return new S(0);const t=new S(e.x-i.x,e.y-i.y),r=Math.sqrt((e.x-i.x)*(e.x-i.x)+(e.y-i.y)*(e.y-i.y)),n=new S(t.x/r,t.y/r),o=new S(i.acceleration.x-e.acceleration.x,i.acceleration.y-e.acceleration.y),s=o.x*n.x+o.y*n.y,a=wr*s/(i.mass+e.mass);return new S(a*n.x,a*n.y)}const Pr=`precision highp float;
attribute vec3 aVertexPosition;
attribute vec2 aTextureCoord;
attribute vec4 aColor;
attribute float aTextureId;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;
varying vec4 vColor;
varying float vTextureId;

void main(void){
gl_Position.xyw = projectionMatrix * aVertexPosition;
gl_Position.z = 0.0;

vTextureCoord = aTextureCoord;
vTextureId = aTextureId;
vColor = aColor;
}
`,Dr=`
varying vec2 vTextureCoord;
varying vec4 vColor;
varying float vTextureId;
uniform sampler2D uSamplers[%count%];

void main(void){
vec4 color;
%forloop%
gl_FragColor = color * vColor;
}`;class Ar extends Ue{constructor(e=!1){super();this._buffer=new Ct(null,e,!1),this._indexBuffer=new Ct(null,e,!0),this.addAttribute("aVertexPosition",this._buffer,3,!1,E.FLOAT).addAttribute("aTextureCoord",this._buffer,2,!1,E.FLOAT).addAttribute("aColor",this._buffer,4,!0,E.UNSIGNED_BYTE).addAttribute("aTextureId",this._buffer,1,!0,E.FLOAT).addIndex(this._indexBuffer)}}class Fr{static create(e){const{vertex:t,fragment:r,vertexSize:n,geometryClass:o}=Object.assign({vertex:Pr,fragment:Dr,geometryClass:Ar,vertexSize:7},e);return class extends bt{constructor(a){super(a);this.shaderGenerator=new Re(t,r),this.geometryClass=o,this.vertexSize=n}packInterleavedGeometry(a,c,u,l,h){const{uint32View:p,float32View:d}=c,f=l/this.vertexSize,m=a.uvs,y=a.indices,_=a.vertexData,x=a.vertexData2d,b=a._texture.baseTexture._batchLocation,C=Math.min(a.worldAlpha,1),w=C<1&&a._texture.baseTexture.alphaMode?$e(a._tintRGB,C):a._tintRGB+(C*255<<24);if(x){let g=0;for(let T=0;T<x.length;T+=3,g+=2)d[l++]=x[T],d[l++]=x[T+1],d[l++]=x[T+2],d[l++]=m[g],d[l++]=m[g+1],p[l++]=w,d[l++]=b}else for(let g=0;g<_.length;g+=2)d[l++]=_[g],d[l++]=_[g+1],d[l++]=1,d[l++]=m[g],d[l++]=m[g+1],p[l++]=w,d[l++]=b;for(let g=0;g<y.length;g++)u[h++]=f+y[g]}}}}class Dt{constructor(e,t=!0){Dt.prototype.__init.call(this),this.legacy=e,t&&(this.enabled=!0),this.legacy.proj=this}__init(){this._enabled=!1}get enabled(){return this._enabled}set enabled(e){this._enabled=e}clear(){}}var z;(function(i){i[i.NONE=0]="NONE";const t=4;i[i.BEFORE_PROJ=t]="BEFORE_PROJ";const r=5;i[i.PROJ=r]="PROJ";const n=9;i[i.ALL=n]="ALL"})(z||(z={}));var L;(function(i){i[i.NONE=0]="NONE";const t=1;i[i.FREE=t]="FREE";const r=2;i[i.AXIS_X=r]="AXIS_X";const n=3;i[i.AXIS_Y=n]="AXIS_Y";const o=4;i[i.POINT=o]="POINT";const s=5;i[i.AXIS_XR=s]="AXIS_XR"})(L||(L={}));function zr(i){const e=this.proj,t=this,r=i._worldID,n=t.localTransform,o=e.scaleAfterAffine&&e.affine>=2;t._localID!==t._currentLocalID&&(o?(n.a=t._cx,n.b=t._sx,n.c=t._cy,n.d=t._sy,n.tx=t.position._x,n.ty=t.position._y):(n.a=t._cx*t.scale._x,n.b=t._sx*t.scale._x,n.c=t._cy*t.scale._y,n.d=t._sy*t.scale._y,n.tx=t.position._x-(t.pivot._x*n.a+t.pivot._y*n.c),n.ty=t.position._y-(t.pivot._x*n.b+t.pivot._y*n.d)),t._currentLocalID=t._localID,e._currentProjID=-1);const s=e._projID;if(e._currentProjID!==s&&(e._currentProjID=s,e.updateLocalTransform(n),t._parentID=-1),t._parentID!==r){const a=i.proj;a&&!a._affine?e.world.setToMult(a.world,e.local):e.world.setToMultLegacy(i.worldTransform,e.local);const c=t.worldTransform;e.world.copyTo(c,e._affine,e.affinePreserveOrientation),o&&(c.a*=t.scale._x,c.b*=t.scale._x,c.c*=t.scale._y,c.d*=t.scale._y,c.tx-=t.pivot._x*c.a+t.pivot._y*c.c,c.ty-=t.pivot._x*c.b+t.pivot._y*c.d),t._parentID=r,t._worldID++}}class W extends Dt{constructor(...e){super(...e);W.prototype.__init.call(this),W.prototype.__init2.call(this),W.prototype.__init3.call(this),W.prototype.__init4.call(this),W.prototype.__init5.call(this)}updateLocalTransform(e){}__init(){this._projID=0}__init2(){this._currentProjID=-1}__init3(){this._affine=L.NONE}__init4(){this.affinePreserveOrientation=!1}__init5(){this.scaleAfterAffine=!0}set affine(e){this._affine!==e&&(this._affine=e,this._currentProjID=-1,this.legacy._currentLocalID=-1)}get affine(){return this._affine}set enabled(e){e!==this._enabled&&(this._enabled=e,e?(this.legacy.updateTransform=zr,this.legacy._parentID=-1):(this.legacy.updateTransform=Pt.prototype.updateTransform,this.legacy._parentID=-1))}clear(){this._currentProjID=-1,this._projID=0}}class Tt extends bt{constructor(...e){super(...e);Tt.prototype.__init.call(this),Tt.prototype.__init2.call(this)}__init(){this.forceMaxTextures=0}getUniforms(e){return this.defUniforms}syncUniforms(e){if(!e)return;const t=this._shader;for(const r in e)t.uniforms[r]=e[r]}__init2(){this.defUniforms={}}buildDrawCalls(e,t,r){const n=this,{_bufferedElements:o,_attributeBuffer:s,_indexBuffer:a,vertexSize:c}=this,u=bt._drawCallPool;let l=this._dcIndex,h=this._aIndex,p=this._iIndex,d=u[l];d.start=this._iIndex,d.texArray=e;for(let f=t;f<r;++f){const m=o[f],y=m._texture.baseTexture,_=sr[y.alphaMode?1:0][m.blendMode],x=this.getUniforms(m);o[f]=null,t<f&&(d.blend!==_||d.uniforms!==x)&&(d.size=p-d.start,t=f,d=u[++l],d.texArray=e,d.start=p),this.packInterleavedGeometry(m,s,a,h,p),h+=m.vertexData.length/2*c,p+=m.indices.length,d.blend=_,d.uniforms=x}t<r&&(d.size=p-d.start,++l),n._dcIndex=l,n._aIndex=h,n._iIndex=p}drawBatches(){const e=this._dcIndex,{gl:t,state:r,shader:n}=this.renderer,o=bt._drawCallPool;let s=null,a=null;for(let c=0;c<e;c++){const{texArray:u,type:l,size:h,start:p,blend:d,uniforms:f}=o[c];a!==u&&(a=u,this.bindAndClearTexArray(u)),s!==f&&(s=f,this.syncUniforms(f),n.syncUniformGroup(this._shader.uniformGroup)),this.state.blendMode=d,r.set(this.state),t.drawElements(l,h,t.UNSIGNED_SHORT,p*2)}}contextChange(){if(!this.forceMaxTextures){super.contextChange(),this.syncUniforms(this.defUniforms);return}const e=this;e.MAX_TEXTURES=this.forceMaxTextures,this._shader=e.shaderGenerator.generateShader(this.MAX_TEXTURES),this.syncUniforms(this.defUniforms);for(let t=0;t<e._packedGeometryPoolSize;t++)e._packedGeometries[t]=new this.geometryClass;this.initFlushBuffers()}}de.registerPlugin("batch2d",Fr.create({}));function Mr(i,e,t,r,n){const o=e.x-i.x,s=t.x-r.x,a=t.x-i.x,c=e.y-i.y,u=t.y-r.y,l=t.y-i.y,h=o*u-c*s;if(Math.abs(h)<1e-7)return n.x=o,n.y=c,0;const p=a*u-l*s,d=o*l-c*a,f=p/h,m=d/h;return m<1e-6||m-1>-1e-6?-1:(n.x=i.x+f*(e.x-i.x),n.y=i.y+f*(e.y-i.y),1)}const Ir=[1,0,0,0,1,0,0,0,1];class M{static __initStatic(){this.IDENTITY=new M}static __initStatic2(){this.TEMP_MATRIX=new M}__init(){this.floatArray=null}constructor(e){M.prototype.__init.call(this),this.mat3=new Float64Array(e||Ir)}get a(){return this.mat3[0]/this.mat3[8]}set a(e){this.mat3[0]=e*this.mat3[8]}get b(){return this.mat3[1]/this.mat3[8]}set b(e){this.mat3[1]=e*this.mat3[8]}get c(){return this.mat3[3]/this.mat3[8]}set c(e){this.mat3[3]=e*this.mat3[8]}get d(){return this.mat3[4]/this.mat3[8]}set d(e){this.mat3[4]=e*this.mat3[8]}get tx(){return this.mat3[6]/this.mat3[8]}set tx(e){this.mat3[6]=e*this.mat3[8]}get ty(){return this.mat3[7]/this.mat3[8]}set ty(e){this.mat3[7]=e*this.mat3[8]}set(e,t,r,n,o,s){const a=this.mat3;return a[0]=e,a[1]=t,a[2]=0,a[3]=r,a[4]=n,a[5]=0,a[6]=o,a[7]=s,a[8]=1,this}toArray(e,t){this.floatArray||(this.floatArray=new Float32Array(9));const r=t||this.floatArray,n=this.mat3;return e?(r[0]=n[0],r[1]=n[1],r[2]=n[2],r[3]=n[3],r[4]=n[4],r[5]=n[5],r[6]=n[6],r[7]=n[7],r[8]=n[8]):(r[0]=n[0],r[1]=n[3],r[2]=n[6],r[3]=n[1],r[4]=n[4],r[5]=n[7],r[6]=n[2],r[7]=n[5],r[8]=n[8]),r}apply(e,t){t=t||new S;const r=this.mat3,n=e.x,o=e.y,s=1/(r[2]*n+r[5]*o+r[8]);return t.x=s*(r[0]*n+r[3]*o+r[6]),t.y=s*(r[1]*n+r[4]*o+r[7]),t}translate(e,t){const r=this.mat3;return r[0]+=e*r[2],r[1]+=t*r[2],r[3]+=e*r[5],r[4]+=t*r[5],r[6]+=e*r[8],r[7]+=t*r[8],this}scale(e,t){const r=this.mat3;return r[0]*=e,r[1]*=t,r[3]*=e,r[4]*=t,r[6]*=e,r[7]*=t,this}scaleAndTranslate(e,t,r,n){const o=this.mat3;o[0]=e*o[0]+r*o[2],o[1]=t*o[1]+n*o[2],o[3]=e*o[3]+r*o[5],o[4]=t*o[4]+n*o[5],o[6]=e*o[6]+r*o[8],o[7]=t*o[7]+n*o[8]}applyInverse(e,t){t=t||new S;const r=this.mat3,n=e.x,o=e.y,s=r[0],a=r[3],c=r[6],u=r[1],l=r[4],h=r[7],p=r[2],d=r[5],f=r[8],m=(f*l-h*d)*n+(-f*a+c*d)*o+(h*a-c*l),y=(-f*u+h*p)*n+(f*s-c*p)*o+(-h*s+c*u),_=(d*u-l*p)*n+(-d*s+a*p)*o+(l*s-a*u);return t.x=m/_,t.y=y/_,t}invert(){const e=this.mat3,t=e[0],r=e[1],n=e[2],o=e[3],s=e[4],a=e[5],c=e[6],u=e[7],l=e[8],h=l*s-a*u,p=-l*o+a*c,d=u*o-s*c;let f=t*h+r*p+n*d;return f?(f=1/f,e[0]=h*f,e[1]=(-l*r+n*u)*f,e[2]=(a*r-n*s)*f,e[3]=p*f,e[4]=(l*t-n*c)*f,e[5]=(-a*t+n*o)*f,e[6]=d*f,e[7]=(-u*t+r*c)*f,e[8]=(s*t-r*o)*f,this):this}identity(){const e=this.mat3;return e[0]=1,e[1]=0,e[2]=0,e[3]=0,e[4]=1,e[5]=0,e[6]=0,e[7]=0,e[8]=1,this}clone(){return new M(this.mat3)}copyTo2dOr3d(e){const t=this.mat3,r=e.mat3;return r[0]=t[0],r[1]=t[1],r[2]=t[2],r[3]=t[3],r[4]=t[4],r[5]=t[5],r[6]=t[6],r[7]=t[7],r[8]=t[8],e}copyTo(e,t,r){const n=this.mat3,o=1/n[8],s=n[6]*o,a=n[7]*o;if(e.a=(n[0]-n[2]*s)*o,e.b=(n[1]-n[2]*a)*o,e.c=(n[3]-n[5]*s)*o,e.d=(n[4]-n[5]*a)*o,e.tx=s,e.ty=a,t>=2){let c=e.a*e.d-e.b*e.c;r||(c=Math.abs(c)),t===L.POINT?(c>0?c=1:c=-1,e.a=c,e.b=0,e.c=0,e.d=c):t===L.AXIS_X?(c/=Math.sqrt(e.b*e.b+e.d*e.d),e.c=0,e.d=c):t===L.AXIS_Y?(c/=Math.sqrt(e.a*e.a+e.c*e.c),e.a=c,e.c=0):t===L.AXIS_XR&&(e.a=e.d*c,e.c=-e.b*c)}return e}copyFrom(e){const t=this.mat3;return t[0]=e.a,t[1]=e.b,t[2]=0,t[3]=e.c,t[4]=e.d,t[5]=0,t[6]=e.tx,t[7]=e.ty,t[8]=1,this}setToMultLegacy(e,t){const r=this.mat3,n=t.mat3,o=e.a,s=e.b,a=e.c,c=e.d,u=e.tx,l=e.ty,h=n[0],p=n[1],d=n[2],f=n[3],m=n[4],y=n[5],_=n[6],x=n[7],b=n[8];return r[0]=h*o+p*a+d*u,r[1]=h*s+p*c+d*l,r[2]=d,r[3]=f*o+m*a+y*u,r[4]=f*s+m*c+y*l,r[5]=y,r[6]=_*o+x*a+b*u,r[7]=_*s+x*c+b*l,r[8]=b,this}setToMultLegacy2(e,t){const r=this.mat3,n=e.mat3,o=n[0],s=n[1],a=n[2],c=n[3],u=n[4],l=n[5],h=n[6],p=n[7],d=n[8],f=t.a,m=t.b,y=t.c,_=t.d,x=t.tx,b=t.ty;return r[0]=f*o+m*c,r[1]=f*s+m*u,r[2]=f*a+m*l,r[3]=y*o+_*c,r[4]=y*s+_*u,r[5]=y*a+_*l,r[6]=x*o+b*c+h,r[7]=x*s+b*u+p,r[8]=x*a+b*l+d,this}setToMult(e,t){const r=this.mat3,n=e.mat3,o=t.mat3,s=n[0],a=n[1],c=n[2],u=n[3],l=n[4],h=n[5],p=n[6],d=n[7],f=n[8],m=o[0],y=o[1],_=o[2],x=o[3],b=o[4],C=o[5],w=o[6],g=o[7],T=o[8];return r[0]=m*s+y*u+_*p,r[1]=m*a+y*l+_*d,r[2]=m*c+y*h+_*f,r[3]=x*s+b*u+C*p,r[4]=x*a+b*l+C*d,r[5]=x*c+b*h+C*f,r[6]=w*s+g*u+T*p,r[7]=w*a+g*l+T*d,r[8]=w*c+g*h+T*f,this}prepend(e){return e.mat3?this.setToMult(e,this):this.setToMultLegacy(e,this)}}M.__initStatic();M.__initStatic2();const De=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform mat3 uTransform;

varying vec3 vTextureCoord;

void main(void)
{
gl_Position.xyw = projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0);

vTextureCoord = uTransform * vec3(aTextureCoord, 1.0);
}
`,Lr=`
varying vec3 vTextureCoord;

uniform sampler2D uSampler;
uniform vec4 uColor;
uniform mat3 uMapCoord;
uniform vec4 uClampFrame;
uniform vec2 uClampOffset;

void main(void)
{
vec2 coord = mod(vTextureCoord.xy / vTextureCoord.z - uClampOffset, vec2(1.0, 1.0)) + uClampOffset;
coord = (uMapCoord * vec3(coord, 1.0)).xy;
coord = clamp(coord, uClampFrame.xy, uClampFrame.zw);

vec4 sample = texture2D(uSampler, coord);
gl_FragColor = sample * uColor;
}
`,Rr=`
varying vec3 vTextureCoord;

uniform sampler2D uSampler;
uniform vec4 uColor;

void main(void)
{
vec4 sample = texture2D(uSampler, vTextureCoord.xy / vTextureCoord.z);
gl_FragColor = sample * uColor;
}
`,H=new M;class ye extends er{constructor(e){super(e);ye.prototype.__init.call(this);const t={globals:this.renderer.globalUniforms};this.shader=Ce.from(De,Lr,t),this.simpleShader=Ce.from(De,Rr,t)}__init(){this.quad=new rr}render(e){const t=this.renderer,r=this.quad;let n=r.vertices;n[0]=n[6]=e._width*-e.anchor.x,n[1]=n[3]=e._height*-e.anchor.y,n[2]=n[4]=e._width*(1-e.anchor.x),n[5]=n[7]=e._height*(1-e.anchor.y),e.uvRespectAnchor&&(n=r.uvs,n[0]=n[6]=-e.anchor.x,n[1]=n[3]=-e.anchor.y,n[2]=n[4]=1-e.anchor.x,n[5]=n[7]=1-e.anchor.y),r.invalidate();const o=e._texture,s=o.baseTexture,a=e.tileProj.world,c=e.uvMatrix;let u=s.isPowerOfTwo&&o.frame.width===s.width&&o.frame.height===s.height;u&&(s._glTextures[t.CONTEXT_UID]?u=s.wrapMode!==zt.CLAMP:s.wrapMode===zt.CLAMP&&(s.wrapMode=zt.REPEAT));const l=u?this.simpleShader:this.shader;H.identity(),H.scale(o.width,o.height),H.prepend(a),H.scale(1/e._width,1/e._height),H.invert(),u?H.prepend(c.mapCoord):(l.uniforms.uMapCoord=c.mapCoord.toArray(!0),l.uniforms.uClampFrame=c.uClampFrame,l.uniforms.uClampOffset=c.uClampOffset),l.uniforms.uTransform=H.toArray(!0),l.uniforms.uColor=nr(e.tint,e.worldAlpha,l.uniforms.uColor,s.premultiplyAlpha),l.uniforms.translationMatrix=e.worldTransform.toArray(!0),l.uniforms.uSampler=o,t.shader.bind(l,!1),t.geometry.bind(r,void 0),t.state.setBlendMode(or(e.blendMode,s.premultiplyAlpha)),t.geometry.draw(ir.TRIANGLES,6,0)}}const A=new S,G=[new S,new S,new S,new S],ct=new qe,Ae=new M;class k extends W{constructor(e,t){super(e,t);k.prototype.__init.call(this),k.prototype.__init2.call(this),k.prototype.__init3.call(this),this.local=new M,this.world=new M}__init(){this.matrix=new M}__init2(){this.pivot=new pe(this.onChange,this,0,0)}__init3(){this.reverseLocalOrder=!1}onChange(){const e=this.pivot,t=this.matrix.mat3;t[6]=-(e._x*t[0]+e._y*t[3]),t[7]=-(e._x*t[1]+e._y*t[4]),this._projID++}setAxisX(e,t=1){const r=e.x,n=e.y,o=Math.sqrt(r*r+n*n),s=this.matrix.mat3;s[0]=r/o,s[1]=n/o,s[2]=t/o,this.onChange()}setAxisY(e,t=1){const r=e.x,n=e.y,o=Math.sqrt(r*r+n*n),s=this.matrix.mat3;s[3]=r/o,s[4]=n/o,s[5]=t/o,this.onChange()}mapSprite(e,t){const r=e.texture;ct.x=-e.anchor.x*r.orig.width,ct.y=-e.anchor.y*r.orig.height,ct.width=r.orig.width,ct.height=r.orig.height,this.mapQuad(ct,t)}mapQuad(e,t){G[0].set(e.x,e.y),G[1].set(e.x+e.width,e.y),G[2].set(e.x+e.width,e.y+e.height),G[3].set(e.x,e.y+e.height);let r=1,n=2,o=3;if(Mr(t[0],t[2],t[1],t[3],A)!==0)r=1,n=3,o=2;else return;const a=Math.sqrt((t[0].x-A.x)*(t[0].x-A.x)+(t[0].y-A.y)*(t[0].y-A.y)),c=Math.sqrt((t[r].x-A.x)*(t[r].x-A.x)+(t[r].y-A.y)*(t[r].y-A.y)),u=Math.sqrt((t[n].x-A.x)*(t[n].x-A.x)+(t[n].y-A.y)*(t[n].y-A.y)),l=Math.sqrt((t[o].x-A.x)*(t[o].x-A.x)+(t[o].y-A.y)*(t[o].y-A.y)),h=(a+l)/l,p=(c+u)/u,d=(c+u)/c;let f=this.matrix.mat3;f[0]=G[0].x*h,f[1]=G[0].y*h,f[2]=h,f[3]=G[r].x*p,f[4]=G[r].y*p,f[5]=p,f[6]=G[n].x*d,f[7]=G[n].y*d,f[8]=d,this.matrix.invert(),f=Ae.mat3,f[0]=t[0].x,f[1]=t[0].y,f[2]=1,f[3]=t[r].x,f[4]=t[r].y,f[5]=1,f[6]=t[n].x,f[7]=t[n].y,f[8]=1,this.matrix.setToMult(Ae,this.matrix),this._projID++}updateLocalTransform(e){this._projID!==0?this.reverseLocalOrder?this.local.setToMultLegacy2(this.matrix,e):this.local.setToMultLegacy(e,this.matrix):this.local.copyFrom(e)}clear(){super.clear(),this.matrix.identity(),this.pivot.set(0,0)}}function $r(){return this.proj.affine?this.transform.worldTransform:this.proj.world}class Ke extends F{constructor(){super();this.proj=new k(this.transform)}toLocal(e,t,r,n,o=z.ALL){return t&&(e=t.toGlobal(e,r,n)),n||this._recursivePostUpdateTransform(),o>=z.PROJ?(n||this.displayObjectUpdateTransform(),this.proj.affine?this.transform.worldTransform.applyInverse(e,r):this.proj.world.applyInverse(e,r)):(this.parent?r=this.parent.worldTransform.applyInverse(e,r):(r.x=e.x,r.y=e.y),o===z.NONE?r:this.transform.localTransform.applyInverse(r,r))}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}}const ve=Ke.prototype.toLocal;function Vr(i){let e,t=i[0],r=1;for(;r<i.length;){const n=i[r],o=i[r+1];if(r+=2,(n==="optionalAccess"||n==="optionalCall")&&t==null)return;n==="access"||n==="optionalAccess"?(e=t,t=o(t)):(n==="call"||n==="optionalCall")&&(t=o((...s)=>t.call(e,...s)),e=void 0)}return t}class B extends Xe{static __initStatic(){this.defaultVertexShader=`precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform mat3 uTextureMatrix;

varying vec2 vTextureCoord;

void main(void)
{
gl_Position.xyw = projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0);
gl_Position.z = 0.0;

vTextureCoord = (uTextureMatrix * vec3(aTextureCoord, 1.0)).xy;
}
`}static __initStatic2(){this.defaultFragmentShader=`
varying vec2 vTextureCoord;
uniform vec4 uColor;

uniform sampler2D uSampler;

void main(void)
{
gl_FragColor = texture2D(uSampler, vTextureCoord) * uColor;
}`}constructor(e,t,r,n){super(e,t,r,n);B.prototype.__init.call(this),this.proj=new k(this.transform)}__init(){this.vertexData2d=null}calculateVertices(){if(this.proj._affine){this.vertexData2d=null,super.calculateVertices();return}const e=this.geometry,t=e.buffers[0].data,r=this;if(e.vertexDirtyId===r.vertexDirty&&r._transformID===r.transform._worldID)return;r._transformID=r.transform._worldID,r.vertexData.length!==t.length&&(r.vertexData=new Float32Array(t.length)),(!this.vertexData2d||this.vertexData2d.length!==t.length*3/2)&&(this.vertexData2d=new Float32Array(t.length*3));const n=this.proj.world.mat3,o=this.vertexData2d,s=r.vertexData;for(let a=0;a<s.length/2;a++){const c=t[a*2],u=t[a*2+1],l=n[0]*c+n[3]*u+n[6],h=n[1]*c+n[4]*u+n[7],p=n[2]*c+n[5]*u+n[8];o[a*3]=l,o[a*3+1]=h,o[a*3+2]=p,s[a*2]=l/p,s[a*2+1]=h/p}r.vertexDirty=e.vertexDirtyId}_renderDefault(e){const t=this.shader;t.alpha=this.worldAlpha,t.update&&t.update(),e.batch.flush(),Vr([t,"access",r=>r.program,"access",r=>r.uniformData,"optionalAccess",r=>r.translationMatrix])&&(t.uniforms.translationMatrix=this.worldTransform.toArray(!0)),e.shader.bind(t,!1),e.state.set(this.state),e.geometry.bind(this.geometry,t),e.geometry.draw(this.drawMode,this.size,this.start,this.geometry.instanceCount)}toLocal(e,t,r,n,o=z.ALL){return ve.call(this,e,t,r,n,o)}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}}B.__initStatic();B.__initStatic2();class $ extends N{constructor(e){super(e);$.prototype.__init.call(this),this.proj=new k(this.transform),this.pluginName="batch2d"}__init(){this.vertexData2d=null}_calculateBounds(){this.calculateTrimmedVertices(),this._bounds.addQuad(this.vertexTrimmedData)}calculateVertices(){const e=this._texture,t=this;if(this.proj._affine){this.vertexData2d=null,super.calculateVertices();return}this.vertexData2d||(this.vertexData2d=new Float32Array(12));const r=this.transform._worldID,n=e._updateID;if(t._transformID===r&&this._textureID===n)return;this._textureID!==n&&(this.uvs=e._uvs.uvsFloat32),t._transformID=r,this._textureID=n;const o=this.proj.world.mat3,s=this.vertexData2d,a=this.vertexData,c=e.trim,u=e.orig,l=this._anchor;let h,p,d,f;c?(p=c.x-l._x*u.width,h=p+c.width,f=c.y-l._y*u.height,d=f+c.height):(p=-l._x*u.width,h=p+u.width,f=-l._y*u.height,d=f+u.height),s[0]=o[0]*p+o[3]*f+o[6],s[1]=o[1]*p+o[4]*f+o[7],s[2]=o[2]*p+o[5]*f+o[8],s[3]=o[0]*h+o[3]*f+o[6],s[4]=o[1]*h+o[4]*f+o[7],s[5]=o[2]*h+o[5]*f+o[8],s[6]=o[0]*h+o[3]*d+o[6],s[7]=o[1]*h+o[4]*d+o[7],s[8]=o[2]*h+o[5]*d+o[8],s[9]=o[0]*p+o[3]*d+o[6],s[10]=o[1]*p+o[4]*d+o[7],s[11]=o[2]*p+o[5]*d+o[8],a[0]=s[0]/s[2],a[1]=s[1]/s[2],a[2]=s[3]/s[5],a[3]=s[4]/s[5],a[4]=s[6]/s[8],a[5]=s[7]/s[8],a[6]=s[9]/s[11],a[7]=s[10]/s[11]}calculateTrimmedVertices(){if(this.proj._affine){super.calculateTrimmedVertices();return}const e=this.transform._worldID,t=this._texture._updateID,r=this;if(!r.vertexTrimmedData)r.vertexTrimmedData=new Float32Array(8);else if(r._transformTrimmedID===e&&this._textureTrimmedID===t)return;r._transformTrimmedID=e,this._textureTrimmedID=t;const n=this._texture,o=r.vertexTrimmedData,s=n.orig,a=this.tileProj?this._width:s.width,c=this.tileProj?this._height:s.height,u=this._anchor,l=this.proj.world.mat3,h=-u._x*a,p=h+a,d=-u._y*c,f=d+c;let m=1/(l[2]*h+l[5]*d+l[8]);o[0]=m*(l[0]*h+l[3]*d+l[6]),o[1]=m*(l[1]*h+l[4]*d+l[7]),m=1/(l[2]*p+l[5]*d+l[8]),o[2]=m*(l[0]*p+l[3]*d+l[6]),o[3]=m*(l[1]*p+l[4]*d+l[7]),m=1/(l[2]*p+l[5]*f+l[8]),o[4]=m*(l[0]*p+l[3]*f+l[6]),o[5]=m*(l[1]*p+l[4]*f+l[7]),m=1/(l[2]*h+l[5]*f+l[8]),o[6]=m*(l[0]*h+l[3]*f+l[6]),o[7]=m*(l[1]*h+l[4]*f+l[7])}toLocal(e,t,r,n,o=z.ALL){return ve.call(this,e,t,r,n,o)}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}}const kr=new Pt;class Er extends Ne{constructor(e,t,r){super(e,t,r);this.tileProj=new k(this.tileTransform),this.tileProj.reverseLocalOrder=!0,this.proj=new k(this.transform),this.pluginName="tilingSprite2d",this.uvRespectAnchor=!0}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}toLocal(e,t,r,n,o=z.ALL){return ve.call(this,e,t,r,n,o)}_render(e){const t=this._texture;!t||!t.valid||(this.tileTransform.updateTransform(kr),this.uvMatrix.update(),e.batch.setObjectRenderer(e.plugins[this.pluginName]),e.plugins[this.pluginName].render(this))}}function At(){this.proj||(this.proj=new k(this.transform),this.toLocal=Ke.prototype.toLocal,Object.defineProperty(this,"worldTransform",{get:$r,enumerable:!0,configurable:!0}))}F.prototype.convertTo2d=At;N.prototype.convertTo2d=function(){this.proj||(this.calculateVertices=$.prototype.calculateVertices,this.calculateTrimmedVertices=$.prototype.calculateTrimmedVertices,this._calculateBounds=$.prototype._calculateBounds,this.pluginName="batch2d",At.call(this))};F.prototype.convertSubtreeTo2d=function(){this.convertTo2d();for(let e=0;e<this.children.length;e++)this.children[e].convertSubtreeTo2d()};Ve.prototype.convertTo2d=ke.prototype.convertTo2d=function(){this.proj||(this.calculateVertices=B.prototype.calculateVertices,this._renderDefault=B.prototype._renderDefault,this.material.pluginName!=="batch2d"&&(this.material=new Ee(this.material.texture,{program:Be.from(B.defaultVertexShader,B.defaultFragmentShader),pluginName:"batch2d"})),At.call(this))};Ne.prototype.convertTo2d=function(){this.proj||(this.tileProj=new k(this.tileTransform),this.tileProj.reverseLocalOrder=!0,this.uvRespectAnchor=!0,this.calculateTrimmedVertices=$.prototype.calculateTrimmedVertices,this._calculateBounds=$.prototype._calculateBounds,this._render=Er.prototype._render,this.pluginName="tilingSprite2d",At.call(this))};class _t extends me{constructor(e,t,r){super(e,t,r);_t.prototype.__init.call(this),this.proj=new k(this.transform),this.pluginName="batch2d"}__init(){this.vertexData2d=null}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}}_t.prototype.calculateVertices=$.prototype.calculateVertices;_t.prototype.calculateTrimmedVertices=$.prototype.calculateTrimmedVertices;_t.prototype._calculateBounds=$.prototype._calculateBounds;const Br=`
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;
uniform mat3 otherMatrix;

varying vec3 vMaskCoord;
varying vec2 vTextureCoord;

void main(void)
{
gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);

vTextureCoord = aTextureCoord;
vMaskCoord = otherMatrix * vec3( aTextureCoord, 1.0);
}
`,Nr=`
varying vec3 vMaskCoord;
varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform sampler2D mask;
uniform float alpha;
uniform vec4 maskClamp;

void main(void)
{
vec2 uv = vMaskCoord.xy / vMaskCoord.z;

float clip = step(3.5,
    step(maskClamp.x, uv.x) +
    step(maskClamp.y, uv.y) +
    step(uv.x, maskClamp.z) +
    step(uv.y, maskClamp.w));

vec4 original = texture2D(uSampler, vTextureCoord);
vec4 masky = texture2D(mask, uv);

original *= (masky.r * masky.a * alpha * clip);

gl_FragColor = original;
}
`,Fe=new M;class wt extends j{constructor(e){super(Br,Nr);wt.prototype.__init.call(this),e.renderable=!1,this.maskSprite=e}__init(){this.maskMatrix=new M}apply(e,t,r,n){const o=this.maskSprite,s=this.maskSprite.texture;!s.valid||(s.uvMatrix||(s.uvMatrix=new Ge(s,0)),s.uvMatrix.update(),this.uniforms.npmAlpha=s.baseTexture.alphaMode?0:1,this.uniforms.mask=o.texture,this.uniforms.otherMatrix=wt.calculateSpriteMatrix(t,this.maskMatrix,o).prepend(s.uvMatrix.mapCoord),this.uniforms.alpha=o.worldAlpha,this.uniforms.maskClamp=s.uvMatrix.uClampFrame,e.applyFilter(this,t,r,n))}static calculateSpriteMatrix(e,t,r){const n=r.proj,o=e.filterFrame,s=n&&!n._affine?n.world.copyTo2dOr3d(Fe):Fe.copyFrom(r.transform.worldTransform),a=r.texture.orig;return t.set(e.width,0,0,e.height,o.x,o.y),s.invert(),t.setToMult(s,t),t.scaleAndTranslate(1/a.width,1/a.height,r.anchor.x,r.anchor.y),t}}tr.prototype.pushSpriteMask=function(e){const{maskObject:t}=e,r=e._target;let n=this.alphaMaskPool[this.alphaMaskIndex];n||(n=this.alphaMaskPool[this.alphaMaskIndex]=[new wt(t)]),n[0].resolution=this.renderer.resolution,n[0].maskSprite=t;const o=r.filterArea;r.filterArea=t.getBounds(!0),this.renderer.filter.push(r,n),r.filterArea=o,this.alphaMaskIndex++};de.registerPlugin("tilingSprite2d",ye);class ze extends S{constructor(e,t,r){super(e,t);this.z=r}set(e,t,r){return this.x=e||0,this.y=t===void 0?this.x:t||0,this.z=t===void 0?this.x:r||0,this}copyFrom(e){return this.set(e.x,e.y,e.z||0),this}copyTo(e){return e.set(this.x,this.y,this.z),e}}class pt extends pe{constructor(...e){super(...e);pt.prototype.__init.call(this)}__init(){this._z=0}get z(){return this._z}set z(e){this._z!==e&&(this._z=e,this.cb.call(this.scope))}set(e,t,r){const n=e||0,o=t===void 0?n:t||0,s=t===void 0?n:r||0;return(this._x!==n||this._y!==o||this._z!==s)&&(this._x=n,this._y=o,this._z=s,this.cb.call(this.scope)),this}copyFrom(e){return this.set(e.x,e.y,e.z||0),this}copyTo(e){return e.set(this._x,this._y,this._z),e}}class tt{constructor(e,t,r){tt.prototype.__init.call(this),tt.prototype.__init2.call(this),tt.prototype.__init3.call(this),this._x=e||0,this._y=t||0,this._z=r||0,this.quaternion=new Float64Array(4),this.quaternion[3]=1,this.update()}__init(){this._quatUpdateId=-1}__init2(){this._quatDirtyId=0}__init3(){this._sign=1}get x(){return this._x}set x(e){this._x!==e&&(this._x=e,this._quatDirtyId++)}get y(){return this._y}set y(e){this._y!==e&&(this._y=e,this._quatDirtyId++)}get z(){return this._z}set z(e){this._z!==e&&(this._z=e,this._quatDirtyId++)}get pitch(){return this._x}set pitch(e){this._x!==e&&(this._x=e,this._quatDirtyId++)}get yaw(){return this._y}set yaw(e){this._y!==e&&(this._y=e,this._quatDirtyId++)}get roll(){return this._z}set roll(e){this._z!==e&&(this._z=e,this._quatDirtyId++)}set(e,t,r){const n=e||0,o=t||0,s=r||0;(this._x!==n||this._y!==o||this._z!==s)&&(this._x=n,this._y=o,this._z=s,this._quatDirtyId++)}copyFrom(e){const t=e.x,r=e.y,n=e.z;return(this._x!==t||this._y!==r||this._z!==n)&&(this._x=t,this._y=r,this._z=n,this._quatDirtyId++),this}copyTo(e){return e.set(this._x,this._y,this._z),e}equals(e){return this._x===e.x&&this._y===e.y&&this._z===e.z}clone(){return new tt(this._x,this._y,this._z)}update(){if(this._quatUpdateId===this._quatDirtyId)return!1;this._quatUpdateId=this._quatDirtyId;const e=Math.cos(this._x/2),t=Math.cos(this._y/2),r=Math.cos(this._z/2),n=this._sign,o=n*Math.sin(this._x/2),s=n*Math.sin(this._y/2),a=n*Math.sin(this._z/2),c=this.quaternion;return c[0]=o*t*r+e*s*a,c[1]=e*s*r-o*t*a,c[2]=e*t*a+o*s*r,c[3]=e*t*r-o*s*a,!0}}class mt{constructor(e,t,r,n,o){this.cb=e,this.scope=t,mt.prototype.__init.call(this),mt.prototype.__init2.call(this),mt.prototype.__init3.call(this),this._x=r||0,this._y=n||0,this._z=o||0,this.quaternion=new Float64Array(4),this.quaternion[3]=1,this.update()}__init(){this._quatUpdateId=-1}__init2(){this._quatDirtyId=0}__init3(){this._sign=1}get x(){return this._x}set x(e){this._x!==e&&(this._x=e,this._quatDirtyId++,this.cb.call(this.scope))}get y(){return this._y}set y(e){this._y!==e&&(this._y=e,this._quatDirtyId++,this.cb.call(this.scope))}get z(){return this._z}set z(e){this._z!==e&&(this._z=e,this._quatDirtyId++,this.cb.call(this.scope))}get pitch(){return this._x}set pitch(e){this._x!==e&&(this._x=e,this._quatDirtyId++,this.cb.call(this.scope))}get yaw(){return this._y}set yaw(e){this._y!==e&&(this._y=e,this._quatDirtyId++,this.cb.call(this.scope))}get roll(){return this._z}set roll(e){this._z!==e&&(this._z=e,this._quatDirtyId++,this.cb.call(this.scope))}set(e,t,r){const n=e||0,o=t||0,s=r||0;return(this._x!==n||this._y!==o||this._z!==s)&&(this._x=n,this._y=o,this._z=s,this._quatDirtyId++,this.cb.call(this.scope)),this}copyFrom(e){const t=e.x,r=e.y,n=e.z;return(this._x!==t||this._y!==r||this._z!==n)&&(this._x=t,this._y=r,this._z=n,this._quatDirtyId++,this.cb.call(this.scope)),this}copyTo(e){return e.set(this._x,this._y,this._z),e}equals(e){return this._x===e.x&&this._y===e.y&&this._z===e.z}clone(){return new tt(this._x,this._y,this._z)}update(){if(this._quatUpdateId===this._quatDirtyId)return!1;this._quatUpdateId=this._quatDirtyId;const e=Math.cos(this._x/2),t=Math.cos(this._y/2),r=Math.cos(this._z/2),n=this._sign,o=n*Math.sin(this._x/2),s=n*Math.sin(this._y/2),a=n*Math.sin(this._z/2),c=this.quaternion;return c[0]=o*t*r+e*s*a,c[1]=e*s*r-o*t*a,c[2]=e*t*a+o*s*r,c[3]=e*t*r-o*s*a,!0}}const qr=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];class D{static __initStatic(){this.IDENTITY=new D}static __initStatic2(){this.TEMP_MATRIX=new D}__init(){this.floatArray=null}__init2(){this._dirtyId=0}__init3(){this._updateId=-1}__init4(){this._mat4inv=null}__init5(){this.cacheInverse=!1}constructor(e){D.prototype.__init.call(this),D.prototype.__init2.call(this),D.prototype.__init3.call(this),D.prototype.__init4.call(this),D.prototype.__init5.call(this),this.mat4=new Float64Array(e||qr)}get a(){return this.mat4[0]/this.mat4[15]}set a(e){this.mat4[0]=e*this.mat4[15]}get b(){return this.mat4[1]/this.mat4[15]}set b(e){this.mat4[1]=e*this.mat4[15]}get c(){return this.mat4[4]/this.mat4[15]}set c(e){this.mat4[4]=e*this.mat4[15]}get d(){return this.mat4[5]/this.mat4[15]}set d(e){this.mat4[5]=e*this.mat4[15]}get tx(){return this.mat4[12]/this.mat4[15]}set tx(e){this.mat4[12]=e*this.mat4[15]}get ty(){return this.mat4[13]/this.mat4[15]}set ty(e){this.mat4[13]=e*this.mat4[15]}set(e,t,r,n,o,s){const a=this.mat4;return a[0]=e,a[1]=t,a[2]=0,a[3]=0,a[4]=r,a[5]=n,a[6]=0,a[7]=0,a[8]=0,a[9]=0,a[10]=1,a[11]=0,a[12]=o,a[13]=s,a[14]=0,a[15]=1,this}toArray(e,t){this.floatArray||(this.floatArray=new Float32Array(9));const r=t||this.floatArray,n=this.mat4;return e?(r[0]=n[0],r[1]=n[1],r[2]=n[3],r[3]=n[4],r[4]=n[5],r[5]=n[7],r[6]=n[12],r[7]=n[13],r[8]=n[15]):(r[0]=n[0],r[1]=n[4],r[2]=n[12],r[3]=n[2],r[4]=n[6],r[5]=n[13],r[6]=n[3],r[7]=n[7],r[8]=n[15]),r}setToTranslation(e,t,r){const n=this.mat4;n[0]=1,n[1]=0,n[2]=0,n[3]=0,n[4]=0,n[5]=1,n[6]=0,n[7]=0,n[8]=0,n[9]=0,n[10]=1,n[11]=0,n[12]=e,n[13]=t,n[14]=r,n[15]=1}setToRotationTranslationScale(e,t,r,n,o,s,a){const c=this.mat4,u=e[0],l=e[1],h=e[2],p=e[3],d=u+u,f=l+l,m=h+h,y=u*d,_=u*f,x=u*m,b=l*f,C=l*m,w=h*m,g=p*d,T=p*f,O=p*m;return c[0]=(1-(b+w))*o,c[1]=(_+O)*o,c[2]=(x-T)*o,c[3]=0,c[4]=(_-O)*s,c[5]=(1-(y+w))*s,c[6]=(C+g)*s,c[7]=0,c[8]=(x+T)*a,c[9]=(C-g)*a,c[10]=(1-(y+b))*a,c[11]=0,c[12]=t,c[13]=r,c[14]=n,c[15]=1,c}apply(e,t){t=t||new ze;const r=this.mat4,n=e.x,o=e.y,s=e.z||0,a=1/(r[3]*n+r[7]*o+r[11]*s+r[15]);return t.x=a*(r[0]*n+r[4]*o+r[8]*s+r[12]),t.y=a*(r[1]*n+r[5]*o+r[9]*s+r[13]),t.z=a*(r[2]*n+r[6]*o+r[10]*s+r[14]),t}translate(e,t,r){const n=this.mat4;return n[12]=n[0]*e+n[4]*t+n[8]*r+n[12],n[13]=n[1]*e+n[5]*t+n[9]*r+n[13],n[14]=n[2]*e+n[6]*t+n[10]*r+n[14],n[15]=n[3]*e+n[7]*t+n[11]*r+n[15],this}scale(e,t,r){const n=this.mat4;return n[0]*=e,n[1]*=e,n[2]*=e,n[3]*=e,n[4]*=t,n[5]*=t,n[6]*=t,n[7]*=t,r!==void 0&&(n[8]*=r,n[9]*=r,n[10]*=r,n[11]*=r),this}scaleAndTranslate(e,t,r,n,o,s){const a=this.mat4;a[0]=e*a[0]+n*a[3],a[1]=t*a[1]+o*a[3],a[2]=r*a[2]+s*a[3],a[4]=e*a[4]+n*a[7],a[5]=t*a[5]+o*a[7],a[6]=r*a[6]+s*a[7],a[8]=e*a[8]+n*a[11],a[9]=t*a[9]+o*a[11],a[10]=r*a[10]+s*a[11],a[12]=e*a[12]+n*a[15],a[13]=t*a[13]+o*a[15],a[14]=r*a[14]+s*a[15]}applyInverse(e,t){t=t||new ze,this._mat4inv||(this._mat4inv=new Float64Array(16));const r=this._mat4inv,n=this.mat4,o=e.x,s=e.y;let a=e.z||0;(!this.cacheInverse||this._updateId!==this._dirtyId)&&(this._updateId=this._dirtyId,D.glMatrixMat4Invert(r,n));const c=1/(r[3]*o+r[7]*s+r[11]*a+r[15]),u=c*(r[0]*o+r[4]*s+r[8]*a+r[12]),l=c*(r[1]*o+r[5]*s+r[9]*a+r[13]),h=c*(r[2]*o+r[6]*s+r[10]*a+r[14]);a+=1;const p=1/(r[3]*o+r[7]*s+r[11]*a+r[15]),d=p*(r[0]*o+r[4]*s+r[8]*a+r[12]),f=p*(r[1]*o+r[5]*s+r[9]*a+r[13]),m=p*(r[2]*o+r[6]*s+r[10]*a+r[14]);Math.abs(h-m)<1e-10&&t.set(NaN,NaN,0);const y=(0-h)/(m-h);return t.set((d-u)*y+u,(f-l)*y+l,0),t}invert(){return D.glMatrixMat4Invert(this.mat4,this.mat4),this}invertCopyTo(e){this._mat4inv||(this._mat4inv=new Float64Array(16));const t=this._mat4inv,r=this.mat4;(!this.cacheInverse||this._updateId!==this._dirtyId)&&(this._updateId=this._dirtyId,D.glMatrixMat4Invert(t,r)),e.mat4.set(t)}identity(){const e=this.mat4;return e[0]=1,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=1,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=1,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}clone(){return new D(this.mat4)}copyTo3d(e){const t=this.mat4,r=e.mat4;return r[0]=t[0],r[1]=t[1],r[2]=t[2],r[3]=t[3],r[4]=t[4],r[5]=t[5],r[6]=t[6],r[7]=t[7],r[8]=t[8],e}copyTo2d(e){const t=this.mat4,r=e.mat3;return r[0]=t[0],r[1]=t[1],r[2]=t[3],r[3]=t[4],r[4]=t[5],r[5]=t[7],r[6]=t[12],r[7]=t[13],r[8]=t[15],e}copyTo2dOr3d(e){return e instanceof M?this.copyTo2d(e):this.copyTo3d(e)}copyTo(e,t,r){const n=this.mat4,o=1/n[15],s=n[12]*o,a=n[13]*o;if(e.a=(n[0]-n[3]*s)*o,e.b=(n[1]-n[3]*a)*o,e.c=(n[4]-n[7]*s)*o,e.d=(n[5]-n[7]*a)*o,e.tx=s,e.ty=a,t>=2){let c=e.a*e.d-e.b*e.c;r||(c=Math.abs(c)),t===L.POINT?(c>0?c=1:c=-1,e.a=c,e.b=0,e.c=0,e.d=c):t===L.AXIS_X?(c/=Math.sqrt(e.b*e.b+e.d*e.d),e.c=0,e.d=c):t===L.AXIS_Y&&(c/=Math.sqrt(e.a*e.a+e.c*e.c),e.a=c,e.c=0)}return e}copyFrom(e){const t=this.mat4;return t[0]=e.a,t[1]=e.b,t[2]=0,t[3]=0,t[4]=e.c,t[5]=e.d,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=e.tx,t[13]=e.ty,t[14]=0,t[15]=1,this._dirtyId++,this}setToMultLegacy(e,t){const r=this.mat4,n=t.mat4,o=e.a,s=e.b,a=e.c,c=e.d,u=e.tx,l=e.ty;let h=n[0],p=n[1],d=n[2],f=n[3];return r[0]=h*o+p*a+f*u,r[1]=h*s+p*c+f*l,r[2]=d,r[3]=f,h=n[4],p=n[5],d=n[6],f=n[7],r[4]=h*o+p*a+f*u,r[5]=h*s+p*c+f*l,r[6]=d,r[7]=f,h=n[8],p=n[9],d=n[10],f=n[11],r[8]=h*o+p*a+f*u,r[9]=h*s+p*c+f*l,r[10]=d,r[11]=f,h=n[12],p=n[13],d=n[14],f=n[15],r[12]=h*o+p*a+f*u,r[13]=h*s+p*c+f*l,r[14]=d,r[15]=f,this._dirtyId++,this}setToMultLegacy2(e,t){const r=this.mat4,n=e.mat4,o=n[0],s=n[1],a=n[2],c=n[3],u=n[4],l=n[5],h=n[6],p=n[7],d=t.a,f=t.b,m=t.c,y=t.d,_=t.tx,x=t.ty;return r[0]=d*o+f*u,r[1]=d*s+f*l,r[2]=d*a+f*h,r[3]=d*c+f*p,r[4]=m*o+y*u,r[5]=m*s+y*l,r[6]=m*a+y*h,r[7]=m*c+y*p,r[8]=n[8],r[9]=n[9],r[10]=n[10],r[11]=n[11],r[12]=_*o+x*u+n[12],r[13]=_*s+x*l+n[13],r[14]=_*a+x*h+n[14],r[15]=_*c+x*p+n[15],this._dirtyId++,this}setToMult(e,t){return D.glMatrixMat4Multiply(this.mat4,e.mat4,t.mat4),this._dirtyId++,this}prepend(e){e.mat4?this.setToMult(e,this):this.setToMultLegacy(e,this)}static glMatrixMat4Invert(e,t){const r=t[0],n=t[1],o=t[2],s=t[3],a=t[4],c=t[5],u=t[6],l=t[7],h=t[8],p=t[9],d=t[10],f=t[11],m=t[12],y=t[13],_=t[14],x=t[15],b=r*c-n*a,C=r*u-o*a,w=r*l-s*a,g=n*u-o*c,T=n*l-s*c,O=o*l-s*u,Q=h*y-p*m,I=h*_-d*m,ot=h*x-f*m,it=p*_-d*y,st=p*x-f*y,at=d*x-f*_;let P=b*at-C*st+w*it+g*ot-T*I+O*Q;return P?(P=1/P,e[0]=(c*at-u*st+l*it)*P,e[1]=(o*st-n*at-s*it)*P,e[2]=(y*O-_*T+x*g)*P,e[3]=(d*T-p*O-f*g)*P,e[4]=(u*ot-a*at-l*I)*P,e[5]=(r*at-o*ot+s*I)*P,e[6]=(_*w-m*O-x*C)*P,e[7]=(h*O-d*w+f*C)*P,e[8]=(a*st-c*ot+l*Q)*P,e[9]=(n*ot-r*st-s*Q)*P,e[10]=(m*T-y*w+x*b)*P,e[11]=(p*w-h*T-f*b)*P,e[12]=(c*I-a*it-u*Q)*P,e[13]=(r*it-n*I+o*Q)*P,e[14]=(y*C-m*g-_*b)*P,e[15]=(h*g-p*C+d*b)*P,e):null}static glMatrixMat4Multiply(e,t,r){const n=t[0],o=t[1],s=t[2],a=t[3],c=t[4],u=t[5],l=t[6],h=t[7],p=t[8],d=t[9],f=t[10],m=t[11],y=t[12],_=t[13],x=t[14],b=t[15];let C=r[0],w=r[1],g=r[2],T=r[3];return e[0]=C*n+w*c+g*p+T*y,e[1]=C*o+w*u+g*d+T*_,e[2]=C*s+w*l+g*f+T*x,e[3]=C*a+w*h+g*m+T*b,C=r[4],w=r[5],g=r[6],T=r[7],e[4]=C*n+w*c+g*p+T*y,e[5]=C*o+w*u+g*d+T*_,e[6]=C*s+w*l+g*f+T*x,e[7]=C*a+w*h+g*m+T*b,C=r[8],w=r[9],g=r[10],T=r[11],e[8]=C*n+w*c+g*p+T*y,e[9]=C*o+w*u+g*d+T*_,e[10]=C*s+w*l+g*f+T*x,e[11]=C*a+w*h+g*m+T*b,C=r[12],w=r[13],g=r[14],T=r[15],e[12]=C*n+w*c+g*p+T*y,e[13]=C*o+w*u+g*d+T*_,e[14]=C*s+w*l+g*f+T*x,e[15]=C*a+w*h+g*m+T*b,e}}D.__initStatic();D.__initStatic2();const Me=new D;class V extends W{constructor(e,t){super(e,t);V.prototype.__init.call(this),V.prototype.__init2.call(this),V.prototype.__init3.call(this),V.prototype.__init4.call(this),V.prototype.__init5.call(this),V.prototype.__init6.call(this),this.local=new D,this.world=new D,this.local.cacheInverse=!0,this.world.cacheInverse=!0,this.position._z=0,this.scale._z=1,this.pivot._z=0}__init(){this.cameraMatrix=null}__init2(){this._cameraMode=!1}get cameraMode(){return this._cameraMode}set cameraMode(e){this._cameraMode!==e&&(this._cameraMode=e,this.euler._sign=this._cameraMode?-1:1,this.euler._quatDirtyId++,e&&(this.cameraMatrix=new D))}__init3(){this.position=new pt(this.onChange,this,0,0)}__init4(){this.scale=new pt(this.onChange,this,1,1)}__init5(){this.euler=new mt(this.onChange,this,0,0,0)}__init6(){this.pivot=new pt(this.onChange,this,0,0)}onChange(){this._projID++}clear(){this.cameraMatrix&&this.cameraMatrix.identity(),this.position.set(0,0,0),this.scale.set(1,1,1),this.euler.set(0,0,0),this.pivot.set(0,0,0),super.clear()}updateLocalTransform(e){if(this._projID===0){this.local.copyFrom(e);return}const t=this.local,r=this.euler,n=this.position,o=this.scale,s=this.pivot;if(r.update(),!this.cameraMode){t.setToRotationTranslationScale(r.quaternion,n._x,n._y,n._z,o._x,o._y,o._z),t.translate(-s._x,-s._y,-s._z),t.setToMultLegacy(e,t);return}t.setToMultLegacy(e,this.cameraMatrix),t.translate(s._x,s._y,s._z),t.scale(1/o._x,1/o._y,1/o._z),Me.setToRotationTranslationScale(r.quaternion,0,0,0,1,1,1),t.setToMult(t,Me),t.translate(-n._x,-n._y,-n._z),this.local._dirtyId++}}function Xr(){return this.proj.affine?this.transform.worldTransform:this.proj.world}class rt extends F{constructor(){super();this.proj=new V(this.transform)}isFrontFace(e=!1){e&&(this._recursivePostUpdateTransform(),this.displayObjectUpdateTransform());const t=this.proj.world.mat4,r=t[0]*t[15]-t[3]*t[12],n=t[1]*t[15]-t[3]*t[13],o=t[4]*t[15]-t[7]*t[12],s=t[5]*t[15]-t[7]*t[13];return r*s-o*n>0}getDepth(e=!1){e&&(this._recursivePostUpdateTransform(),this.displayObjectUpdateTransform());const t=this.proj.world.mat4;return t[14]/t[15]}toLocal(e,t,r,n,o=z.ALL){return t&&(e=t.toGlobal(e,r,n)),n||this._recursivePostUpdateTransform(),o===z.ALL?(n||this.displayObjectUpdateTransform(),this.proj.affine?this.transform.worldTransform.applyInverse(e,r):this.proj.world.applyInverse(e,r)):(this.parent?r=this.parent.worldTransform.applyInverse(e,r):(r.x=e.x,r.y=e.y,r.z=e.z),o===z.NONE||(r=this.transform.localTransform.applyInverse(r,r),o===z.PROJ&&this.proj.cameraMode&&(r=this.proj.cameraMatrix.applyInverse(r,r))),r)}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}get position3d(){return this.proj.position}set position3d(e){this.proj.position.copyFrom(e)}get scale3d(){return this.proj.scale}set scale3d(e){this.proj.scale.copyFrom(e)}get euler(){return this.proj.euler}set euler(e){this.proj.euler.copyFrom(e)}get pivot3d(){return this.proj.pivot}set pivot3d(e){this.proj.pivot.copyFrom(e)}}const xe=rt.prototype.toLocal,_e=rt.prototype.getDepth,ge=rt.prototype.isFrontFace;class vt extends Xe{constructor(e,t,r,n){super(e,t,r,n);vt.prototype.__init.call(this),this.proj=new V(this.transform)}__init(){this.vertexData2d=null}calculateVertices(){if(this.proj._affine){this.vertexData2d=null,super.calculateVertices();return}const e=this.geometry,t=e.buffers[0].data,r=this;if(e.vertexDirtyId===r.vertexDirty&&r._transformID===r.transform._worldID)return;r._transformID=r.transform._worldID,r.vertexData.length!==t.length&&(r.vertexData=new Float32Array(t.length)),(!this.vertexData2d||this.vertexData2d.length!==t.length*3/2)&&(this.vertexData2d=new Float32Array(t.length*3));const n=this.proj.world.mat4,o=this.vertexData2d,s=r.vertexData;for(let a=0;a<s.length/2;a++){const c=t[a*2],u=t[a*2+1],l=n[0]*c+n[4]*u+n[12],h=n[1]*c+n[5]*u+n[13],p=n[3]*c+n[7]*u+n[15];o[a*3]=l,o[a*3+1]=h,o[a*3+2]=p,s[a*2]=l/p,s[a*2+1]=h/p}r.vertexDirty=e.vertexDirtyId}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}toLocal(e,t,r,n,o=z.ALL){return xe.call(this,e,t,r,n,o)}isFrontFace(e){return ge.call(this,e)}getDepth(e){return _e.call(this,e)}get position3d(){return this.proj.position}set position3d(e){this.proj.position.copyFrom(e)}get scale3d(){return this.proj.scale}set scale3d(e){this.proj.scale.copyFrom(e)}get euler(){return this.proj.euler}set euler(e){this.proj.euler.copyFrom(e)}get pivot3d(){return this.proj.pivot}set pivot3d(e){this.proj.pivot.copyFrom(e)}}vt.prototype._renderDefault=B.prototype._renderDefault;class R extends N{constructor(e){super(e);R.prototype.__init.call(this),R.prototype.__init2.call(this),R.prototype.__init3.call(this),this.proj=new V(this.transform),this.pluginName="batch2d"}__init(){this.vertexData2d=null}__init2(){this.culledByFrustrum=!1}__init3(){this.trimmedCulledByFrustrum=!1}calculateVertices(){const e=this._texture;if(this.proj._affine){this.vertexData2d=null,super.calculateVertices();return}this.vertexData2d||(this.vertexData2d=new Float32Array(12));const t=this.transform._worldID,r=e._updateID,n=this;if(n._transformID===t&&this._textureID===r)return;this._textureID!==r&&(this.uvs=e._uvs.uvsFloat32),n._transformID=t,this._textureID=r;const o=this.proj.world.mat4,s=this.vertexData2d,a=this.vertexData,c=e.trim,u=e.orig,l=this._anchor;let h,p,d,f;c?(p=c.x-l._x*u.width,h=p+c.width,f=c.y-l._y*u.height,d=f+c.height):(p=-l._x*u.width,h=p+u.width,f=-l._y*u.height,d=f+u.height);let m=!1,y;s[0]=o[0]*p+o[4]*f+o[12],s[1]=o[1]*p+o[5]*f+o[13],y=o[2]*p+o[6]*f+o[14],s[2]=o[3]*p+o[7]*f+o[15],m=m||y<0,s[3]=o[0]*h+o[4]*f+o[12],s[4]=o[1]*h+o[5]*f+o[13],y=o[2]*h+o[6]*f+o[14],s[5]=o[3]*h+o[7]*f+o[15],m=m||y<0,s[6]=o[0]*h+o[4]*d+o[12],s[7]=o[1]*h+o[5]*d+o[13],y=o[2]*h+o[6]*d+o[14],s[8]=o[3]*h+o[7]*d+o[15],m=m||y<0,s[9]=o[0]*p+o[4]*d+o[12],s[10]=o[1]*p+o[5]*d+o[13],y=o[2]*p+o[6]*d+o[14],s[11]=o[3]*p+o[7]*d+o[15],m=m||y<0,this.culledByFrustrum=m,a[0]=s[0]/s[2],a[1]=s[1]/s[2],a[2]=s[3]/s[5],a[3]=s[4]/s[5],a[4]=s[6]/s[8],a[5]=s[7]/s[8],a[6]=s[9]/s[11],a[7]=s[10]/s[11]}calculateTrimmedVertices(){if(this.proj._affine){super.calculateTrimmedVertices();return}const e=this.transform._worldID,t=this._texture._updateID,r=this;if(!r.vertexTrimmedData)r.vertexTrimmedData=new Float32Array(8);else if(r._transformTrimmedID===e&&this._textureTrimmedID===t)return;r._transformTrimmedID=e,this._textureTrimmedID=t;const n=this._texture,o=r.vertexTrimmedData,s=n.orig,a=this._anchor,c=this.proj.world.mat4,u=-a._x*s.width,l=u+s.width,h=-a._y*s.height,p=h+s.height;let d=!1,f,m=1/(c[3]*u+c[7]*h+c[15]);o[0]=m*(c[0]*u+c[4]*h+c[12]),o[1]=m*(c[1]*u+c[5]*h+c[13]),f=c[2]*u+c[6]*h+c[14],d=d||f<0,m=1/(c[3]*l+c[7]*h+c[15]),o[2]=m*(c[0]*l+c[4]*h+c[12]),o[3]=m*(c[1]*l+c[5]*h+c[13]),f=c[2]*l+c[6]*h+c[14],d=d||f<0,m=1/(c[3]*l+c[7]*p+c[15]),o[4]=m*(c[0]*l+c[4]*p+c[12]),o[5]=m*(c[1]*l+c[5]*p+c[13]),f=c[2]*l+c[6]*p+c[14],d=d||f<0,m=1/(c[3]*u+c[7]*p+c[15]),o[6]=m*(c[0]*u+c[4]*p+c[12]),o[7]=m*(c[1]*u+c[5]*p+c[13]),f=c[2]*u+c[6]*p+c[14],d=d||f<0,this.culledByFrustrum=d}_calculateBounds(){if(this.calculateVertices(),this.culledByFrustrum)return;const e=this._texture.trim,t=this._texture.orig;if(!e||e.width===t.width&&e.height===t.height){this._bounds.addQuad(this.vertexData);return}this.calculateTrimmedVertices(),this.trimmedCulledByFrustrum||this._bounds.addQuad(this.vertexTrimmedData)}_render(e){this.calculateVertices(),!this.culledByFrustrum&&(e.batch.setObjectRenderer(e.plugins[this.pluginName]),e.plugins[this.pluginName].render(this))}containsPoint(e){return this.culledByFrustrum?!1:super.containsPoint(e)}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}toLocal(e,t,r,n,o=z.ALL){return xe.call(this,e,t,r,n,o)}isFrontFace(e){return ge.call(this,e)}getDepth(e){return _e.call(this,e)}get position3d(){return this.proj.position}set position3d(e){this.proj.position.copyFrom(e)}get scale3d(){return this.proj.scale}set scale3d(e){this.proj.scale.copyFrom(e)}get euler(){return this.proj.euler}set euler(e){this.proj.euler.copyFrom(e)}get pivot3d(){return this.proj.pivot}set pivot3d(e){this.proj.pivot.copyFrom(e)}}const Gr={worldTransform:{get:Xr,enumerable:!0,configurable:!0},position3d:{get(){return this.proj.position},set(i){this.proj.position.copy(i)}},scale3d:{get(){return this.proj.scale},set(i){this.proj.scale.copy(i)}},pivot3d:{get(){return this.proj.pivot},set(i){this.proj.pivot.copy(i)}},euler:{get(){return this.proj.euler},set(i){this.proj.euler.copy(i)}}};function be(){this.proj||(this.proj=new V(this.transform),this.toLocal=rt.prototype.toLocal,this.isFrontFace=rt.prototype.isFrontFace,this.getDepth=rt.prototype.getDepth,Object.defineProperties(this,Gr))}F.prototype.convertTo3d=be;N.prototype.convertTo3d=function(){this.proj||(this.calculateVertices=R.prototype.calculateVertices,this.calculateTrimmedVertices=R.prototype.calculateTrimmedVertices,this._calculateBounds=R.prototype._calculateBounds,this.containsPoint=R.prototype.containsPoint,this.pluginName="batch2d",be.call(this))};F.prototype.convertSubtreeTo3d=function(){this.convertTo3d();for(let e=0;e<this.children.length;e++)this.children[e].convertSubtreeTo3d()};Ve.prototype.convertTo3d=ke.prototype.convertTo3d=function(){this.proj||(this.calculateVertices=vt.prototype.calculateVertices,this._renderDefault=vt.prototype._renderDefault,this.material.pluginName!=="batch2d"&&(this.material=new Ee(this.material.texture,{program:Be.from(B.defaultVertexShader,B.defaultFragmentShader),pluginName:"batch2d"})),be.call(this))};class J extends me{constructor(e,t,r){super(e,t,r);J.prototype.__init.call(this),this.proj=new V(this.transform),this.pluginName="batch2d"}__init(){this.vertexData2d=null}get worldTransform(){return this.proj.affine?this.transform.worldTransform:this.proj.world}toLocal(e,t,r,n,o=z.ALL){return xe.call(this,e,t,r,n,o)}isFrontFace(e){return ge.call(this,e)}getDepth(e){return _e.call(this,e)}get position3d(){return this.proj.position}set position3d(e){this.proj.position.copyFrom(e)}get scale3d(){return this.proj.scale}set scale3d(e){this.proj.scale.copyFrom(e)}get euler(){return this.proj.euler}set euler(e){this.proj.euler.copyFrom(e)}get pivot3d(){return this.proj.pivot}set pivot3d(e){this.proj.pivot.copyFrom(e)}}J.prototype.calculateVertices=R.prototype.calculateVertices;J.prototype.calculateTrimmedVertices=R.prototype.calculateTrimmedVertices;J.prototype._calculateBounds=R.prototype._calculateBounds;J.prototype.containsPoint=R.prototype.containsPoint;J.prototype._render=R.prototype._render;var lt;const Ur=`precision highp float;
attribute vec2 aVertexPosition;
attribute vec3 aTrans1;
attribute vec3 aTrans2;
attribute vec2 aSamplerSize;
attribute vec4 aFrame;
attribute vec4 aColor;
attribute float aTextureId;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;

varying vec2 vertexPosition;
varying vec3 vTrans1;
varying vec3 vTrans2;
varying vec2 vSamplerSize;
varying vec4 vFrame;
varying vec4 vColor;
varying float vTextureId;

void main(void){
gl_Position.xyw = projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0);
gl_Position.z = 0.0;

vertexPosition = aVertexPosition;
vTrans1 = aTrans1;
vTrans2 = aTrans2;
vTextureId = aTextureId;
vColor = aColor;
vSamplerSize = aSamplerSize;
vFrame = aFrame;
}
`,Wr=`precision highp float;
varying vec2 vertexPosition;
varying vec3 vTrans1;
varying vec3 vTrans2;
varying vec2 vSamplerSize;
varying vec4 vFrame;
varying vec4 vColor;
varying float vTextureId;

uniform sampler2D uSamplers[%count%];
uniform vec4 distortion;

void main(void){
vec2 surface;
vec2 surface2;

float vx = vertexPosition.x;
float vy = vertexPosition.y;
float dx = distortion.x;
float dy = distortion.y;
float revx = distortion.z;
float revy = distortion.w;

if (distortion.x == 0.0) {
surface.x = vx;
surface.y = vy / (1.0 + dy * vx);
surface2 = surface;
} else
if (distortion.y == 0.0) {
surface.y = vy;
surface.x = vx / (1.0 + dx * vy);
surface2 = surface;
} else {
float c = vy * dx - vx * dy;
float b = (c + 1.0) * 0.5;
float b2 = (-c + 1.0) * 0.5;
float d = b * b + vx * dy;
if (d < -0.00001) {
    discard;
}
d = sqrt(max(d, 0.0));
surface.x = (- b + d) * revy;
surface2.x = (- b - d) * revy;
surface.y = (- b2 + d) * revx;
surface2.y = (- b2 - d) * revx;
}

vec2 uv;
uv.x = vTrans1.x * surface.x + vTrans1.y * surface.y + vTrans1.z;
uv.y = vTrans2.x * surface.x + vTrans2.y * surface.y + vTrans2.z;

vec2 pixels = uv * vSamplerSize;

if (pixels.x < vFrame.x || pixels.x > vFrame.z ||
pixels.y < vFrame.y || pixels.y > vFrame.w) {
uv.x = vTrans1.x * surface2.x + vTrans1.y * surface2.y + vTrans1.z;
uv.y = vTrans2.x * surface2.x + vTrans2.y * surface2.y + vTrans2.z;
pixels = uv * vSamplerSize;

if (pixels.x < vFrame.x || pixels.x > vFrame.z ||
   pixels.y < vFrame.y || pixels.y > vFrame.w) {
   discard;
}
}

vec4 edge;
edge.xy = clamp(pixels - vFrame.xy + 0.5, vec2(0.0, 0.0), vec2(1.0, 1.0));
edge.zw = clamp(vFrame.zw - pixels + 0.5, vec2(0.0, 0.0), vec2(1.0, 1.0));

float alpha = 1.0; //edge.x * edge.y * edge.z * edge.w;
vec4 rColor = vColor * alpha;

float textureId = floor(vTextureId+0.5);
vec2 vTextureCoord = uv;
vec4 color;
%forloop%
gl_FragColor = color * rColor;
}`;class Kr extends Ue{constructor(e=!1){super();this._buffer=new Ct(null,e,!1),this._indexBuffer=new Ct(null,e,!0),this.addAttribute("aVertexPosition",this._buffer,2,!1,E.FLOAT).addAttribute("aTrans1",this._buffer,3,!1,E.FLOAT).addAttribute("aTrans2",this._buffer,3,!1,E.FLOAT).addAttribute("aSamplerSize",this._buffer,2,!1,E.FLOAT).addAttribute("aFrame",this._buffer,4,!1,E.FLOAT).addAttribute("aColor",this._buffer,4,!0,E.UNSIGNED_BYTE).addAttribute("aTextureId",this._buffer,1,!0,E.FLOAT).addIndex(this._indexBuffer)}}class Yr{static create(e){const{vertex:t,fragment:r,vertexSize:n,geometryClass:o}=Object.assign({vertex:Ur,fragment:Wr,geometryClass:Kr,vertexSize:16},e);return lt=class extends Tt{constructor(a){super(a);lt.prototype.__init.call(this),lt.prototype.__init2.call(this),lt.prototype.__init3.call(this),this.shaderGenerator=new Re(t,r),this.geometryClass=o,this.vertexSize=n}__init(){this.defUniforms={translationMatrix:new xt,distortion:new Float32Array([0,0,1/0,1/0])}}__init2(){this.size=1e3}__init3(){this.forceMaxTextures=1}getUniforms(a){const{proj:c}=a;return c.surface!==null?c.uniforms:c._activeProjection!==null?c._activeProjection.uniforms:this.defUniforms}packInterleavedGeometry(a,c,u,l,h){const{uint32View:p,float32View:d}=c,f=l/this.vertexSize,m=a.indices,y=a.vertexData,x=a._texture._frame,b=a.aTrans,{_batchLocation:C,realWidth:w,realHeight:g,resolution:T}=a._texture.baseTexture,O=Math.min(a.worldAlpha,1),Q=O<1&&a._texture.baseTexture.alphaMode?$e(a._tintRGB,O):a._tintRGB+(O*255<<24);for(let I=0;I<y.length;I+=2)d[l]=y[I],d[l+1]=y[I+1],d[l+2]=b.a,d[l+3]=b.c,d[l+4]=b.tx,d[l+5]=b.b,d[l+6]=b.d,d[l+7]=b.ty,d[l+8]=w,d[l+9]=g,d[l+10]=x.x*T,d[l+11]=x.y*T,d[l+12]=(x.x+x.width)*T,d[l+13]=(x.y+x.height)*T,p[l+14]=Q,d[l+15]=C,l+=16;for(let I=0;I<m.length;I++)u[h++]=f+m[I]}},lt}}const v=[new S,new S,new S,new S],Z=[0,0,0,0];class et{constructor(){et.prototype.__init.call(this),et.prototype.__init2.call(this),et.prototype.__init3.call(this),et.prototype.__init4.call(this)}__init(){this.surfaceID="default"}__init2(){this._updateID=0}__init3(){this.vertexSrc=""}__init4(){this.fragmentSrc=""}fillUniforms(e){}clear(){}boundsQuad(e,t,r){let n=t[0],o=t[1],s=t[0],a=t[1];for(let c=2;c<8;c+=2)n>t[c]&&(n=t[c]),s<t[c]&&(s=t[c]),o>t[c+1]&&(o=t[c+1]),a<t[c+1]&&(a=t[c+1]);if(v[0].set(n,o),this.apply(v[0],v[0]),v[1].set(s,o),this.apply(v[1],v[1]),v[2].set(s,a),this.apply(v[2],v[2]),v[3].set(n,a),this.apply(v[3],v[3]),r)r.apply(v[0],v[0]),r.apply(v[1],v[1]),r.apply(v[2],v[2]),r.apply(v[3],v[3]),t[0]=v[0].x,t[1]=v[0].y,t[2]=v[1].x,t[3]=v[1].y,t[4]=v[2].x,t[5]=v[2].y,t[6]=v[3].x,t[7]=v[3].y;else{for(let c=1;c<=3;c++)if(v[c].y<v[0].y||v[c].y===v[0].y&&v[c].x<v[0].x){const u=v[0];v[0]=v[c],v[c]=u}for(let c=1;c<=3;c++)Z[c]=Math.atan2(v[c].y-v[0].y,v[c].x-v[0].x);for(let c=1;c<=3;c++)for(let u=c+1;u<=3;u++)if(Z[c]>Z[u]){const l=v[c];v[c]=v[u],v[u]=l;const h=Z[c];Z[c]=Z[u],Z[u]=h}if(t[0]=v[0].x,t[1]=v[0].y,t[2]=v[1].x,t[3]=v[1].y,t[4]=v[2].x,t[5]=v[2].y,t[6]=v[3].x,t[7]=v[3].y,(v[3].x-v[2].x)*(v[1].y-v[2].y)-(v[1].x-v[2].x)*(v[3].y-v[2].y)<0){t[4]=v[3].x,t[5]=v[3].y;return}}}}const Qr=new xt,ut=new qe,ft=new S;class St extends et{constructor(...e){super(...e);St.prototype.__init.call(this)}__init(){this.distortion=new S}clear(){this.distortion.set(0,0)}apply(e,t){t=t||new S;const r=this.distortion,n=e.x*e.y;return t.x=e.x+r.x*n,t.y=e.y+r.y*n,t}applyInverse(e,t){t=t||new S;const r=e.x,n=e.y,o=this.distortion.x,s=this.distortion.y;if(o===0)t.x=r,t.y=n/(1+s*r);else if(s===0)t.y=n,t.x=r/(1+o*n);else{const a=(n*o-r*s+1)*.5/s,c=a*a+r/s;if(c<=1e-5)return t.set(NaN,NaN),t;s>0?t.x=-a+Math.sqrt(c):t.x=-a-Math.sqrt(c),t.y=(r/t.x-1)/o}return t}mapSprite(e,t,r){const n=e.texture;return ut.x=-e.anchor.x*n.orig.width,ut.y=-e.anchor.y*n.orig.height,ut.width=n.orig.width,ut.height=n.orig.height,this.mapQuad(ut,t,r||e.transform)}mapQuad(e,t,r){const n=-e.x/e.width,o=-e.y/e.height,s=(1-e.x)/e.width,a=(1-e.y)/e.height,c=t[0].x*(1-n)+t[1].x*n,u=t[0].y*(1-n)+t[1].y*n,l=t[0].x*(1-s)+t[1].x*s,h=t[0].y*(1-s)+t[1].y*s,p=t[3].x*(1-n)+t[2].x*n,d=t[3].y*(1-n)+t[2].y*n,f=t[3].x*(1-s)+t[2].x*s,m=t[3].y*(1-s)+t[2].y*s,y=c*(1-o)+p*o,_=u*(1-o)+d*o,x=l*(1-o)+f*o,b=h*(1-o)+m*o,C=c*(1-a)+p*a,w=u*(1-a)+d*a,g=l*(1-a)+f*a,T=h*(1-a)+m*a,O=Qr;return O.tx=y,O.ty=_,O.a=x-y,O.b=b-_,O.c=C-y,O.d=w-_,ft.set(g,T),O.applyInverse(ft,ft),this.distortion.set(ft.x-1,ft.y-1),r.setFromMatrix(O),this}fillUniforms(e){e.distortion=e.distortion||new Float32Array([0,0,0,0]);const t=Math.abs(this.distortion.x),r=Math.abs(this.distortion.y);e.distortion[0]=t*1e4<=r?0:this.distortion.x,e.distortion[1]=r*1e4<=t?0:this.distortion.y,e.distortion[2]=1/e.distortion[0],e.distortion[3]=1/e.distortion[1]}}const Ie=Pt.prototype.updateTransform;function Hr(i){const e=this.proj,t=i.proj,r=this;if(!t){Ie.call(this,i),e._activeProjection=null;return}if(t._surface){e._activeProjection=t,this.updateLocalTransform(),this.localTransform.copyTo(this.worldTransform),r._parentID<0&&++r._worldID;return}Ie.call(this,i),e._activeProjection=t._activeProjection}class U extends Dt{constructor(...e){super(...e);U.prototype.__init.call(this),U.prototype.__init2.call(this),U.prototype.__init3.call(this),U.prototype.__init4.call(this),U.prototype.__init5.call(this)}__init(){this._surface=null}__init2(){this._activeProjection=null}set enabled(e){e!==this._enabled&&(this._enabled=e,e?(this.legacy.updateTransform=Hr,this.legacy._parentID=-1):(this.legacy.updateTransform=Pt.prototype.updateTransform,this.legacy._parentID=-1))}get surface(){return this._surface}set surface(e){this._surface!==e&&(this._surface=e||null,this.legacy._parentID=-1)}applyPartial(e,t){return this._activeProjection!==null?(t=this.legacy.worldTransform.apply(e,t),this._activeProjection.surface.apply(t,t)):this._surface!==null?this.surface.apply(e,t):this.legacy.worldTransform.apply(e,t)}apply(e,t){return this._activeProjection!==null?(t=this.legacy.worldTransform.apply(e,t),this._activeProjection.surface.apply(t,t),this._activeProjection.legacy.worldTransform.apply(t,t)):this._surface!==null?(t=this.surface.apply(e,t),this.legacy.worldTransform.apply(t,t)):this.legacy.worldTransform.apply(e,t)}applyInverse(e,t){return this._activeProjection!==null?(t=this._activeProjection.legacy.worldTransform.applyInverse(e,t),this._activeProjection._surface.applyInverse(t,t),this.legacy.worldTransform.applyInverse(t,t)):this._surface!==null?(t=this.legacy.worldTransform.applyInverse(e,t),this._surface.applyInverse(t,t)):this.legacy.worldTransform.applyInverse(e,t)}mapBilinearSprite(e,t){this._surface instanceof St||(this.surface=new St),this.surface.mapSprite(e,t,this.legacy)}__init3(){this._currentSurfaceID=-1}__init4(){this._currentLegacyID=-1}__init5(){this._lastUniforms=null}clear(){this.surface&&this.surface.clear()}get uniforms(){return this._currentLegacyID===this.legacy._worldID&&this._currentSurfaceID===this.surface._updateID?this._lastUniforms:(this._lastUniforms=this._lastUniforms||{},this._lastUniforms.translationMatrix=this.legacy.worldTransform,this._surface.fillUniforms(this._lastUniforms),this._lastUniforms)}}class K extends N{constructor(e){super(e);K.prototype.__init.call(this),this.proj=new U(this.transform),this.pluginName="batch_bilinear"}__init(){this.aTrans=new xt}_calculateBounds(){this.calculateTrimmedVertices(),this._bounds.addQuad(this.vertexTrimmedData)}calculateVertices(){const e=this.transform._worldID,t=this._texture._updateID,r=this;if(r._transformID===e&&this._textureID===t)return;r._transformID=e,this._textureID=t;const n=this._texture,o=this.vertexData,s=n.trim,a=n.orig,c=this._anchor;let u,l,h,p;if(s?(l=s.x-c._x*a.width,u=l+s.width,p=s.y-c._y*a.height,h=p+s.height):(l=-c._x*a.width,u=l+a.width,p=-c._y*a.height,h=p+a.height),this.proj._surface)o[0]=l,o[1]=p,o[2]=u,o[3]=p,o[4]=u,o[5]=h,o[6]=l,o[7]=h,this.proj._surface.boundsQuad(o,o);else{const f=this.transform.worldTransform,m=f.a,y=f.b,_=f.c,x=f.d,b=f.tx,C=f.ty;o[0]=m*l+_*p+b,o[1]=x*p+y*l+C,o[2]=m*u+_*p+b,o[3]=x*p+y*u+C,o[4]=m*u+_*h+b,o[5]=x*h+y*u+C,o[6]=m*l+_*h+b,o[7]=x*h+y*l+C,this.proj._activeProjection&&this.proj._activeProjection.surface.boundsQuad(o,o)}n.uvMatrix||(n.uvMatrix=new Ge(n)),n.uvMatrix.update();const d=this.aTrans;d.set(a.width,0,0,a.height,l,p),this.proj._surface===null&&d.prepend(this.transform.worldTransform),d.invert(),d.prepend(n.uvMatrix.mapCoord)}calculateTrimmedVertices(){const e=this.transform._worldID,t=this._texture._updateID,r=this;if(!r.vertexTrimmedData)r.vertexTrimmedData=new Float32Array(8);else if(r._transformTrimmedID===e&&this._textureTrimmedID===t)return;r._transformTrimmedID=e,this._textureTrimmedID=t;const n=this._texture,o=r.vertexTrimmedData,s=n.orig,a=this._anchor,c=-a._x*s.width,u=c+s.width,l=-a._y*s.height,h=l+s.height;if(this.proj._surface)o[0]=c,o[1]=l,o[2]=u,o[3]=l,o[4]=u,o[5]=h,o[6]=c,o[7]=h,this.proj._surface.boundsQuad(o,o,this.transform.worldTransform);else{const p=this.transform.worldTransform,d=p.a,f=p.b,m=p.c,y=p.d,_=p.tx,x=p.ty;o[0]=d*c+m*l+_,o[1]=y*l+f*c+x,o[2]=d*u+m*l+_,o[3]=y*l+f*u+x,o[4]=d*u+m*h+_,o[5]=y*h+f*u+x,o[6]=d*c+m*h+_,o[7]=y*h+f*c+x,this.proj._activeProjection&&this.proj._activeProjection.surface.boundsQuad(o,o,this.proj._activeProjection.legacy.worldTransform)}}get worldTransform(){return this.proj}}N.prototype.convertTo2s=function(){this.proj||(this.pluginName="sprite_bilinear",this.aTrans=new xt,this.calculateVertices=K.prototype.calculateVertices,this.calculateTrimmedVertices=K.prototype.calculateTrimmedVertices,this._calculateBounds=K.prototype._calculateBounds,F.prototype.convertTo2s.call(this))};F.prototype.convertTo2s=function(){this.proj||(this.proj=new U(this.transform),Object.defineProperty(this,"worldTransform",{get(){return this.proj},enumerable:!0,configurable:!0}))};F.prototype.convertSubtreeTo2s=function(){this.convertTo2s();for(let e=0;e<this.children.length;e++)this.children[e].convertSubtreeTo2s()};class gt extends me{constructor(e,t,r){super(e,t,r);gt.prototype.__init.call(this),this.proj=new U(this.transform),this.pluginName="batch_bilinear"}__init(){this.aTrans=new xt}get worldTransform(){return this.proj}}gt.prototype.calculateVertices=K.prototype.calculateVertices;gt.prototype.calculateTrimmedVertices=K.prototype.calculateTrimmedVertices;gt.prototype._calculateBounds=K.prototype._calculateBounds;de.registerPlugin("batch_bilinear",Yr.create({}));/*!
 * @pixi/filter-adjustment - v4.1.3
 * Compiled Thu, 17 Jun 2021 19:33:56 UTC
 *
 * @pixi/filter-adjustment is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var It=function(i,e){return It=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},It(i,e)};function Zr(i,e){It(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Jr=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,tn=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform float gamma;
uniform float contrast;
uniform float saturation;
uniform float brightness;
uniform float red;
uniform float green;
uniform float blue;
uniform float alpha;

void main(void)
{
    vec4 c = texture2D(uSampler, vTextureCoord);

    if (c.a > 0.0) {
        c.rgb /= c.a;

        vec3 rgb = pow(c.rgb, vec3(1. / gamma));
        rgb = mix(vec3(.5), mix(vec3(dot(vec3(.2125, .7154, .0721), rgb)), rgb, saturation), contrast);
        rgb.r *= red;
        rgb.g *= green;
        rgb.b *= blue;
        c.rgb = rgb * brightness;

        c.rgb *= c.a;
    }

    gl_FragColor = c * alpha;
}
`;(function(i){Zr(e,i);function e(t){var r=i.call(this,Jr,tn)||this;return r.gamma=1,r.saturation=1,r.contrast=1,r.brightness=1,r.red=1,r.green=1,r.blue=1,r.alpha=1,Object.assign(r,t),r}return e.prototype.apply=function(t,r,n,o){this.uniforms.gamma=Math.max(this.gamma,1e-4),this.uniforms.saturation=this.saturation,this.uniforms.contrast=this.contrast,this.uniforms.brightness=this.brightness,this.uniforms.red=this.red,this.uniforms.green=this.green,this.uniforms.blue=this.blue,this.uniforms.alpha=this.alpha,t.applyFilter(this,r,n,o)},e})(j);/*!
 * @pixi/filter-kawase-blur - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-kawase-blur is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Lt=function(i,e){return Lt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Lt(i,e)};function en(i,e){Lt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var rn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,nn=`
varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform vec2 uOffset;

void main(void)
{
    vec4 color = vec4(0.0);

    // Sample top left pixel
    color += texture2D(uSampler, vec2(vTextureCoord.x - uOffset.x, vTextureCoord.y + uOffset.y));

    // Sample top right pixel
    color += texture2D(uSampler, vec2(vTextureCoord.x + uOffset.x, vTextureCoord.y + uOffset.y));

    // Sample bottom right pixel
    color += texture2D(uSampler, vec2(vTextureCoord.x + uOffset.x, vTextureCoord.y - uOffset.y));

    // Sample bottom left pixel
    color += texture2D(uSampler, vec2(vTextureCoord.x - uOffset.x, vTextureCoord.y - uOffset.y));

    // Average
    color *= 0.25;

    gl_FragColor = color;
}`,on=`
varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform vec2 uOffset;
uniform vec4 filterClamp;

void main(void)
{
    vec4 color = vec4(0.0);

    // Sample top left pixel
    color += texture2D(uSampler, clamp(vec2(vTextureCoord.x - uOffset.x, vTextureCoord.y + uOffset.y), filterClamp.xy, filterClamp.zw));

    // Sample top right pixel
    color += texture2D(uSampler, clamp(vec2(vTextureCoord.x + uOffset.x, vTextureCoord.y + uOffset.y), filterClamp.xy, filterClamp.zw));

    // Sample bottom right pixel
    color += texture2D(uSampler, clamp(vec2(vTextureCoord.x + uOffset.x, vTextureCoord.y - uOffset.y), filterClamp.xy, filterClamp.zw));

    // Sample bottom left pixel
    color += texture2D(uSampler, clamp(vec2(vTextureCoord.x - uOffset.x, vTextureCoord.y - uOffset.y), filterClamp.xy, filterClamp.zw));

    // Average
    color *= 0.25;

    gl_FragColor = color;
}
`,jt=function(i){en(e,i);function e(t,r,n){t===void 0&&(t=4),r===void 0&&(r=3),n===void 0&&(n=!1);var o=i.call(this,rn,n?on:nn)||this;return o._kernels=[],o._blur=4,o._quality=3,o.uniforms.uOffset=new Float32Array(2),o._pixelSize=new S,o.pixelSize=1,o._clamp=n,Array.isArray(t)?o.kernels=t:(o._blur=t,o.quality=r),o}return e.prototype.apply=function(t,r,n,o){var s=this._pixelSize.x/r._frame.width,a=this._pixelSize.y/r._frame.height,c;if(this._quality===1||this._blur===0)c=this._kernels[0]+.5,this.uniforms.uOffset[0]=c*s,this.uniforms.uOffset[1]=c*a,t.applyFilter(this,r,n,o);else{for(var u=t.getFilterTexture(),l=r,h=u,p=void 0,d=this._quality-1,f=0;f<d;f++)c=this._kernels[f]+.5,this.uniforms.uOffset[0]=c*s,this.uniforms.uOffset[1]=c*a,t.applyFilter(this,l,h,1),p=l,l=h,h=p;c=this._kernels[d]+.5,this.uniforms.uOffset[0]=c*s,this.uniforms.uOffset[1]=c*a,t.applyFilter(this,l,n,o),t.returnFilterTexture(u)}},e.prototype._updatePadding=function(){this.padding=Math.ceil(this._kernels.reduce(function(t,r){return t+r+.5},0))},e.prototype._generateKernels=function(){var t=this._blur,r=this._quality,n=[t];if(t>0)for(var o=t,s=t/r,a=1;a<r;a++)o-=s,n.push(o);this._kernels=n,this._updatePadding()},Object.defineProperty(e.prototype,"kernels",{get:function(){return this._kernels},set:function(t){Array.isArray(t)&&t.length>0?(this._kernels=t,this._quality=t.length,this._blur=Math.max.apply(Math,t)):(this._kernels=[0],this._quality=1)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"clamp",{get:function(){return this._clamp},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"pixelSize",{get:function(){return this._pixelSize},set:function(t){typeof t=="number"?(this._pixelSize.x=t,this._pixelSize.y=t):Array.isArray(t)?(this._pixelSize.x=t[0],this._pixelSize.y=t[1]):t instanceof S?(this._pixelSize.x=t.x,this._pixelSize.y=t.y):(this._pixelSize.x=1,this._pixelSize.y=1)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"quality",{get:function(){return this._quality},set:function(t){this._quality=Math.max(1,Math.round(t)),this._generateKernels()},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blur",{get:function(){return this._blur},set:function(t){this._blur=t,this._generateKernels()},enumerable:!1,configurable:!0}),e}(j);/*!
 * @pixi/filter-advanced-bloom - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-advanced-bloom is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Rt=function(i,e){return Rt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Rt(i,e)};function Ye(i,e){Rt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Qe=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,sn=`
uniform sampler2D uSampler;
varying vec2 vTextureCoord;

uniform float threshold;

void main() {
    vec4 color = texture2D(uSampler, vTextureCoord);

    // A simple & fast algorithm for getting brightness.
    // It's inaccuracy , but good enought for this feature.
    float _max = max(max(color.r, color.g), color.b);
    float _min = min(min(color.r, color.g), color.b);
    float brightness = (_max + _min) * 0.5;

    if(brightness > threshold) {
        gl_FragColor = color;
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
}
`,an=function(i){Ye(e,i);function e(t){t===void 0&&(t=.5);var r=i.call(this,Qe,sn)||this;return r.threshold=t,r}return Object.defineProperty(e.prototype,"threshold",{get:function(){return this.uniforms.threshold},set:function(t){this.uniforms.threshold=t},enumerable:!1,configurable:!0}),e}(j),cn=`uniform sampler2D uSampler;
varying vec2 vTextureCoord;

uniform sampler2D bloomTexture;
uniform float bloomScale;
uniform float brightness;

void main() {
    vec4 color = texture2D(uSampler, vTextureCoord);
    color.rgb *= brightness;
    vec4 bloomColor = vec4(texture2D(bloomTexture, vTextureCoord).rgb, 0.0);
    bloomColor.rgb *= bloomScale;
    gl_FragColor = color + bloomColor;
}
`;(function(i){Ye(e,i);function e(t){var r=i.call(this,Qe,cn)||this;r.bloomScale=1,r.brightness=1,r._resolution=yt.FILTER_RESOLUTION,typeof t=="number"&&(t={threshold:t});var n=Object.assign(e.defaults,t);r.bloomScale=n.bloomScale,r.brightness=n.brightness;var o=n.kernels,s=n.blur,a=n.quality,c=n.pixelSize,u=n.resolution;return r._extractFilter=new an(n.threshold),r._extractFilter.resolution=u,r._blurFilter=o?new jt(o):new jt(s,a),r.pixelSize=c,r.resolution=u,r}return e.prototype.apply=function(t,r,n,o,s){var a=t.getFilterTexture();this._extractFilter.apply(t,r,a,1,s);var c=t.getFilterTexture();this._blurFilter.apply(t,a,c,1),this.uniforms.bloomScale=this.bloomScale,this.uniforms.brightness=this.brightness,this.uniforms.bloomTexture=c,t.applyFilter(this,r,n,o),t.returnFilterTexture(c),t.returnFilterTexture(a)},Object.defineProperty(e.prototype,"resolution",{get:function(){return this._resolution},set:function(t){this._resolution=t,this._extractFilter&&(this._extractFilter.resolution=t),this._blurFilter&&(this._blurFilter.resolution=t)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"threshold",{get:function(){return this._extractFilter.threshold},set:function(t){this._extractFilter.threshold=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"kernels",{get:function(){return this._blurFilter.kernels},set:function(t){this._blurFilter.kernels=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blur",{get:function(){return this._blurFilter.blur},set:function(t){this._blurFilter.blur=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"quality",{get:function(){return this._blurFilter.quality},set:function(t){this._blurFilter.quality=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"pixelSize",{get:function(){return this._blurFilter.pixelSize},set:function(t){this._blurFilter.pixelSize=t},enumerable:!1,configurable:!0}),e.defaults={threshold:.5,bloomScale:1,brightness:1,kernels:null,blur:8,quality:4,pixelSize:1,resolution:yt.FILTER_RESOLUTION},e})(j);/*!
 * @pixi/filter-ascii - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-ascii is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var $t=function(i,e){return $t=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},$t(i,e)};function ln(i,e){$t(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var un=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,fn=`varying vec2 vTextureCoord;

uniform vec4 filterArea;
uniform float pixelSize;
uniform sampler2D uSampler;

vec2 mapCoord( vec2 coord )
{
    coord *= filterArea.xy;
    coord += filterArea.zw;

    return coord;
}

vec2 unmapCoord( vec2 coord )
{
    coord -= filterArea.zw;
    coord /= filterArea.xy;

    return coord;
}

vec2 pixelate(vec2 coord, vec2 size)
{
    return floor( coord / size ) * size;
}

vec2 getMod(vec2 coord, vec2 size)
{
    return mod( coord , size) / size;
}

float character(float n, vec2 p)
{
    p = floor(p*vec2(4.0, -4.0) + 2.5);

    if (clamp(p.x, 0.0, 4.0) == p.x)
    {
        if (clamp(p.y, 0.0, 4.0) == p.y)
        {
            if (int(mod(n/exp2(p.x + 5.0*p.y), 2.0)) == 1) return 1.0;
        }
    }
    return 0.0;
}

void main()
{
    vec2 coord = mapCoord(vTextureCoord);

    // get the rounded color..
    vec2 pixCoord = pixelate(coord, vec2(pixelSize));
    pixCoord = unmapCoord(pixCoord);

    vec4 color = texture2D(uSampler, pixCoord);

    // determine the character to use
    float gray = (color.r + color.g + color.b) / 3.0;

    float n =  65536.0;             // .
    if (gray > 0.2) n = 65600.0;    // :
    if (gray > 0.3) n = 332772.0;   // *
    if (gray > 0.4) n = 15255086.0; // o
    if (gray > 0.5) n = 23385164.0; // &
    if (gray > 0.6) n = 15252014.0; // 8
    if (gray > 0.7) n = 13199452.0; // @
    if (gray > 0.8) n = 11512810.0; // #

    // get the mod..
    vec2 modd = getMod(coord, vec2(pixelSize));

    gl_FragColor = color * character( n, vec2(-1.0) + modd * 2.0);

}
`;(function(i){ln(e,i);function e(t){t===void 0&&(t=8);var r=i.call(this,un,fn)||this;return r.size=t,r}return Object.defineProperty(e.prototype,"size",{get:function(){return this.uniforms.pixelSize},set:function(t){this.uniforms.pixelSize=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-bevel - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-bevel is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Vt=function(i,e){return Vt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Vt(i,e)};function hn(i,e){Vt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var dn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,pn=`precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;

uniform float transformX;
uniform float transformY;
uniform vec3 lightColor;
uniform float lightAlpha;
uniform vec3 shadowColor;
uniform float shadowAlpha;

void main(void) {
    vec2 transform = vec2(1.0 / filterArea) * vec2(transformX, transformY);
    vec4 color = texture2D(uSampler, vTextureCoord);
    float light = texture2D(uSampler, vTextureCoord - transform).a;
    float shadow = texture2D(uSampler, vTextureCoord + transform).a;

    color.rgb = mix(color.rgb, lightColor, clamp((color.a - light) * lightAlpha, 0.0, 1.0));
    color.rgb = mix(color.rgb, shadowColor, clamp((color.a - shadow) * shadowAlpha, 0.0, 1.0));
    gl_FragColor = vec4(color.rgb * color.a, color.a);
}
`;(function(i){hn(e,i);function e(t){var r=i.call(this,dn,pn)||this;return r._thickness=2,r._angle=0,r.uniforms.lightColor=new Float32Array(3),r.uniforms.shadowColor=new Float32Array(3),Object.assign(r,{rotation:45,thickness:2,lightColor:16777215,lightAlpha:.7,shadowColor:0,shadowAlpha:.7},t),r.padding=1,r}return e.prototype._updateTransform=function(){this.uniforms.transformX=this._thickness*Math.cos(this._angle),this.uniforms.transformY=this._thickness*Math.sin(this._angle)},Object.defineProperty(e.prototype,"rotation",{get:function(){return this._angle/nt},set:function(t){this._angle=t*nt,this._updateTransform()},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"thickness",{get:function(){return this._thickness},set:function(t){this._thickness=t,this._updateTransform()},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"lightColor",{get:function(){return q(this.uniforms.lightColor)},set:function(t){X(t,this.uniforms.lightColor)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"lightAlpha",{get:function(){return this.uniforms.lightAlpha},set:function(t){this.uniforms.lightAlpha=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"shadowColor",{get:function(){return q(this.uniforms.shadowColor)},set:function(t){X(t,this.uniforms.shadowColor)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"shadowAlpha",{get:function(){return this.uniforms.shadowAlpha},set:function(t){this.uniforms.shadowAlpha=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-bloom - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-bloom is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var kt=function(i,e){return kt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},kt(i,e)};function mn(i,e){kt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}(function(i){mn(e,i);function e(t,r,n,o){t===void 0&&(t=2),r===void 0&&(r=4),n===void 0&&(n=yt.FILTER_RESOLUTION),o===void 0&&(o=5);var s=i.call(this)||this,a,c;return typeof t=="number"?(a=t,c=t):t instanceof S?(a=t.x,c=t.y):Array.isArray(t)&&(a=t[0],c=t[1]),s.blurXFilter=new Te(!0,a,r,n,o),s.blurYFilter=new Te(!1,c,r,n,o),s.blurYFilter.blendMode=ar.SCREEN,s.defaultFilter=new cr,s}return e.prototype.apply=function(t,r,n,o){var s=t.getFilterTexture();this.defaultFilter.apply(t,r,n,o),this.blurXFilter.apply(t,r,s,1),this.blurYFilter.apply(t,s,n,0),t.returnFilterTexture(s)},Object.defineProperty(e.prototype,"blur",{get:function(){return this.blurXFilter.blur},set:function(t){this.blurXFilter.blur=this.blurYFilter.blur=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blurX",{get:function(){return this.blurXFilter.blur},set:function(t){this.blurXFilter.blur=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blurY",{get:function(){return this.blurYFilter.blur},set:function(t){this.blurYFilter.blur=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-bulge-pinch - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-bulge-pinch is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Et=function(i,e){return Et=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Et(i,e)};function yn(i,e){Et(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var vn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,xn=`uniform float radius;
uniform float strength;
uniform vec2 center;
uniform sampler2D uSampler;
varying vec2 vTextureCoord;

uniform vec4 filterArea;
uniform vec4 filterClamp;
uniform vec2 dimensions;

void main()
{
    vec2 coord = vTextureCoord * filterArea.xy;
    coord -= center * dimensions.xy;
    float distance = length(coord);
    if (distance < radius) {
        float percent = distance / radius;
        if (strength > 0.0) {
            coord *= mix(1.0, smoothstep(0.0, radius / distance, percent), strength * 0.75);
        } else {
            coord *= mix(1.0, pow(percent, 1.0 + strength * 0.75) * radius / distance, 1.0 - percent);
        }
    }
    coord += center * dimensions.xy;
    coord /= filterArea.xy;
    vec2 clampedCoord = clamp(coord, filterClamp.xy, filterClamp.zw);
    vec4 color = texture2D(uSampler, clampedCoord);
    if (coord != clampedCoord) {
        color *= max(0.0, 1.0 - length(coord - clampedCoord));
    }

    gl_FragColor = color;
}
`;(function(i){yn(e,i);function e(t){var r=i.call(this,vn,xn)||this;return r.uniforms.dimensions=new Float32Array(2),Object.assign(r,e.defaults,t),r}return e.prototype.apply=function(t,r,n,o){var s=r.filterFrame,a=s.width,c=s.height;this.uniforms.dimensions[0]=a,this.uniforms.dimensions[1]=c,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"radius",{get:function(){return this.uniforms.radius},set:function(t){this.uniforms.radius=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"strength",{get:function(){return this.uniforms.strength},set:function(t){this.uniforms.strength=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"center",{get:function(){return this.uniforms.center},set:function(t){this.uniforms.center=t},enumerable:!1,configurable:!0}),e.defaults={center:[.5,.5],radius:100,strength:1},e})(j);/*!
 * @pixi/filter-color-map - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-color-map is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Bt=function(i,e){return Bt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Bt(i,e)};function _n(i,e){Bt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var gn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,bn=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform sampler2D colorMap;
uniform float _mix;
uniform float _size;
uniform float _sliceSize;
uniform float _slicePixelSize;
uniform float _sliceInnerSize;
void main() {
    vec4 color = texture2D(uSampler, vTextureCoord.xy);

    vec4 adjusted;
    if (color.a > 0.0) {
        color.rgb /= color.a;
        float innerWidth = _size - 1.0;
        float zSlice0 = min(floor(color.b * innerWidth), innerWidth);
        float zSlice1 = min(zSlice0 + 1.0, innerWidth);
        float xOffset = _slicePixelSize * 0.5 + color.r * _sliceInnerSize;
        float s0 = xOffset + (zSlice0 * _sliceSize);
        float s1 = xOffset + (zSlice1 * _sliceSize);
        float yOffset = _sliceSize * 0.5 + color.g * (1.0 - _sliceSize);
        vec4 slice0Color = texture2D(colorMap, vec2(s0,yOffset));
        vec4 slice1Color = texture2D(colorMap, vec2(s1,yOffset));
        float zOffset = fract(color.b * innerWidth);
        adjusted = mix(slice0Color, slice1Color, zOffset);

        color.rgb *= color.a;
    }
    gl_FragColor = vec4(mix(color, adjusted, _mix).rgb, color.a);

}`;(function(i){_n(e,i);function e(t,r,n){r===void 0&&(r=!1),n===void 0&&(n=1);var o=i.call(this,gn,bn)||this;return o.mix=1,o._size=0,o._sliceSize=0,o._slicePixelSize=0,o._sliceInnerSize=0,o._nearest=!1,o._scaleMode=null,o._colorMap=null,o._scaleMode=null,o.nearest=r,o.mix=n,o.colorMap=t,o}return e.prototype.apply=function(t,r,n,o){this.uniforms._mix=this.mix,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"colorSize",{get:function(){return this._size},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"colorMap",{get:function(){return this._colorMap},set:function(t){var r;!t||(t instanceof Y||(t=Y.from(t)),!((r=t)===null||r===void 0)&&r.baseTexture&&(t.baseTexture.scaleMode=this._scaleMode,t.baseTexture.mipmap=we.OFF,this._size=t.height,this._sliceSize=1/this._size,this._slicePixelSize=this._sliceSize/this._size,this._sliceInnerSize=this._slicePixelSize*(this._size-1),this.uniforms._size=this._size,this.uniforms._sliceSize=this._sliceSize,this.uniforms._slicePixelSize=this._slicePixelSize,this.uniforms._sliceInnerSize=this._sliceInnerSize,this.uniforms.colorMap=t),this._colorMap=t)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"nearest",{get:function(){return this._nearest},set:function(t){this._nearest=t,this._scaleMode=t?Mt.NEAREST:Mt.LINEAR;var r=this._colorMap;r&&r.baseTexture&&(r.baseTexture._glTextures={},r.baseTexture.scaleMode=this._scaleMode,r.baseTexture.mipmap=we.OFF,r._updateID++,r.baseTexture.emit("update",r.baseTexture))},enumerable:!1,configurable:!0}),e.prototype.updateColorMap=function(){var t=this._colorMap;t&&t.baseTexture&&(t._updateID++,t.baseTexture.emit("update",t.baseTexture),this.colorMap=t)},e.prototype.destroy=function(t){t===void 0&&(t=!1),this._colorMap&&this._colorMap.destroy(t),i.prototype.destroy.call(this)},e})(j);/*!
 * @pixi/filter-color-overlay - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-color-overlay is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Nt=function(i,e){return Nt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Nt(i,e)};function Cn(i,e){Nt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Tn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,wn=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec3 color;
uniform float alpha;

void main(void) {
    vec4 currentColor = texture2D(uSampler, vTextureCoord);
    gl_FragColor = vec4(mix(currentColor.rgb, color.rgb, currentColor.a * alpha), currentColor.a);
}
`;(function(i){Cn(e,i);function e(t,r){t===void 0&&(t=0),r===void 0&&(r=1);var n=i.call(this,Tn,wn)||this;return n._color=0,n._alpha=1,n.uniforms.color=new Float32Array(3),n.color=t,n.alpha=r,n}return Object.defineProperty(e.prototype,"color",{get:function(){return this._color},set:function(t){var r=this.uniforms.color;typeof t=="number"?(X(t,r),this._color=t):(r[0]=t[0],r[1]=t[1],r[2]=t[2],this._color=q(r))},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"alpha",{get:function(){return this._alpha},set:function(t){this.uniforms.alpha=t,this._alpha=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-color-replace - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-color-replace is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var qt=function(i,e){return qt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},qt(i,e)};function Sn(i,e){qt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var jn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,On=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec3 originalColor;
uniform vec3 newColor;
uniform float epsilon;
void main(void) {
    vec4 currentColor = texture2D(uSampler, vTextureCoord);
    vec3 colorDiff = originalColor - (currentColor.rgb / max(currentColor.a, 0.0000000001));
    float colorDistance = length(colorDiff);
    float doReplace = step(colorDistance, epsilon);
    gl_FragColor = vec4(mix(currentColor.rgb, (newColor + colorDiff) * currentColor.a, doReplace), currentColor.a);
}
`;(function(i){Sn(e,i);function e(t,r,n){t===void 0&&(t=16711680),r===void 0&&(r=0),n===void 0&&(n=.4);var o=i.call(this,jn,On)||this;return o._originalColor=16711680,o._newColor=0,o.uniforms.originalColor=new Float32Array(3),o.uniforms.newColor=new Float32Array(3),o.originalColor=t,o.newColor=r,o.epsilon=n,o}return Object.defineProperty(e.prototype,"originalColor",{get:function(){return this._originalColor},set:function(t){var r=this.uniforms.originalColor;typeof t=="number"?(X(t,r),this._originalColor=t):(r[0]=t[0],r[1]=t[1],r[2]=t[2],this._originalColor=q(r))},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"newColor",{get:function(){return this._newColor},set:function(t){var r=this.uniforms.newColor;typeof t=="number"?(X(t,r),this._newColor=t):(r[0]=t[0],r[1]=t[1],r[2]=t[2],this._newColor=q(r))},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"epsilon",{get:function(){return this.uniforms.epsilon},set:function(t){this.uniforms.epsilon=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-convolution - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-convolution is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Xt=function(i,e){return Xt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Xt(i,e)};function Pn(i,e){Xt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Dn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,An=`precision mediump float;

varying mediump vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform vec2 texelSize;
uniform float matrix[9];

void main(void)
{
   vec4 c11 = texture2D(uSampler, vTextureCoord - texelSize); // top left
   vec4 c12 = texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y - texelSize.y)); // top center
   vec4 c13 = texture2D(uSampler, vec2(vTextureCoord.x + texelSize.x, vTextureCoord.y - texelSize.y)); // top right

   vec4 c21 = texture2D(uSampler, vec2(vTextureCoord.x - texelSize.x, vTextureCoord.y)); // mid left
   vec4 c22 = texture2D(uSampler, vTextureCoord); // mid center
   vec4 c23 = texture2D(uSampler, vec2(vTextureCoord.x + texelSize.x, vTextureCoord.y)); // mid right

   vec4 c31 = texture2D(uSampler, vec2(vTextureCoord.x - texelSize.x, vTextureCoord.y + texelSize.y)); // bottom left
   vec4 c32 = texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y + texelSize.y)); // bottom center
   vec4 c33 = texture2D(uSampler, vTextureCoord + texelSize); // bottom right

   gl_FragColor =
       c11 * matrix[0] + c12 * matrix[1] + c13 * matrix[2] +
       c21 * matrix[3] + c22 * matrix[4] + c23 * matrix[5] +
       c31 * matrix[6] + c32 * matrix[7] + c33 * matrix[8];

   gl_FragColor.a = c22.a;
}
`;(function(i){Pn(e,i);function e(t,r,n){r===void 0&&(r=200),n===void 0&&(n=200);var o=i.call(this,Dn,An)||this;return o.uniforms.texelSize=new Float32Array(2),o.uniforms.matrix=new Float32Array(9),t!==void 0&&(o.matrix=t),o.width=r,o.height=n,o}return Object.defineProperty(e.prototype,"matrix",{get:function(){return this.uniforms.matrix},set:function(t){var r=this;t.forEach(function(n,o){r.uniforms.matrix[o]=n})},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"width",{get:function(){return 1/this.uniforms.texelSize[0]},set:function(t){this.uniforms.texelSize[0]=1/t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"height",{get:function(){return 1/this.uniforms.texelSize[1]},set:function(t){this.uniforms.texelSize[1]=1/t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-cross-hatch - v4.1.3
 * Compiled Thu, 17 Jun 2021 19:33:56 UTC
 *
 * @pixi/filter-cross-hatch is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Gt=function(i,e){return Gt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Gt(i,e)};function Fn(i,e){Gt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var zn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Mn=`precision mediump float;

varying vec2 vTextureCoord;

uniform sampler2D uSampler;

void main(void)
{
    float lum = length(texture2D(uSampler, vTextureCoord.xy).rgb);

    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);

    if (lum < 1.00)
    {
        if (mod(gl_FragCoord.x + gl_FragCoord.y, 10.0) == 0.0)
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    }

    if (lum < 0.75)
    {
        if (mod(gl_FragCoord.x - gl_FragCoord.y, 10.0) == 0.0)
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    }

    if (lum < 0.50)
    {
        if (mod(gl_FragCoord.x + gl_FragCoord.y - 5.0, 10.0) == 0.0)
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    }

    if (lum < 0.3)
    {
        if (mod(gl_FragCoord.x - gl_FragCoord.y - 5.0, 10.0) == 0.0)
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    }
}
`;(function(i){Fn(e,i);function e(){return i.call(this,zn,Mn)||this}return e})(j);/*!
 * @pixi/filter-crt - v4.1.6
 * Compiled Thu, 03 Feb 2022 14:30:04 UTC
 *
 * @pixi/filter-crt is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Ut=function(i,e){return Ut=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Ut(i,e)};function In(i,e){Ut(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Ln=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Rn=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform vec4 filterArea;
uniform vec2 dimensions;

const float SQRT_2 = 1.414213;

const float light = 1.0;

uniform float curvature;
uniform float lineWidth;
uniform float lineContrast;
uniform bool verticalLine;
uniform float noise;
uniform float noiseSize;

uniform float vignetting;
uniform float vignettingAlpha;
uniform float vignettingBlur;

uniform float seed;
uniform float time;

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void)
{
    vec2 pixelCoord = vTextureCoord.xy * filterArea.xy;
    vec2 dir = vec2(vTextureCoord.xy * filterArea.xy / dimensions - vec2(0.5, 0.5));
    
    gl_FragColor = texture2D(uSampler, vTextureCoord);
    vec3 rgb = gl_FragColor.rgb;

    if (noise > 0.0 && noiseSize > 0.0)
    {
        pixelCoord.x = floor(pixelCoord.x / noiseSize);
        pixelCoord.y = floor(pixelCoord.y / noiseSize);
        float _noise = rand(pixelCoord * noiseSize * seed) - 0.5;
        rgb += _noise * noise;
    }

    if (lineWidth > 0.0)
    {
        float _c = curvature > 0. ? curvature : 1.;
        float k = curvature > 0. ?(length(dir * dir) * 0.25 * _c * _c + 0.935 * _c) : 1.;
        vec2 uv = dir * k;

        float v = (verticalLine ? uv.x * dimensions.x : uv.y * dimensions.y) * min(1.0, 2.0 / lineWidth ) / _c;
        float j = 1. + cos(v * 1.2 - time) * 0.5 * lineContrast;
        rgb *= j;
        float segment = verticalLine ? mod((dir.x + .5) * dimensions.x, 4.) : mod((dir.y + .5) * dimensions.y, 4.);
        rgb *= 0.99 + ceil(segment) * 0.015;
    }

    if (vignetting > 0.0)
    {
        float outter = SQRT_2 - vignetting * SQRT_2;
        float darker = clamp((outter - length(dir) * SQRT_2) / ( 0.00001 + vignettingBlur * SQRT_2), 0.0, 1.0);
        rgb *= darker + (1.0 - darker) * (1.0 - vignettingAlpha);
    }

    gl_FragColor.rgb = rgb;
}
`;(function(i){In(e,i);function e(t){var r=i.call(this,Ln,Rn)||this;return r.time=0,r.seed=0,r.uniforms.dimensions=new Float32Array(2),Object.assign(r,e.defaults,t),r}return e.prototype.apply=function(t,r,n,o){var s=r.filterFrame,a=s.width,c=s.height;this.uniforms.dimensions[0]=a,this.uniforms.dimensions[1]=c,this.uniforms.seed=this.seed,this.uniforms.time=this.time,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"curvature",{get:function(){return this.uniforms.curvature},set:function(t){this.uniforms.curvature=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"lineWidth",{get:function(){return this.uniforms.lineWidth},set:function(t){this.uniforms.lineWidth=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"lineContrast",{get:function(){return this.uniforms.lineContrast},set:function(t){this.uniforms.lineContrast=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"verticalLine",{get:function(){return this.uniforms.verticalLine},set:function(t){this.uniforms.verticalLine=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"noise",{get:function(){return this.uniforms.noise},set:function(t){this.uniforms.noise=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"noiseSize",{get:function(){return this.uniforms.noiseSize},set:function(t){this.uniforms.noiseSize=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"vignetting",{get:function(){return this.uniforms.vignetting},set:function(t){this.uniforms.vignetting=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"vignettingAlpha",{get:function(){return this.uniforms.vignettingAlpha},set:function(t){this.uniforms.vignettingAlpha=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"vignettingBlur",{get:function(){return this.uniforms.vignettingBlur},set:function(t){this.uniforms.vignettingBlur=t},enumerable:!1,configurable:!0}),e.defaults={curvature:1,lineWidth:1,lineContrast:.25,verticalLine:!1,noise:0,noiseSize:1,seed:0,vignetting:.3,vignettingAlpha:1,vignettingBlur:.3,time:0},e})(j);/*!
 * @pixi/filter-dot - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-dot is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Wt=function(i,e){return Wt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Wt(i,e)};function $n(i,e){Wt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Vn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,kn=`precision mediump float;

varying vec2 vTextureCoord;
varying vec4 vColor;

uniform vec4 filterArea;
uniform sampler2D uSampler;

uniform float angle;
uniform float scale;

float pattern()
{
   float s = sin(angle), c = cos(angle);
   vec2 tex = vTextureCoord * filterArea.xy;
   vec2 point = vec2(
       c * tex.x - s * tex.y,
       s * tex.x + c * tex.y
   ) * scale;
   return (sin(point.x) * sin(point.y)) * 4.0;
}

void main()
{
   vec4 color = texture2D(uSampler, vTextureCoord);
   float average = (color.r + color.g + color.b) / 3.0;
   gl_FragColor = vec4(vec3(average * 10.0 - 5.0 + pattern()), color.a);
}
`;(function(i){$n(e,i);function e(t,r){t===void 0&&(t=1),r===void 0&&(r=5);var n=i.call(this,Vn,kn)||this;return n.scale=t,n.angle=r,n}return Object.defineProperty(e.prototype,"scale",{get:function(){return this.uniforms.scale},set:function(t){this.uniforms.scale=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"angle",{get:function(){return this.uniforms.angle},set:function(t){this.uniforms.angle=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-drop-shadow - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-drop-shadow is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Kt=function(i,e){return Kt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Kt(i,e)};function En(i,e){Kt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Ot=function(){return Ot=Object.assign||function(e){for(var t=arguments,r,n=1,o=arguments.length;n<o;n++){r=t[n];for(var s in r)Object.prototype.hasOwnProperty.call(r,s)&&(e[s]=r[s])}return e},Ot.apply(this,arguments)},Bn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Nn=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float alpha;
uniform vec3 color;

uniform vec2 shift;
uniform vec4 inputSize;

void main(void){
    vec4 sample = texture2D(uSampler, vTextureCoord - shift * inputSize.zw);

    // Premultiply alpha
    sample.rgb = color.rgb * sample.a;

    // alpha user alpha
    sample *= alpha;

    gl_FragColor = sample;
}`;(function(i){En(e,i);function e(t){var r=i.call(this)||this;r.angle=45,r._distance=5,r._resolution=yt.FILTER_RESOLUTION;var n=t?Ot(Ot({},e.defaults),t):e.defaults,o=n.kernels,s=n.blur,a=n.quality,c=n.pixelSize,u=n.resolution;r._tintFilter=new j(Bn,Nn),r._tintFilter.uniforms.color=new Float32Array(4),r._tintFilter.uniforms.shift=new S,r._tintFilter.resolution=u,r._blurFilter=o?new jt(o):new jt(s,a),r.pixelSize=c,r.resolution=u;var l=n.shadowOnly,h=n.rotation,p=n.distance,d=n.alpha,f=n.color;return r.shadowOnly=l,r.rotation=h,r.distance=p,r.alpha=d,r.color=f,r._updatePadding(),r}return e.prototype.apply=function(t,r,n,o){var s=t.getFilterTexture();this._tintFilter.apply(t,r,s,1),this._blurFilter.apply(t,s,n,o),this.shadowOnly!==!0&&t.applyFilter(this,r,n,0),t.returnFilterTexture(s)},e.prototype._updatePadding=function(){this.padding=this.distance+this.blur*2},e.prototype._updateShift=function(){this._tintFilter.uniforms.shift.set(this.distance*Math.cos(this.angle),this.distance*Math.sin(this.angle))},Object.defineProperty(e.prototype,"resolution",{get:function(){return this._resolution},set:function(t){this._resolution=t,this._tintFilter&&(this._tintFilter.resolution=t),this._blurFilter&&(this._blurFilter.resolution=t)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"distance",{get:function(){return this._distance},set:function(t){this._distance=t,this._updatePadding(),this._updateShift()},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"rotation",{get:function(){return this.angle/nt},set:function(t){this.angle=t*nt,this._updateShift()},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"alpha",{get:function(){return this._tintFilter.uniforms.alpha},set:function(t){this._tintFilter.uniforms.alpha=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"color",{get:function(){return q(this._tintFilter.uniforms.color)},set:function(t){X(t,this._tintFilter.uniforms.color)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"kernels",{get:function(){return this._blurFilter.kernels},set:function(t){this._blurFilter.kernels=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blur",{get:function(){return this._blurFilter.blur},set:function(t){this._blurFilter.blur=t,this._updatePadding()},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"quality",{get:function(){return this._blurFilter.quality},set:function(t){this._blurFilter.quality=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"pixelSize",{get:function(){return this._blurFilter.pixelSize},set:function(t){this._blurFilter.pixelSize=t},enumerable:!1,configurable:!0}),e.defaults={rotation:45,distance:5,color:0,alpha:.5,shadowOnly:!1,kernels:null,blur:2,quality:3,pixelSize:1,resolution:yt.FILTER_RESOLUTION},e})(j);/*!
 * @pixi/filter-emboss - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-emboss is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Yt=function(i,e){return Yt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Yt(i,e)};function qn(i,e){Yt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Xn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Gn=`precision mediump float;

varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform float strength;
uniform vec4 filterArea;


void main(void)
{
	vec2 onePixel = vec2(1.0 / filterArea);

	vec4 color;

	color.rgb = vec3(0.5);

	color -= texture2D(uSampler, vTextureCoord - onePixel) * strength;
	color += texture2D(uSampler, vTextureCoord + onePixel) * strength;

	color.rgb = vec3((color.r + color.g + color.b) / 3.0);

	float alpha = texture2D(uSampler, vTextureCoord).a;

	gl_FragColor = vec4(color.rgb * alpha, alpha);
}
`;(function(i){qn(e,i);function e(t){t===void 0&&(t=5);var r=i.call(this,Xn,Gn)||this;return r.strength=t,r}return Object.defineProperty(e.prototype,"strength",{get:function(){return this.uniforms.strength},set:function(t){this.uniforms.strength=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-glitch - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-glitch is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Qt=function(i,e){return Qt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Qt(i,e)};function Un(i,e){Qt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Wn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Kn=`// precision highp float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform vec4 filterArea;
uniform vec4 filterClamp;
uniform vec2 dimensions;
uniform float aspect;

uniform sampler2D displacementMap;
uniform float offset;
uniform float sinDir;
uniform float cosDir;
uniform int fillMode;

uniform float seed;
uniform vec2 red;
uniform vec2 green;
uniform vec2 blue;

const int TRANSPARENT = 0;
const int ORIGINAL = 1;
const int LOOP = 2;
const int CLAMP = 3;
const int MIRROR = 4;

void main(void)
{
    vec2 coord = (vTextureCoord * filterArea.xy) / dimensions;

    if (coord.x > 1.0 || coord.y > 1.0) {
        return;
    }

    float cx = coord.x - 0.5;
    float cy = (coord.y - 0.5) * aspect;
    float ny = (-sinDir * cx + cosDir * cy) / aspect + 0.5;

    // displacementMap: repeat
    // ny = ny > 1.0 ? ny - 1.0 : (ny < 0.0 ? 1.0 + ny : ny);

    // displacementMap: mirror
    ny = ny > 1.0 ? 2.0 - ny : (ny < 0.0 ? -ny : ny);

    vec4 dc = texture2D(displacementMap, vec2(0.5, ny));

    float displacement = (dc.r - dc.g) * (offset / filterArea.x);

    coord = vTextureCoord + vec2(cosDir * displacement, sinDir * displacement * aspect);

    if (fillMode == CLAMP) {
        coord = clamp(coord, filterClamp.xy, filterClamp.zw);
    } else {
        if( coord.x > filterClamp.z ) {
            if (fillMode == TRANSPARENT) {
                discard;
            } else if (fillMode == LOOP) {
                coord.x -= filterClamp.z;
            } else if (fillMode == MIRROR) {
                coord.x = filterClamp.z * 2.0 - coord.x;
            }
        } else if( coord.x < filterClamp.x ) {
            if (fillMode == TRANSPARENT) {
                discard;
            } else if (fillMode == LOOP) {
                coord.x += filterClamp.z;
            } else if (fillMode == MIRROR) {
                coord.x *= -filterClamp.z;
            }
        }

        if( coord.y > filterClamp.w ) {
            if (fillMode == TRANSPARENT) {
                discard;
            } else if (fillMode == LOOP) {
                coord.y -= filterClamp.w;
            } else if (fillMode == MIRROR) {
                coord.y = filterClamp.w * 2.0 - coord.y;
            }
        } else if( coord.y < filterClamp.y ) {
            if (fillMode == TRANSPARENT) {
                discard;
            } else if (fillMode == LOOP) {
                coord.y += filterClamp.w;
            } else if (fillMode == MIRROR) {
                coord.y *= -filterClamp.w;
            }
        }
    }

    gl_FragColor.r = texture2D(uSampler, coord + red * (1.0 - seed * 0.4) / filterArea.xy).r;
    gl_FragColor.g = texture2D(uSampler, coord + green * (1.0 - seed * 0.3) / filterArea.xy).g;
    gl_FragColor.b = texture2D(uSampler, coord + blue * (1.0 - seed * 0.2) / filterArea.xy).b;
    gl_FragColor.a = texture2D(uSampler, coord).a;
}
`;(function(i){Un(e,i);function e(t){var r=i.call(this,Wn,Kn)||this;return r.offset=100,r.fillMode=e.TRANSPARENT,r.average=!1,r.seed=0,r.minSize=8,r.sampleSize=512,r._slices=0,r._offsets=new Float32Array(1),r._sizes=new Float32Array(1),r._direction=-1,r.uniforms.dimensions=new Float32Array(2),r._canvas=document.createElement("canvas"),r._canvas.width=4,r._canvas.height=r.sampleSize,r.texture=Y.from(r._canvas,{scaleMode:Mt.NEAREST}),Object.assign(r,e.defaults,t),r}return e.prototype.apply=function(t,r,n,o){var s=r.filterFrame,a=s.width,c=s.height;this.uniforms.dimensions[0]=a,this.uniforms.dimensions[1]=c,this.uniforms.aspect=c/a,this.uniforms.seed=this.seed,this.uniforms.offset=this.offset,this.uniforms.fillMode=this.fillMode,t.applyFilter(this,r,n,o)},e.prototype._randomizeSizes=function(){var t=this._sizes,r=this._slices-1,n=this.sampleSize,o=Math.min(this.minSize/n,.9/this._slices);if(this.average){for(var s=this._slices,a=1,c=0;c<r;c++){var u=a/(s-c),l=Math.max(u*(1-Math.random()*.6),o);t[c]=l,a-=l}t[r]=a}else{for(var a=1,h=Math.sqrt(1/this._slices),c=0;c<r;c++){var l=Math.max(h*a*Math.random(),o);t[c]=l,a-=l}t[r]=a}this.shuffle()},e.prototype.shuffle=function(){for(var t=this._sizes,r=this._slices-1,n=r;n>0;n--){var o=Math.random()*n>>0,s=t[n];t[n]=t[o],t[o]=s}},e.prototype._randomizeOffsets=function(){for(var t=0;t<this._slices;t++)this._offsets[t]=Math.random()*(Math.random()<.5?-1:1)},e.prototype.refresh=function(){this._randomizeSizes(),this._randomizeOffsets(),this.redraw()},e.prototype.redraw=function(){var t=this.sampleSize,r=this.texture,n=this._canvas.getContext("2d");n.clearRect(0,0,8,t);for(var o,s=0,a=0;a<this._slices;a++){o=Math.floor(this._offsets[a]*256);var c=this._sizes[a]*t,u=o>0?o:0,l=o<0?-o:0;n.fillStyle="rgba("+u+", "+l+", 0, 1)",n.fillRect(0,s>>0,t,c+1>>0),s+=c}r.baseTexture.update(),this.uniforms.displacementMap=r},Object.defineProperty(e.prototype,"sizes",{get:function(){return this._sizes},set:function(t){for(var r=Math.min(this._slices,t.length),n=0;n<r;n++)this._sizes[n]=t[n]},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"offsets",{get:function(){return this._offsets},set:function(t){for(var r=Math.min(this._slices,t.length),n=0;n<r;n++)this._offsets[n]=t[n]},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"slices",{get:function(){return this._slices},set:function(t){this._slices!==t&&(this._slices=t,this.uniforms.slices=t,this._sizes=this.uniforms.slicesWidth=new Float32Array(t),this._offsets=this.uniforms.slicesOffset=new Float32Array(t),this.refresh())},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"direction",{get:function(){return this._direction},set:function(t){if(this._direction!==t){this._direction=t;var r=t*nt;this.uniforms.sinDir=Math.sin(r),this.uniforms.cosDir=Math.cos(r)}},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"red",{get:function(){return this.uniforms.red},set:function(t){this.uniforms.red=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"green",{get:function(){return this.uniforms.green},set:function(t){this.uniforms.green=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blue",{get:function(){return this.uniforms.blue},set:function(t){this.uniforms.blue=t},enumerable:!1,configurable:!0}),e.prototype.destroy=function(){var t;(t=this.texture)===null||t===void 0||t.destroy(!0),this.texture=this._canvas=this.red=this.green=this.blue=this._sizes=this._offsets=null},e.defaults={slices:5,offset:100,direction:0,fillMode:0,average:!1,seed:0,red:[0,0],green:[0,0],blue:[0,0],minSize:8,sampleSize:512},e.TRANSPARENT=0,e.ORIGINAL=1,e.LOOP=2,e.CLAMP=3,e.MIRROR=4,e})(j);/*!
 * @pixi/filter-glow - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-glow is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Ht=function(i,e){return Ht=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Ht(i,e)};function Yn(i,e){Ht(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Qn=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Hn=`varying vec2 vTextureCoord;
varying vec4 vColor;

uniform sampler2D uSampler;

uniform float outerStrength;
uniform float innerStrength;

uniform vec4 glowColor;

uniform vec4 filterArea;
uniform vec4 filterClamp;
uniform bool knockout;

const float PI = 3.14159265358979323846264;

const float DIST = __DIST__;
const float ANGLE_STEP_SIZE = min(__ANGLE_STEP_SIZE__, PI * 2.0);
const float ANGLE_STEP_NUM = ceil(PI * 2.0 / ANGLE_STEP_SIZE);

const float MAX_TOTAL_ALPHA = ANGLE_STEP_NUM * DIST * (DIST + 1.0) / 2.0;

void main(void) {
    vec2 px = vec2(1.0 / filterArea.x, 1.0 / filterArea.y);

    float totalAlpha = 0.0;

    vec2 direction;
    vec2 displaced;
    vec4 curColor;

    for (float angle = 0.0; angle < PI * 2.0; angle += ANGLE_STEP_SIZE) {
       direction = vec2(cos(angle), sin(angle)) * px;

       for (float curDistance = 0.0; curDistance < DIST; curDistance++) {
           displaced = clamp(vTextureCoord + direction * 
                   (curDistance + 1.0), filterClamp.xy, filterClamp.zw);

           curColor = texture2D(uSampler, displaced);

           totalAlpha += (DIST - curDistance) * curColor.a;
       }
    }
    
    curColor = texture2D(uSampler, vTextureCoord);

    float alphaRatio = (totalAlpha / MAX_TOTAL_ALPHA);

    float innerGlowAlpha = (1.0 - alphaRatio) * innerStrength * curColor.a;
    float innerGlowStrength = min(1.0, innerGlowAlpha);
    
    vec4 innerColor = mix(curColor, glowColor, innerGlowStrength);

    float outerGlowAlpha = alphaRatio * outerStrength * (1. - curColor.a);
    float outerGlowStrength = min(1.0 - innerColor.a, outerGlowAlpha);

    vec4 outerGlowColor = outerGlowStrength * glowColor.rgba;
    
    if (knockout) {
      float resultAlpha = outerGlowAlpha + innerGlowAlpha;
      gl_FragColor = vec4(glowColor.rgb * resultAlpha, resultAlpha);
    }
    else {
      gl_FragColor = innerColor + outerGlowColor;
    }
}
`,Zn=function(i){Yn(e,i);function e(t){var r=this,n=Object.assign({},e.defaults,t),o=n.outerStrength,s=n.innerStrength,a=n.color,c=n.knockout,u=n.quality,l=Math.round(n.distance);return r=i.call(this,Qn,Hn.replace(/__ANGLE_STEP_SIZE__/gi,""+(1/u/l).toFixed(7)).replace(/__DIST__/gi,l.toFixed(0)+".0"))||this,r.uniforms.glowColor=new Float32Array([0,0,0,1]),Object.assign(r,{color:a,outerStrength:o,innerStrength:s,padding:l,knockout:c}),r}return Object.defineProperty(e.prototype,"color",{get:function(){return q(this.uniforms.glowColor)},set:function(t){X(t,this.uniforms.glowColor)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"outerStrength",{get:function(){return this.uniforms.outerStrength},set:function(t){this.uniforms.outerStrength=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"innerStrength",{get:function(){return this.uniforms.innerStrength},set:function(t){this.uniforms.innerStrength=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"knockout",{get:function(){return this.uniforms.knockout},set:function(t){this.uniforms.knockout=t},enumerable:!1,configurable:!0}),e.defaults={distance:10,outerStrength:4,innerStrength:0,color:16777215,quality:.1,knockout:!1},e}(j);/*!
 * @pixi/filter-godray - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-godray is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Zt=function(i,e){return Zt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Zt(i,e)};function Jn(i,e){Zt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var to=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,eo=`vec3 mod289(vec3 x)
{
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec4 mod289(vec4 x)
{
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec4 permute(vec4 x)
{
    return mod289(((x * 34.0) + 1.0) * x);
}
vec4 taylorInvSqrt(vec4 r)
{
    return 1.79284291400159 - 0.85373472095314 * r;
}
vec3 fade(vec3 t)
{
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
// Classic Perlin noise, periodic variant
float pnoise(vec3 P, vec3 rep)
{
    vec3 Pi0 = mod(floor(P), rep); // Integer part, modulo period
    vec3 Pi1 = mod(Pi0 + vec3(1.0), rep); // Integer part + 1, mod period
    Pi0 = mod289(Pi0);
    Pi1 = mod289(Pi1);
    vec3 Pf0 = fract(P); // Fractional part for interpolation
    vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);
    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);
    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;
    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);
    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
}
float turb(vec3 P, vec3 rep, float lacunarity, float gain)
{
    float sum = 0.0;
    float sc = 1.0;
    float totalgain = 1.0;
    for (float i = 0.0; i < 6.0; i++)
    {
        sum += totalgain * pnoise(P * sc, rep);
        sc *= lacunarity;
        totalgain *= gain;
    }
    return abs(sum);
}
`,ro=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;
uniform vec2 dimensions;

uniform vec2 light;
uniform bool parallel;
uniform float aspect;

uniform float gain;
uniform float lacunarity;
uniform float time;
uniform float alpha;

\${perlin}

void main(void) {
    vec2 coord = vTextureCoord * filterArea.xy / dimensions.xy;

    float d;

    if (parallel) {
        float _cos = light.x;
        float _sin = light.y;
        d = (_cos * coord.x) + (_sin * coord.y * aspect);
    } else {
        float dx = coord.x - light.x / dimensions.x;
        float dy = (coord.y - light.y / dimensions.y) * aspect;
        float dis = sqrt(dx * dx + dy * dy) + 0.00001;
        d = dy / dis;
    }

    vec3 dir = vec3(d, d, 0.0);

    float noise = turb(dir + vec3(time, 0.0, 62.1 + time) * 0.05, vec3(480.0, 320.0, 480.0), lacunarity, gain);
    noise = mix(noise, 0.0, 0.3);
    //fade vertically.
    vec4 mist = vec4(noise, noise, noise, 1.0) * (1.0 - coord.y);
    mist.a = 1.0;
    // apply user alpha
    mist *= alpha;

    gl_FragColor = texture2D(uSampler, vTextureCoord) + mist;

}
`;(function(i){Jn(e,i);function e(t){var r=i.call(this,to,ro.replace("${perlin}",eo))||this;r.parallel=!0,r.time=0,r._angle=0,r.uniforms.dimensions=new Float32Array(2);var n=Object.assign(e.defaults,t);return r._angleLight=new S,r.angle=n.angle,r.gain=n.gain,r.lacunarity=n.lacunarity,r.alpha=n.alpha,r.parallel=n.parallel,r.center=n.center,r.time=n.time,r}return e.prototype.apply=function(t,r,n,o){var s=r.filterFrame,a=s.width,c=s.height;this.uniforms.light=this.parallel?this._angleLight:this.center,this.uniforms.parallel=this.parallel,this.uniforms.dimensions[0]=a,this.uniforms.dimensions[1]=c,this.uniforms.aspect=c/a,this.uniforms.time=this.time,this.uniforms.alpha=this.alpha,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"angle",{get:function(){return this._angle},set:function(t){this._angle=t;var r=t*nt;this._angleLight.x=Math.cos(r),this._angleLight.y=Math.sin(r)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"gain",{get:function(){return this.uniforms.gain},set:function(t){this.uniforms.gain=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"lacunarity",{get:function(){return this.uniforms.lacunarity},set:function(t){this.uniforms.lacunarity=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"alpha",{get:function(){return this.uniforms.alpha},set:function(t){this.uniforms.alpha=t},enumerable:!1,configurable:!0}),e.defaults={angle:30,gain:.5,lacunarity:2.5,time:0,parallel:!0,center:[0,0],alpha:1},e})(j);/*!
 * @pixi/filter-motion-blur - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-motion-blur is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var Jt=function(i,e){return Jt=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},Jt(i,e)};function no(i,e){Jt(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var oo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,io=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;

uniform vec2 uVelocity;
uniform int uKernelSize;
uniform float uOffset;

const int MAX_KERNEL_SIZE = 2048;

// Notice:
// the perfect way:
//    int kernelSize = min(uKernelSize, MAX_KERNELSIZE);
// BUT in real use-case , uKernelSize < MAX_KERNELSIZE almost always.
// So use uKernelSize directly.

void main(void)
{
    vec4 color = texture2D(uSampler, vTextureCoord);

    if (uKernelSize == 0)
    {
        gl_FragColor = color;
        return;
    }

    vec2 velocity = uVelocity / filterArea.xy;
    float offset = -uOffset / length(uVelocity) - 0.5;
    int k = uKernelSize - 1;

    for(int i = 0; i < MAX_KERNEL_SIZE - 1; i++) {
        if (i == k) {
            break;
        }
        vec2 bias = velocity * (float(i) / float(k) + offset);
        color += texture2D(uSampler, vTextureCoord + bias);
    }
    gl_FragColor = color / float(uKernelSize);
}
`;(function(i){no(e,i);function e(t,r,n){t===void 0&&(t=[0,0]),r===void 0&&(r=5),n===void 0&&(n=0);var o=i.call(this,oo,io)||this;return o.kernelSize=5,o.uniforms.uVelocity=new Float32Array(2),o._velocity=new pe(o.velocityChanged,o),o.setVelocity(t),o.kernelSize=r,o.offset=n,o}return e.prototype.apply=function(t,r,n,o){var s=this.velocity,a=s.x,c=s.y;this.uniforms.uKernelSize=a!==0||c!==0?this.kernelSize:0,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"velocity",{get:function(){return this._velocity},set:function(t){this.setVelocity(t)},enumerable:!1,configurable:!0}),e.prototype.setVelocity=function(t){if(Array.isArray(t)){var r=t[0],n=t[1];this._velocity.set(r,n)}else this._velocity.copyFrom(t)},e.prototype.velocityChanged=function(){this.uniforms.uVelocity[0]=this._velocity.x,this.uniforms.uVelocity[1]=this._velocity.y,this.padding=(Math.max(Math.abs(this._velocity.x),Math.abs(this._velocity.y))>>0)+1},Object.defineProperty(e.prototype,"offset",{get:function(){return this.uniforms.uOffset},set:function(t){this.uniforms.uOffset=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-multi-color-replace - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-multi-color-replace is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var te=function(i,e){return te=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},te(i,e)};function so(i,e){te(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var ao=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,co=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform float epsilon;

const int MAX_COLORS = %maxColors%;

uniform vec3 originalColors[MAX_COLORS];
uniform vec3 targetColors[MAX_COLORS];

void main(void)
{
    gl_FragColor = texture2D(uSampler, vTextureCoord);

    float alpha = gl_FragColor.a;
    if (alpha < 0.0001)
    {
      return;
    }

    vec3 color = gl_FragColor.rgb / alpha;

    for(int i = 0; i < MAX_COLORS; i++)
    {
      vec3 origColor = originalColors[i];
      if (origColor.r < 0.0)
      {
        break;
      }
      vec3 colorDiff = origColor - color;
      if (length(colorDiff) < epsilon)
      {
        vec3 targetColor = targetColors[i];
        gl_FragColor = vec4((targetColor + colorDiff) * alpha, alpha);
        return;
      }
    }
}
`;(function(i){so(e,i);function e(t,r,n){r===void 0&&(r=.05),n===void 0&&(n=t.length);var o=i.call(this,ao,co.replace(/%maxColors%/g,n.toFixed(0)))||this;return o._replacements=[],o._maxColors=0,o.epsilon=r,o._maxColors=n,o.uniforms.originalColors=new Float32Array(n*3),o.uniforms.targetColors=new Float32Array(n*3),o.replacements=t,o}return Object.defineProperty(e.prototype,"replacements",{get:function(){return this._replacements},set:function(t){var r=this.uniforms.originalColors,n=this.uniforms.targetColors,o=t.length;if(o>this._maxColors)throw new Error("Length of replacements ("+o+") exceeds the maximum colors length ("+this._maxColors+")");r[o*3]=-1;for(var s=0;s<o;s++){var a=t[s],c=a[0];typeof c=="number"?c=X(c):a[0]=q(c),r[s*3]=c[0],r[s*3+1]=c[1],r[s*3+2]=c[2];var u=a[1];typeof u=="number"?u=X(u):a[1]=q(u),n[s*3]=u[0],n[s*3+1]=u[1],n[s*3+2]=u[2]}this._replacements=t},enumerable:!1,configurable:!0}),e.prototype.refresh=function(){this.replacements=this._replacements},Object.defineProperty(e.prototype,"maxColors",{get:function(){return this._maxColors},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"epsilon",{get:function(){return this.uniforms.epsilon},set:function(t){this.uniforms.epsilon=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-old-film - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-old-film is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var ee=function(i,e){return ee=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},ee(i,e)};function lo(i,e){ee(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var uo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,fo=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;
uniform vec2 dimensions;

uniform float sepia;
uniform float noise;
uniform float noiseSize;
uniform float scratch;
uniform float scratchDensity;
uniform float scratchWidth;
uniform float vignetting;
uniform float vignettingAlpha;
uniform float vignettingBlur;
uniform float seed;

const float SQRT_2 = 1.414213;
const vec3 SEPIA_RGB = vec3(112.0 / 255.0, 66.0 / 255.0, 20.0 / 255.0);

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 Overlay(vec3 src, vec3 dst)
{
    // if (dst <= 0.5) then: 2 * src * dst
    // if (dst > 0.5) then: 1 - 2 * (1 - dst) * (1 - src)
    return vec3((dst.x <= 0.5) ? (2.0 * src.x * dst.x) : (1.0 - 2.0 * (1.0 - dst.x) * (1.0 - src.x)),
                (dst.y <= 0.5) ? (2.0 * src.y * dst.y) : (1.0 - 2.0 * (1.0 - dst.y) * (1.0 - src.y)),
                (dst.z <= 0.5) ? (2.0 * src.z * dst.z) : (1.0 - 2.0 * (1.0 - dst.z) * (1.0 - src.z)));
}


void main()
{
    gl_FragColor = texture2D(uSampler, vTextureCoord);
    vec3 color = gl_FragColor.rgb;

    if (sepia > 0.0)
    {
        float gray = (color.x + color.y + color.z) / 3.0;
        vec3 grayscale = vec3(gray);

        color = Overlay(SEPIA_RGB, grayscale);

        color = grayscale + sepia * (color - grayscale);
    }

    vec2 coord = vTextureCoord * filterArea.xy / dimensions.xy;

    if (vignetting > 0.0)
    {
        float outter = SQRT_2 - vignetting * SQRT_2;
        vec2 dir = vec2(vec2(0.5, 0.5) - coord);
        dir.y *= dimensions.y / dimensions.x;
        float darker = clamp((outter - length(dir) * SQRT_2) / ( 0.00001 + vignettingBlur * SQRT_2), 0.0, 1.0);
        color.rgb *= darker + (1.0 - darker) * (1.0 - vignettingAlpha);
    }

    if (scratchDensity > seed && scratch != 0.0)
    {
        float phase = seed * 256.0;
        float s = mod(floor(phase), 2.0);
        float dist = 1.0 / scratchDensity;
        float d = distance(coord, vec2(seed * dist, abs(s - seed * dist)));
        if (d < seed * 0.6 + 0.4)
        {
            highp float period = scratchDensity * 10.0;

            float xx = coord.x * period + phase;
            float aa = abs(mod(xx, 0.5) * 4.0);
            float bb = mod(floor(xx / 0.5), 2.0);
            float yy = (1.0 - bb) * aa + bb * (2.0 - aa);

            float kk = 2.0 * period;
            float dw = scratchWidth / dimensions.x * (0.75 + seed);
            float dh = dw * kk;

            float tine = (yy - (2.0 - dh));

            if (tine > 0.0) {
                float _sign = sign(scratch);

                tine = s * tine / period + scratch + 0.1;
                tine = clamp(tine + 1.0, 0.5 + _sign * 0.5, 1.5 + _sign * 0.5);

                color.rgb *= tine;
            }
        }
    }

    if (noise > 0.0 && noiseSize > 0.0)
    {
        vec2 pixelCoord = vTextureCoord.xy * filterArea.xy;
        pixelCoord.x = floor(pixelCoord.x / noiseSize);
        pixelCoord.y = floor(pixelCoord.y / noiseSize);
        // vec2 d = pixelCoord * noiseSize * vec2(1024.0 + seed * 512.0, 1024.0 - seed * 512.0);
        // float _noise = snoise(d) * 0.5;
        float _noise = rand(pixelCoord * noiseSize * seed) - 0.5;
        color += _noise * noise;
    }

    gl_FragColor.rgb = color;
}
`;(function(i){lo(e,i);function e(t,r){r===void 0&&(r=0);var n=i.call(this,uo,fo)||this;return n.seed=0,n.uniforms.dimensions=new Float32Array(2),typeof t=="number"?(n.seed=t,t=void 0):n.seed=r,Object.assign(n,e.defaults,t),n}return e.prototype.apply=function(t,r,n,o){var s,a;this.uniforms.dimensions[0]=(s=r.filterFrame)===null||s===void 0?void 0:s.width,this.uniforms.dimensions[1]=(a=r.filterFrame)===null||a===void 0?void 0:a.height,this.uniforms.seed=this.seed,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"sepia",{get:function(){return this.uniforms.sepia},set:function(t){this.uniforms.sepia=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"noise",{get:function(){return this.uniforms.noise},set:function(t){this.uniforms.noise=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"noiseSize",{get:function(){return this.uniforms.noiseSize},set:function(t){this.uniforms.noiseSize=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"scratch",{get:function(){return this.uniforms.scratch},set:function(t){this.uniforms.scratch=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"scratchDensity",{get:function(){return this.uniforms.scratchDensity},set:function(t){this.uniforms.scratchDensity=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"scratchWidth",{get:function(){return this.uniforms.scratchWidth},set:function(t){this.uniforms.scratchWidth=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"vignetting",{get:function(){return this.uniforms.vignetting},set:function(t){this.uniforms.vignetting=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"vignettingAlpha",{get:function(){return this.uniforms.vignettingAlpha},set:function(t){this.uniforms.vignettingAlpha=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"vignettingBlur",{get:function(){return this.uniforms.vignettingBlur},set:function(t){this.uniforms.vignettingBlur=t},enumerable:!1,configurable:!0}),e.defaults={sepia:.3,noise:.3,noiseSize:1,scratch:.5,scratchDensity:.3,scratchWidth:1,vignetting:.3,vignettingAlpha:1,vignettingBlur:.3},e})(j);/*!
 * @pixi/filter-outline - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-outline is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var re=function(i,e){return re=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},re(i,e)};function ho(i,e){re(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var po=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,mo=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform vec2 thickness;
uniform vec4 outlineColor;
uniform vec4 filterClamp;

const float DOUBLE_PI = 3.14159265358979323846264 * 2.;

void main(void) {
    vec4 ownColor = texture2D(uSampler, vTextureCoord);
    vec4 curColor;
    float maxAlpha = 0.;
    vec2 displaced;
    for (float angle = 0.; angle <= DOUBLE_PI; angle += \${angleStep}) {
        displaced.x = vTextureCoord.x + thickness.x * cos(angle);
        displaced.y = vTextureCoord.y + thickness.y * sin(angle);
        curColor = texture2D(uSampler, clamp(displaced, filterClamp.xy, filterClamp.zw));
        maxAlpha = max(maxAlpha, curColor.a);
    }
    float resultAlpha = max(maxAlpha, ownColor.a);
    gl_FragColor = vec4((ownColor.rgb + outlineColor.rgb * (1. - ownColor.a)) * resultAlpha, resultAlpha);
}
`,yo=function(i){ho(e,i);function e(t,r,n){t===void 0&&(t=1),r===void 0&&(r=0),n===void 0&&(n=.1);var o=i.call(this,po,mo.replace(/\$\{angleStep\}/,e.getAngleStep(n)))||this;return o._thickness=1,o.uniforms.thickness=new Float32Array([0,0]),o.uniforms.outlineColor=new Float32Array([0,0,0,1]),Object.assign(o,{thickness:t,color:r,quality:n}),o}return e.getAngleStep=function(t){var r=Math.max(t*e.MAX_SAMPLES,e.MIN_SAMPLES);return(Math.PI*2/r).toFixed(7)},e.prototype.apply=function(t,r,n,o){this.uniforms.thickness[0]=this._thickness/r._frame.width,this.uniforms.thickness[1]=this._thickness/r._frame.height,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"color",{get:function(){return q(this.uniforms.outlineColor)},set:function(t){X(t,this.uniforms.outlineColor)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"thickness",{get:function(){return this._thickness},set:function(t){this._thickness=t,this.padding=t},enumerable:!1,configurable:!0}),e.MIN_SAMPLES=1,e.MAX_SAMPLES=100,e}(j);/*!
 * @pixi/filter-pixelate - v4.1.3
 * Compiled Thu, 17 Jun 2021 19:33:56 UTC
 *
 * @pixi/filter-pixelate is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var ne=function(i,e){return ne=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},ne(i,e)};function vo(i,e){ne(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var xo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,_o=`precision mediump float;

varying vec2 vTextureCoord;

uniform vec2 size;
uniform sampler2D uSampler;

uniform vec4 filterArea;

vec2 mapCoord( vec2 coord )
{
    coord *= filterArea.xy;
    coord += filterArea.zw;

    return coord;
}

vec2 unmapCoord( vec2 coord )
{
    coord -= filterArea.zw;
    coord /= filterArea.xy;

    return coord;
}

vec2 pixelate(vec2 coord, vec2 size)
{
	return floor( coord / size ) * size;
}

void main(void)
{
    vec2 coord = mapCoord(vTextureCoord);

    coord = pixelate(coord, size);

    coord = unmapCoord(coord);

    gl_FragColor = texture2D(uSampler, coord);
}
`;(function(i){vo(e,i);function e(t){t===void 0&&(t=10);var r=i.call(this,xo,_o)||this;return r.size=t,r}return Object.defineProperty(e.prototype,"size",{get:function(){return this.uniforms.size},set:function(t){typeof t=="number"&&(t=[t,t]),this.uniforms.size=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-radial-blur - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-radial-blur is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var oe=function(i,e){return oe=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},oe(i,e)};function go(i,e){oe(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var bo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Co=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;

uniform float uRadian;
uniform vec2 uCenter;
uniform float uRadius;
uniform int uKernelSize;

const int MAX_KERNEL_SIZE = 2048;

void main(void)
{
    vec4 color = texture2D(uSampler, vTextureCoord);

    if (uKernelSize == 0)
    {
        gl_FragColor = color;
        return;
    }

    float aspect = filterArea.y / filterArea.x;
    vec2 center = uCenter.xy / filterArea.xy;
    float gradient = uRadius / filterArea.x * 0.3;
    float radius = uRadius / filterArea.x - gradient * 0.5;
    int k = uKernelSize - 1;

    vec2 coord = vTextureCoord;
    vec2 dir = vec2(center - coord);
    float dist = length(vec2(dir.x, dir.y * aspect));

    float radianStep = uRadian;
    if (radius >= 0.0 && dist > radius) {
        float delta = dist - radius;
        float gap = gradient;
        float scale = 1.0 - abs(delta / gap);
        if (scale <= 0.0) {
            gl_FragColor = color;
            return;
        }
        radianStep *= scale;
    }
    radianStep /= float(k);

    float s = sin(radianStep);
    float c = cos(radianStep);
    mat2 rotationMatrix = mat2(vec2(c, -s), vec2(s, c));

    for(int i = 0; i < MAX_KERNEL_SIZE - 1; i++) {
        if (i == k) {
            break;
        }

        coord -= center;
        coord.y *= aspect;
        coord = rotationMatrix * coord;
        coord.y /= aspect;
        coord += center;

        vec4 sample = texture2D(uSampler, coord);

        // switch to pre-multiplied alpha to correctly blur transparent images
        // sample.rgb *= sample.a;

        color += sample;
    }

    gl_FragColor = color / float(uKernelSize);
}
`;(function(i){go(e,i);function e(t,r,n,o){t===void 0&&(t=0),r===void 0&&(r=[0,0]),n===void 0&&(n=5),o===void 0&&(o=-1);var s=i.call(this,bo,Co)||this;return s._angle=0,s.angle=t,s.center=r,s.kernelSize=n,s.radius=o,s}return e.prototype.apply=function(t,r,n,o){this.uniforms.uKernelSize=this._angle!==0?this.kernelSize:0,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"angle",{get:function(){return this._angle},set:function(t){this._angle=t,this.uniforms.uRadian=t*Math.PI/180},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"center",{get:function(){return this.uniforms.uCenter},set:function(t){this.uniforms.uCenter=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"radius",{get:function(){return this.uniforms.uRadius},set:function(t){(t<0||t===1/0)&&(t=-1),this.uniforms.uRadius=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-reflection - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-reflection is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var ie=function(i,e){return ie=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},ie(i,e)};function To(i,e){ie(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var wo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,So=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform vec4 filterArea;
uniform vec4 filterClamp;
uniform vec2 dimensions;

uniform bool mirror;
uniform float boundary;
uniform vec2 amplitude;
uniform vec2 waveLength;
uniform vec2 alpha;
uniform float time;

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void)
{
    vec2 pixelCoord = vTextureCoord.xy * filterArea.xy;
    vec2 coord = pixelCoord / dimensions;

    if (coord.y < boundary) {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
        return;
    }

    float k = (coord.y - boundary) / (1. - boundary + 0.0001);
    float areaY = boundary * dimensions.y / filterArea.y;
    float v = areaY + areaY - vTextureCoord.y;
    float y = mirror ? v : vTextureCoord.y;

    float _amplitude = ((amplitude.y - amplitude.x) * k + amplitude.x ) / filterArea.x;
    float _waveLength = ((waveLength.y - waveLength.x) * k + waveLength.x) / filterArea.y;
    float _alpha = (alpha.y - alpha.x) * k + alpha.x;

    float x = vTextureCoord.x + cos(v * 6.28 / _waveLength - time) * _amplitude;
    x = clamp(x, filterClamp.x, filterClamp.z);

    vec4 color = texture2D(uSampler, vec2(x, y));

    gl_FragColor = color * _alpha;
}
`;(function(i){To(e,i);function e(t){var r=i.call(this,wo,So)||this;return r.time=0,r.uniforms.amplitude=new Float32Array(2),r.uniforms.waveLength=new Float32Array(2),r.uniforms.alpha=new Float32Array(2),r.uniforms.dimensions=new Float32Array(2),Object.assign(r,e.defaults,t),r}return e.prototype.apply=function(t,r,n,o){var s,a;this.uniforms.dimensions[0]=(s=r.filterFrame)===null||s===void 0?void 0:s.width,this.uniforms.dimensions[1]=(a=r.filterFrame)===null||a===void 0?void 0:a.height,this.uniforms.time=this.time,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"mirror",{get:function(){return this.uniforms.mirror},set:function(t){this.uniforms.mirror=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"boundary",{get:function(){return this.uniforms.boundary},set:function(t){this.uniforms.boundary=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"amplitude",{get:function(){return this.uniforms.amplitude},set:function(t){this.uniforms.amplitude[0]=t[0],this.uniforms.amplitude[1]=t[1]},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"waveLength",{get:function(){return this.uniforms.waveLength},set:function(t){this.uniforms.waveLength[0]=t[0],this.uniforms.waveLength[1]=t[1]},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"alpha",{get:function(){return this.uniforms.alpha},set:function(t){this.uniforms.alpha[0]=t[0],this.uniforms.alpha[1]=t[1]},enumerable:!1,configurable:!0}),e.defaults={mirror:!0,boundary:.5,amplitude:[0,20],waveLength:[30,100],alpha:[1,1],time:0},e})(j);/*!
 * @pixi/filter-rgb-split - v4.1.3
 * Compiled Thu, 17 Jun 2021 19:33:56 UTC
 *
 * @pixi/filter-rgb-split is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var se=function(i,e){return se=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},se(i,e)};function jo(i,e){se(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Oo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Po=`precision mediump float;

varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform vec4 filterArea;
uniform vec2 red;
uniform vec2 green;
uniform vec2 blue;

void main(void)
{
   gl_FragColor.r = texture2D(uSampler, vTextureCoord + red/filterArea.xy).r;
   gl_FragColor.g = texture2D(uSampler, vTextureCoord + green/filterArea.xy).g;
   gl_FragColor.b = texture2D(uSampler, vTextureCoord + blue/filterArea.xy).b;
   gl_FragColor.a = texture2D(uSampler, vTextureCoord).a;
}
`;(function(i){jo(e,i);function e(t,r,n){t===void 0&&(t=[-10,0]),r===void 0&&(r=[0,10]),n===void 0&&(n=[0,0]);var o=i.call(this,Oo,Po)||this;return o.red=t,o.green=r,o.blue=n,o}return Object.defineProperty(e.prototype,"red",{get:function(){return this.uniforms.red},set:function(t){this.uniforms.red=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"green",{get:function(){return this.uniforms.green},set:function(t){this.uniforms.green=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"blue",{get:function(){return this.uniforms.blue},set:function(t){this.uniforms.blue=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-shockwave - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-shockwave is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var ae=function(i,e){return ae=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},ae(i,e)};function Do(i,e){ae(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Ao=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Fo=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;
uniform vec4 filterClamp;

uniform vec2 center;

uniform float amplitude;
uniform float wavelength;
// uniform float power;
uniform float brightness;
uniform float speed;
uniform float radius;

uniform float time;

const float PI = 3.14159;

void main()
{
    float halfWavelength = wavelength * 0.5 / filterArea.x;
    float maxRadius = radius / filterArea.x;
    float currentRadius = time * speed / filterArea.x;

    float fade = 1.0;

    if (maxRadius > 0.0) {
        if (currentRadius > maxRadius) {
            gl_FragColor = texture2D(uSampler, vTextureCoord);
            return;
        }
        fade = 1.0 - pow(currentRadius / maxRadius, 2.0);
    }

    vec2 dir = vec2(vTextureCoord - center / filterArea.xy);
    dir.y *= filterArea.y / filterArea.x;
    float dist = length(dir);

    if (dist <= 0.0 || dist < currentRadius - halfWavelength || dist > currentRadius + halfWavelength) {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
        return;
    }

    vec2 diffUV = normalize(dir);

    float diff = (dist - currentRadius) / halfWavelength;

    float p = 1.0 - pow(abs(diff), 2.0);

    // float powDiff = diff * pow(p, 2.0) * ( amplitude * fade );
    float powDiff = 1.25 * sin(diff * PI) * p * ( amplitude * fade );

    vec2 offset = diffUV * powDiff / filterArea.xy;

    // Do clamp :
    vec2 coord = vTextureCoord + offset;
    vec2 clampedCoord = clamp(coord, filterClamp.xy, filterClamp.zw);
    vec4 color = texture2D(uSampler, clampedCoord);
    if (coord != clampedCoord) {
        color *= max(0.0, 1.0 - length(coord - clampedCoord));
    }

    // No clamp :
    // gl_FragColor = texture2D(uSampler, vTextureCoord + offset);

    color.rgb *= 1.0 + (brightness - 1.0) * p * fade;

    gl_FragColor = color;
}
`;(function(i){Do(e,i);function e(t,r,n){t===void 0&&(t=[0,0]),n===void 0&&(n=0);var o=i.call(this,Ao,Fo)||this;return o.center=t,Object.assign(o,e.defaults,r),o.time=n,o}return e.prototype.apply=function(t,r,n,o){this.uniforms.time=this.time,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"center",{get:function(){return this.uniforms.center},set:function(t){this.uniforms.center=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"amplitude",{get:function(){return this.uniforms.amplitude},set:function(t){this.uniforms.amplitude=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"wavelength",{get:function(){return this.uniforms.wavelength},set:function(t){this.uniforms.wavelength=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"brightness",{get:function(){return this.uniforms.brightness},set:function(t){this.uniforms.brightness=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"speed",{get:function(){return this.uniforms.speed},set:function(t){this.uniforms.speed=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"radius",{get:function(){return this.uniforms.radius},set:function(t){this.uniforms.radius=t},enumerable:!1,configurable:!0}),e.defaults={amplitude:30,wavelength:160,brightness:1,speed:500,radius:-1},e})(j);/*!
 * @pixi/filter-simple-lightmap - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-simple-lightmap is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var ce=function(i,e){return ce=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},ce(i,e)};function zo(i,e){ce(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Mo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Io=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform sampler2D uLightmap;
uniform vec4 filterArea;
uniform vec2 dimensions;
uniform vec4 ambientColor;
void main() {
    vec4 diffuseColor = texture2D(uSampler, vTextureCoord);
    vec2 lightCoord = (vTextureCoord * filterArea.xy) / dimensions;
    vec4 light = texture2D(uLightmap, lightCoord);
    vec3 ambient = ambientColor.rgb * ambientColor.a;
    vec3 intensity = ambient + light.rgb;
    vec3 finalColor = diffuseColor.rgb * intensity;
    gl_FragColor = vec4(finalColor, diffuseColor.a);
}
`;(function(i){zo(e,i);function e(t,r,n){r===void 0&&(r=0),n===void 0&&(n=1);var o=i.call(this,Mo,Io)||this;return o._color=0,o.uniforms.dimensions=new Float32Array(2),o.uniforms.ambientColor=new Float32Array([0,0,0,n]),o.texture=t,o.color=r,o}return e.prototype.apply=function(t,r,n,o){var s,a;this.uniforms.dimensions[0]=(s=r.filterFrame)===null||s===void 0?void 0:s.width,this.uniforms.dimensions[1]=(a=r.filterFrame)===null||a===void 0?void 0:a.height,t.applyFilter(this,r,n,o)},Object.defineProperty(e.prototype,"texture",{get:function(){return this.uniforms.uLightmap},set:function(t){this.uniforms.uLightmap=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"color",{get:function(){return this._color},set:function(t){var r=this.uniforms.ambientColor;typeof t=="number"?(X(t,r),this._color=t):(r[0]=t[0],r[1]=t[1],r[2]=t[2],r[3]=t[3],this._color=q(r))},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"alpha",{get:function(){return this.uniforms.ambientColor[3]},set:function(t){this.uniforms.ambientColor[3]=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-tilt-shift - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-tilt-shift is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var le=function(i,e){return le=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},le(i,e)};function Ft(i,e){le(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Lo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Ro=`varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform float blur;
uniform float gradientBlur;
uniform vec2 start;
uniform vec2 end;
uniform vec2 delta;
uniform vec2 texSize;

float random(vec3 scale, float seed)
{
    return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
}

void main(void)
{
    vec4 color = vec4(0.0);
    float total = 0.0;

    float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);
    vec2 normal = normalize(vec2(start.y - end.y, end.x - start.x));
    float radius = smoothstep(0.0, 1.0, abs(dot(vTextureCoord * texSize - start, normal)) / gradientBlur) * blur;

    for (float t = -30.0; t <= 30.0; t++)
    {
        float percent = (t + offset - 0.5) / 30.0;
        float weight = 1.0 - abs(percent);
        vec4 sample = texture2D(uSampler, vTextureCoord + delta / texSize * percent * radius);
        sample.rgb *= sample.a;
        color += sample * weight;
        total += weight;
    }

    color /= total;
    color.rgb /= color.a + 0.00001;

    gl_FragColor = color;
}
`,He=function(i){Ft(e,i);function e(t,r,n,o){t===void 0&&(t=100),r===void 0&&(r=600);var s=i.call(this,Lo,Ro)||this;return s.uniforms.blur=t,s.uniforms.gradientBlur=r,s.uniforms.start=n||new S(0,window.innerHeight/2),s.uniforms.end=o||new S(600,window.innerHeight/2),s.uniforms.delta=new S(30,30),s.uniforms.texSize=new S(window.innerWidth,window.innerHeight),s.updateDelta(),s}return e.prototype.updateDelta=function(){this.uniforms.delta.x=0,this.uniforms.delta.y=0},Object.defineProperty(e.prototype,"blur",{get:function(){return this.uniforms.blur},set:function(t){this.uniforms.blur=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"gradientBlur",{get:function(){return this.uniforms.gradientBlur},set:function(t){this.uniforms.gradientBlur=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"start",{get:function(){return this.uniforms.start},set:function(t){this.uniforms.start=t,this.updateDelta()},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"end",{get:function(){return this.uniforms.end},set:function(t){this.uniforms.end=t,this.updateDelta()},enumerable:!1,configurable:!0}),e}(j),$o=function(i){Ft(e,i);function e(){return i!==null&&i.apply(this,arguments)||this}return e.prototype.updateDelta=function(){var t=this.uniforms.end.x-this.uniforms.start.x,r=this.uniforms.end.y-this.uniforms.start.y,n=Math.sqrt(t*t+r*r);this.uniforms.delta.x=t/n,this.uniforms.delta.y=r/n},e}(He),Vo=function(i){Ft(e,i);function e(){return i!==null&&i.apply(this,arguments)||this}return e.prototype.updateDelta=function(){var t=this.uniforms.end.x-this.uniforms.start.x,r=this.uniforms.end.y-this.uniforms.start.y,n=Math.sqrt(t*t+r*r);this.uniforms.delta.x=-r/n,this.uniforms.delta.y=t/n},e}(He);(function(i){Ft(e,i);function e(t,r,n,o){t===void 0&&(t=100),r===void 0&&(r=600);var s=i.call(this)||this;return s.tiltShiftXFilter=new $o(t,r,n,o),s.tiltShiftYFilter=new Vo(t,r,n,o),s}return e.prototype.apply=function(t,r,n,o){var s=t.getFilterTexture();this.tiltShiftXFilter.apply(t,r,s,1),this.tiltShiftYFilter.apply(t,s,n,o),t.returnFilterTexture(s)},Object.defineProperty(e.prototype,"blur",{get:function(){return this.tiltShiftXFilter.blur},set:function(t){this.tiltShiftXFilter.blur=this.tiltShiftYFilter.blur=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"gradientBlur",{get:function(){return this.tiltShiftXFilter.gradientBlur},set:function(t){this.tiltShiftXFilter.gradientBlur=this.tiltShiftYFilter.gradientBlur=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"start",{get:function(){return this.tiltShiftXFilter.start},set:function(t){this.tiltShiftXFilter.start=this.tiltShiftYFilter.start=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"end",{get:function(){return this.tiltShiftXFilter.end},set:function(t){this.tiltShiftXFilter.end=this.tiltShiftYFilter.end=t},enumerable:!1,configurable:!0}),e})(j);/*!
 * @pixi/filter-twist - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-twist is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var ue=function(i,e){return ue=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},ue(i,e)};function ko(i,e){ue(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}var Eo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Bo=`varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform float radius;
uniform float angle;
uniform vec2 offset;
uniform vec4 filterArea;

vec2 mapCoord( vec2 coord )
{
    coord *= filterArea.xy;
    coord += filterArea.zw;

    return coord;
}

vec2 unmapCoord( vec2 coord )
{
    coord -= filterArea.zw;
    coord /= filterArea.xy;

    return coord;
}

vec2 twist(vec2 coord)
{
    coord -= offset;

    float dist = length(coord);

    if (dist < radius)
    {
        float ratioDist = (radius - dist) / radius;
        float angleMod = ratioDist * ratioDist * angle;
        float s = sin(angleMod);
        float c = cos(angleMod);
        coord = vec2(coord.x * c - coord.y * s, coord.x * s + coord.y * c);
    }

    coord += offset;

    return coord;
}

void main(void)
{

    vec2 coord = mapCoord(vTextureCoord);

    coord = twist(coord);

    coord = unmapCoord(coord);

    gl_FragColor = texture2D(uSampler, coord );

}
`;(function(i){ko(e,i);function e(t){var r=i.call(this,Eo,Bo)||this;return Object.assign(r,e.defaults,t),r}return Object.defineProperty(e.prototype,"offset",{get:function(){return this.uniforms.offset},set:function(t){this.uniforms.offset=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"radius",{get:function(){return this.uniforms.radius},set:function(t){this.uniforms.radius=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"angle",{get:function(){return this.uniforms.angle},set:function(t){this.uniforms.angle=t},enumerable:!1,configurable:!0}),e.defaults={radius:200,angle:4,padding:20,offset:new S},e})(j);/*!
 * @pixi/filter-zoom-blur - v4.1.5
 * Compiled Wed, 29 Sep 2021 14:05:57 UTC
 *
 * @pixi/filter-zoom-blur is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var fe=function(i,e){return fe=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,r){t.__proto__=r}||function(t,r){for(var n in r)Object.prototype.hasOwnProperty.call(r,n)&&(t[n]=r[n])},fe(i,e)};function No(i,e){fe(i,e);function t(){this.constructor=i}i.prototype=e===null?Object.create(e):(t.prototype=e.prototype,new t)}function qo(i,e){var t={};for(var r in i)Object.prototype.hasOwnProperty.call(i,r)&&e.indexOf(r)<0&&(t[r]=i[r]);if(i!=null&&typeof Object.getOwnPropertySymbols=="function")for(var n=0,r=Object.getOwnPropertySymbols(i);n<r.length;n++)e.indexOf(r[n])<0&&Object.prototype.propertyIsEnumerable.call(i,r[n])&&(t[r[n]]=i[r[n]]);return t}var Xo=`attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void)
{
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}`,Go=`varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;

uniform vec2 uCenter;
uniform float uStrength;
uniform float uInnerRadius;
uniform float uRadius;

const float MAX_KERNEL_SIZE = \${maxKernelSize};

// author: http://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/
highp float rand(vec2 co, float seed) {
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;
    highp float dt = dot(co + seed, vec2(a, b)), sn = mod(dt, 3.14159);
    return fract(sin(sn) * c + seed);
}

void main() {

    float minGradient = uInnerRadius * 0.3;
    float innerRadius = (uInnerRadius + minGradient * 0.5) / filterArea.x;

    float gradient = uRadius * 0.3;
    float radius = (uRadius - gradient * 0.5) / filterArea.x;

    float countLimit = MAX_KERNEL_SIZE;

    vec2 dir = vec2(uCenter.xy / filterArea.xy - vTextureCoord);
    float dist = length(vec2(dir.x, dir.y * filterArea.y / filterArea.x));

    float strength = uStrength;

    float delta = 0.0;
    float gap;
    if (dist < innerRadius) {
        delta = innerRadius - dist;
        gap = minGradient;
    } else if (radius >= 0.0 && dist > radius) { // radius < 0 means it's infinity
        delta = dist - radius;
        gap = gradient;
    }

    if (delta > 0.0) {
        float normalCount = gap / filterArea.x;
        delta = (normalCount - delta) / normalCount;
        countLimit *= delta;
        strength *= delta;
        if (countLimit < 1.0)
        {
            gl_FragColor = texture2D(uSampler, vTextureCoord);
            return;
        }
    }

    // randomize the lookup values to hide the fixed number of samples
    float offset = rand(vTextureCoord, 0.0);

    float total = 0.0;
    vec4 color = vec4(0.0);

    dir *= strength;

    for (float t = 0.0; t < MAX_KERNEL_SIZE; t++) {
        float percent = (t + offset) / MAX_KERNEL_SIZE;
        float weight = 4.0 * (percent - percent * percent);
        vec2 p = vTextureCoord + dir * percent;
        vec4 sample = texture2D(uSampler, p);

        // switch to pre-multiplied alpha to correctly blur transparent images
        // sample.rgb *= sample.a;

        color += sample * weight;
        total += weight;

        if (t > countLimit){
            break;
        }
    }

    color /= total;
    // switch back from pre-multiplied alpha
    // color.rgb /= color.a + 0.00001;

    gl_FragColor = color;
}
`;(function(i){No(e,i);function e(t){var r=this,n=Object.assign(e.defaults,t),o=n.maxKernelSize,s=qo(n,["maxKernelSize"]);return r=i.call(this,Xo,Go.replace("${maxKernelSize}",o.toFixed(1)))||this,Object.assign(r,s),r}return Object.defineProperty(e.prototype,"center",{get:function(){return this.uniforms.uCenter},set:function(t){this.uniforms.uCenter=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"strength",{get:function(){return this.uniforms.uStrength},set:function(t){this.uniforms.uStrength=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"innerRadius",{get:function(){return this.uniforms.uInnerRadius},set:function(t){this.uniforms.uInnerRadius=t},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"radius",{get:function(){return this.uniforms.uRadius},set:function(t){(t<0||t===1/0)&&(t=-1),this.uniforms.uRadius=t},enumerable:!1,configurable:!0}),e.defaults={strength:.1,center:[0,0],innerRadius:0,radius:-1,maxKernelSize:32},e})(j);const he=new yo(2,0);function Uo(i){const e=new F,t=Qo(i);let r=0;i.ticker.add(l=>{r+=l,t.rotation=r*.1});const n=new F;n.scale.y=.3,n.position.set(i.screen.width*3/8,i.screen.height/2);const o=Yo();i.ticker.add(()=>{o.rotation=r*.1});const s=Wo(),a=new F;a.rotation=Math.PI/4;const c=new F;c.scale.y=.5;const u=Ko();return u.rotation=Math.PI/4*3,i.ticker.add(()=>{u.position.set(Math.cos(r*.005)*100,Math.sin(r*.005)*100)}),a.addChild(s),c.addChild(a),e.addChild(c),e.addChild(n),e}function Wo(){const i=new We;i.lineStyle(1,16777215,.4);const e=Math.sqrt(32*32+32*32);i.position.set(e,0);for(let t=0;t<=25;t++){const r=t*e;i.moveTo(0,r),i.lineTo(e*25,r),i.moveTo(r,0),i.lineTo(r,e*25)}return i}function Ko(){const i=new $(Y.from("./eggHead.png"));return i.anchor.set(.5,1),i.proj.affine=L.AXIS_X,i.scale.set(.5,.5),i.filters=[he],i}function Yo(){const i=new $(Y.from("./flowerTop.png"));return i.anchor.set(.5,1),i.proj.affine=L.AXIS_X,i}function Qo(i){const e=new $(Y.from("./flowerTop.png"));return e.anchor.set(.5,1),e.proj.affine=L.AXIS_X,e.position.set(i.screen.width*1/8,i.screen.height/2),e}function Ho(i){const{pointerstart$:e,pointermove$:t,pointerend$:r}=Zo(i);return e.pipe(br(t.pipe(je(n=>[n.x,n.y]),yr(),je(([n,o])=>[n[0]-o[0],n[1]-o[1]]),vr(r))))}function Zo(i){const e=dt(i,"pointerdown").pipe(_r(o=>{o.preventDefault(),o.stopPropagation()})),t=dt(document,"pointermove"),r=dt(document,"pointerup"),n=dt(document,"pointerup");return{pointerstart$:e,pointermove$:t,pointerend$:xr(r,n)}}const ht=new S(500,500),Le=new Zn({distance:15,outerStrength:4,innerStrength:0,color:16777215,quality:.5});var Jo="https://sonystone.github.io/app-game/assets/rottentower.ebd95fdd.png",ti="https://sonystone.github.io/app-game/assets/house_1.0c883d1b.png";function li(){const i=new lr({width:window.document.body.clientWidth,height:window.document.body.clientHeight,backgroundColor:1087931,resolution:window.devicePixelRatio||1});console.log("app",i);const e=gr();window.onresize=()=>{console.log("W.H",window.document.body.clientWidth,window.document.body.clientHeight),console.log("resolution",i.renderer.resolution),e.begin(),i.renderer.resize(window.document.body.clientWidth,window.document.body.clientHeight),e.end()};const t=new F;i.stage.addChild(t);const r=N.from(Jo);r.position.set(0,0),r.scale.set(.5);function n(){r.filters=[he,Le]}function o(){r.filters=[he]}r.interactive=!0,r.on("pointerover",n).on("pointerout",o),o();const s=new ur;async function a(){const l=await new Promise(h=>{s.add("map",Oe.map).add("tiles",Oe.tiles).load(async(p,d)=>h(await ei(d)))});l.position.set(0,0),l.addChild(r),t.addChild(l),t.addChild(Uo(i)),t.addChild(Cr(i,t,e));{const h=N.from(ti);h.position.set(350,250),h.scale.set(.3),l.addChild(h),h.interactive=!0,h.on("pointerover",()=>{h.filters=[Le]}).on("pointerout",()=>{h.filters=[]})}}a(),t.position.copyFrom(ht);const c=Ho(window.document.body).subscribe(([l,h])=>{e.begin(),ht.set(ht.x-l,ht.y-h),t.position.copyFrom(ht),e.end()}),u=dt(window,"wheel").subscribe(l=>{l.deltaY<0?t.scale.set(t.scale.x*1.25,t.scale.y*1.25):t.scale.set(t.scale.x/1.25,t.scale.y/1.25)});return Ze(()=>{i.stop(),i.destroy(),fr(),c.unsubscribe(),u.unsubscribe(),window.onresize=null}),Je(()=>i.view)}async function ei({map:i,tiles:e}){const t=i.data,r=t.tilewidth,n=t.tileheight,o=r/2,s=n/2,a=t.layers[0].data,c=t.layers[0].width,u=t.layers[0].height;let l=0;const h=new hr(e.texture,t.spritesheet);await new Promise(f=>h.parse(f));const p=new F,d=new We;d.lineStyle(1,12320767,.4);for(let f=0;f<u;f++)for(let m=0;m<c;m++){const y=a[l]-1,_=(m-f)*o,x=(m+f)*s,b=new N(h.textures[y]);b.x=_,b.y=x,p.addChild(b),l++}return p.addChild(d),p}export{li as default};
