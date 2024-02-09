import { DEG_TO_RAD, PI, PI_2, RAD_TO_DEG } from './constants';
import * as m3 from './m3';
import * as m4 from './m4';
import * as spherical from './spherical';
import { clamp } from './utils/clamp';
import { NumberArrayConstructor } from './utils/type-array';
import * as v2 from './v2';
import * as v3 from './v3';
import * as v4 from './v4';

const Vec3 = v3.Builder(Float32Array);

export { m3, m4, v2, v3, v4, spherical, PI, PI_2, DEG_TO_RAD, RAD_TO_DEG, clamp, Vec3, type NumberArrayConstructor };
