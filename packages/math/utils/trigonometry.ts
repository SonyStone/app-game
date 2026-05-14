import { DEG_TO_RAD, RAD_TO_DEG } from '../constants';
import { Degrees, Radians } from '../types';

export const degToRad = (degrees: Degrees): Radians => (degrees * DEG_TO_RAD) as Radians;

export const radToDeg = (radians: Radians): Degrees => (radians * RAD_TO_DEG) as Degrees;
