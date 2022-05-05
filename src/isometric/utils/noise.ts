const PERLIN_YWRAPB = 4;
const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB = 8;
const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
const PERLIN_SIZE = 4095;

var perlin_octaves = 4;
var perlin_amp_falloff = .5;

const scaled_cosine = (P: any) => .5 * (1-Math.cos(P * Math.PI));
var perlin: any;

export function noise(P: any, R = 0, I = 0) {

  if (null == perlin) {

    perlin = new Array(PERLIN_SIZE + 1);

    for(let P = 0; P < PERLIN_SIZE + 1; P++) {
      perlin[P] = Math.random();
    }
  }

  P < 0 && (P = -P);
  R < 0 && (R = -R);
  I < 0 && (I = -I);
  
  let E;
  let _a;
  let e;
  let l;
  let n;
  let r=Math.floor(P);
  let L=Math.floor(R);
  let N=Math.floor(I);
  let i=P-r;
  let o=R-L;
  let a=I-N;
  let p=0;
  let t=.5;

  for(let P=0; P < perlin_octaves; P++){
    let P = r + (L << PERLIN_YWRAPB) + (N<<PERLIN_ZWRAPB);

    E = scaled_cosine(i);
    _a = scaled_cosine(o);

    e = perlin[P & PERLIN_SIZE];
    e += E * (perlin[P + 1 & PERLIN_SIZE] - e);
    l = perlin[P + PERLIN_YWRAP&PERLIN_SIZE];
    e += _a * ((l += E * (perlin[P + PERLIN_YWRAP + 1 & PERLIN_SIZE] - l)) - e);
    l = perlin[(P += PERLIN_ZWRAP) & PERLIN_SIZE];
    l += E * (perlin[P + 1 & PERLIN_SIZE] - l);
    n = perlin[P + PERLIN_YWRAP & PERLIN_SIZE];
    l += _a * ((n += E * (perlin[P + PERLIN_YWRAP + 1 & PERLIN_SIZE] - n)) - l);
    p += (e += scaled_cosine(a) * (l - e)) * t;
    t *= perlin_amp_falloff;

    r <<= 1;
    L <<= 1;
    N <<= 1;

    (i *= 2) >=1 && (r++, i--);
    (o *= 2) >=1 && (L++, o--);
    (a *= 2) >=1 && (N++, a--);
  }
  return p
}
